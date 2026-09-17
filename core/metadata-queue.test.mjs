
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateQueueMetadata,approveQueueMetadata,draftTopicKey} from './metadata-queue.mjs';
import crypto from 'node:crypto';
import {generateMetadataSuggestions,originalFilenameLabel,metadataRevision} from './metadata-suggestions.mjs';
import {hashFile} from './draft-intake.mjs';
const draft=id=>({short_id:id,batch_id:'INTAKE-NEW',file_hash:id.repeat(64),status:'AWAITING_METADATA',original_filename:'Wait For Me - Hadestown - Broadway ('+id+').mp4',public_title:'',description:'',youtube_tags:''});
const candidate=title=>({title,description:'My singing cover of Wait For Me from Hadestown.',tags:['Hadestown','cover']});
const generate=({row,avoidTitles})=>generateMetadataSuggestions({row,avoidTitles,model:'local',fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({suggestions:[candidate(row.short_id==='1'?'Singing Hadestown tonight':'singing Hadestown has me yearning again')]})}}]})})});
async function fixture(t){
 const outputDir=await fs.mkdtemp(path.join(os.tmpdir(),'queue-metadata-'));t.after(()=>fs.rm(outputDir,{recursive:true,force:true}));
 const rows=[draft('1'),draft('2')];let commits=0;
 const repository={read:async()=>structuredClone(rows),commit:async({updates})=>{commits++;for(const update of updates)Object.assign(rows.find(r=>r.short_id===update.short_id),update);}};
 return {outputDir,rows,repository,get commits(){return commits;}};
}
test('filename supplies context, bulk review commits once, shared descriptions are allowed and replay is safe',async t=>{
 const f=await fixture(t),report=await generateQueueMetadata({...f,generate});
 assert.equal(report.entries.length,2);assert.equal(f.commits,0);
 assert.equal(report.entries[0].suggestion.context.song,'Wait For Me - Hadestown - Broadway');
 const selections=report.entries.map(e=>({shortId:e.shortId}));
 await approveQueueMetadata({...f,id:report.id,selections,approved:true});
 assert.equal(f.commits,1);assert.notEqual(f.rows[0].public_title,f.rows[1].public_title);assert.equal(f.rows[0].description,f.rows[1].description);
 await approveQueueMetadata({...f,id:report.id,selections,approved:true});assert.equal(f.commits,1);
 assert.equal(originalFilenameLabel({file_name:'a'.repeat(64)+'.mp4'}),'');
});
test('duplicate title edits and stale drafts reject the whole batch before tracker writes',async t=>{
 const f=await fixture(t),report=await generateQueueMetadata({...f,generate});
 await assert.rejects(approveQueueMetadata({...f,id:report.id,approved:true,selections:report.entries.map(e=>({shortId:e.shortId,title:'Same title! #cover'}))}),/TITLE_ALREADY_USED/);
 assert.equal(f.commits,0);
 f.rows[1].description='Changed';
 await assert.rejects(approveQueueMetadata({...f,id:report.id,approved:true,selections:report.entries.map(e=>({shortId:e.shortId}))}),/STALE/);assert.equal(f.commits,0);
});
test('model duplicates are flagged, not applied or renamed with a template',async t=>{
 const f=await fixture(t);
 const repeated=options=>generateMetadataSuggestions({...options,model:'local',fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({suggestions:[candidate('How was my singing?')]})}}]})})});
 const report=await generateQueueMetadata({...f,generate:repeated});
 assert.equal(report.entries.length,1);assert.equal(report.errors.length,1);assert.match(report.errors[0].message,/RECENT_TITLE_REUSE|NO_UNIQUE_TITLE/);assert.equal(f.commits,0);
});
test('stop preserves completed suggestions for later review',async t=>{
 const f=await fixture(t);let calls=0;
 const report=await generateQueueMetadata({...f,generate:async options=>{calls++;return generate(options);},shouldStop:()=>calls===1});
 assert.equal(report.state,'STOPPED');assert.equal(report.pending,1);assert.equal(report.entries.length,1);
});



test('weekly batch limits generation to four or five drafts and leaves the rest for later',async t=>{
 const outputDir=await fs.mkdtemp(path.join(os.tmpdir(),'queue-week-'));t.after(()=>fs.rm(outputDir,{recursive:true,force:true}));
 const topics=['Arabian Nights','Arabian Nights','Arabian Nights','Hadestown','Wicked','Encanto','Hamilton'];const rows=topics.map((topic,index)=>({...draft(String(index+1)),original_filename:topic+' ('+(index+1)+').mp4'}));let calls=0;
 const repository={read:async()=>structuredClone(rows)};
 const weekly=await generateQueueMetadata({outputDir,repository,limit:4,generate:async ({row})=>{calls++;const response={ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({suggestions:[candidate('singing Short '+row.short_id)]})}}]})};return generateMetadataSuggestions({row,model:'local',context:{},fetchImpl:async()=>response});}});
 assert.equal(weekly.batchMode,'WEEK');assert.equal(weekly.requestedLimit,4);assert.equal(weekly.available,7);assert.equal(weekly.availableUnique,5);assert.equal(weekly.total,4);assert.equal(weekly.entries.length,4);assert.deepEqual(weekly.entries.map(entry=>entry.shortId),['1','4','5','6']);assert.deepEqual(new Set(weekly.entries.map(entry=>draftTopicKey(rows.find(row=>row.short_id===entry.shortId)))),new Set(['arabian nights','hadestown','wicked','encanto']));assert.equal(calls,4);
});

test('approved weekly metadata creates a queued working copy and a scoped intake batch',async t=>{
 const outputDir=await fs.mkdtemp(path.join(os.tmpdir(),'queue-stage-')),hashed=path.join(outputDir,'hashed');t.after(()=>fs.rm(outputDir,{recursive:true,force:true}));await fs.mkdir(hashed,{recursive:true});
 const rows=[];for(const [id,topic] of [['1','Arabian Nights'],['2','Hadestown']]){const temp=path.join(hashed,id+'.mp4');await fs.writeFile(temp,topic);const fileHash=await hashFile(temp),source=path.join(hashed,fileHash+'.mp4');await fs.rename(temp,source);rows.push({...draft(id),file_hash:fileHash,current_path:source,current_filename:path.basename(source),original_filename:topic+' ('+id+').mp4'});}
 const repository={read:async()=>structuredClone(rows),commit:async({updates})=>{for(const update of updates)Object.assign(rows.find(row=>row.short_id===update.short_id),update);}};
 const generate=({row})=>({id:crypto.randomUUID(),shortId:row.short_id,hash:row.file_hash,batchId:row.batch_id,revision:metadataRevision(row),model:'local',context:{song:row.original_filename.replace(/\s*\(\d+\)\.mp4$/,''),artist:'',source:'',niche:'',content_type:'singing cover snippet',fullCoverAvailable:false},missingFields:['public_title','description','youtube_tags'],candidates:[{angle_family:'PERSONALITY',title:'my cover of '+row.short_id,description:'My singing cover.',tags:['#singing','#fyp','#singer']}],defaultCandidateIndex:0});
 const report=await generateQueueMetadata({outputDir,repository,limit:2,generate});const result=await approveQueueMetadata({outputDir,repository,id:report.id,selections:report.entries.map(entry=>({shortId:entry.shortId})),approved:true});
 assert.match(result.stagedBatchId,/^INTAKE-WEEK-/);assert.equal(rows.every(row=>row.batch_id===result.stagedBatchId),true);for(const row of rows){assert.ok(row.current_path.includes(path.join('hashed','queued',report.id)));assert.equal(await hashFile(row.current_path),row.file_hash);assert.equal(await hashFile(path.join(hashed,row.file_hash+'.mp4')),row.file_hash);}
});
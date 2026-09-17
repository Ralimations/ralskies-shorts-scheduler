
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateQueueMetadata,approveQueueMetadata} from './metadata-queue.mjs';
import {generateMetadataSuggestions,originalFilenameLabel} from './metadata-suggestions.mjs';
const draft=id=>({short_id:id,batch_id:'INTAKE-NEW',file_hash:id.repeat(64),status:'AWAITING_METADATA',original_filename:'Wait For Me - Hadestown - Broadway ('+id+').mp4',public_title:'',description:'',youtube_tags:''});
const candidate=title=>({title,description:'My singing cover of Wait For Me from Hadestown.',tags:['Hadestown','cover']});
const generate=({row,avoidTitles})=>generateMetadataSuggestions({row,avoidTitles,model:'local',fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({suggestions:[candidate('Singing Hadestown take '+row.short_id)]})}}]})})});
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
 assert.equal(report.entries.length,1);assert.equal(report.errors.length,1);assert.match(report.errors[0].message,/NO_UNIQUE_TITLE/);assert.equal(f.commits,0);
});
test('stop preserves completed suggestions for later review',async t=>{
 const f=await fixture(t);let calls=0;
 const report=await generateQueueMetadata({...f,generate:async options=>{calls++;return generate(options);},shouldStop:()=>calls===1});
 assert.equal(report.state,'STOPPED');assert.equal(report.pending,1);assert.equal(report.entries.length,1);
});

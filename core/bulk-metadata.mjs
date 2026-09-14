import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadExistingBatch} from './existing-batch-service.mjs';
import {openTracker,readTracker,backupTracker,updateTrackerRows,saveTracker} from './tracker-service.mjs';
import {withPipelineLock,recordException} from './pipeline-store.mjs';
import {exportRelatedVideoActions} from './draft-intake.mjs';
import {titleIssue} from './youtube-title-validation.mjs';
export const METADATA_FIELDS=['public_title','description','youtube_tags','hashtags','related_video_id'];
const clean=v=>String(v??'').trim();
const manifestKeys={public_title:'final_public_title',description:'description',youtube_tags:'youtube_tags',hashtags:'hashtags',related_video_id:'related_video_id'};
export function metadataProblems(row){
 const issues=[],add=(field,code,message,solution)=>issues.push({field,code,message,solution});
 const title=titleIssue(row.public_title);
 if(title)add('public_title',title,'Title must contain 1–100 characters and no angle brackets.','Remove redundant hashtags or shorten the wording. Spaces and hashtags count toward the limit.');
 const description=String(row.description??'');
 if(!description.trim())add('description','DESCRIPTION_EMPTY','Description is empty.','Write a short, accurate description of this cover.');
 else if(Buffer.byteLength(description,'utf8')>5000)add('description','DESCRIPTION_TOO_LONG','Description exceeds 5,000 UTF-8 bytes.','Shorten the description; non-ASCII characters can use multiple bytes.');
 if(/[<>]/.test(description))add('description','DESCRIPTION_INVALID_CHARACTERS','Description contains an angle bracket.','Remove < and >.');
 const tags=String(row.youtube_tags??'').split(',').map(clean).filter(Boolean),tagSize=tags.join(',').length+tags.filter(tag=>tag.includes(' ')).length*2;
 if(!tags.length)add('youtube_tags','TAGS_EMPTY','No keyword tags are provided.','Add a few comma-separated song, artist and cover keywords.');
 if(tagSize>500)add('youtube_tags','TAGS_TOO_LONG','Keyword tags exceed the API limit.','Keep the combined tags within 500 characters, counting commas and quotation marks around tags with spaces.');
 if(clean(row.related_video_id)&&!/^[A-Za-z0-9_-]{11}$/.test(row.related_video_id))add('related_video_id','RELATED_VIDEO_ID_INVALID','Related video ID is invalid.','Use the 11-character video ID, not the whole URL. Related Video is set manually in Studio.');
 return issues;
}
export function shorterTitle(title){
 let result=String(title??'');
 while(result.length>100&&/\s+#[^\s#]+\s*$/.test(result))result=result.replace(/\s+#[^\s#]+\s*$/,'').trimEnd();
 return result!==title&&!titleIssue(result)?result:null;
}
export function metadataRevision(row,manifest,recovery=false){
 return crypto.createHash('sha256').update(JSON.stringify([row,manifest,recovery])).digest('hex');
}
export function assessMetadataRow({row,manifest,classification='MATCHED',recovery=false}){
 const values=Object.fromEntries(METADATA_FIELDS.map(key=>[key,String(row?.[key]??'')]));
 const sourceValues=Object.fromEntries(METADATA_FIELDS.map(key=>[key,String(manifest?.[manifestKeys[key]]??'')]));
 const differences=METADATA_FIELDS.filter(key=>values[key]!==sourceValues[key]).map(field=>({field,tracker:values[field],manifest:sourceValues[field]}));
 const problems=metadataProblems(values),manifestProblems=metadataProblems(sourceValues);
 let readonlyReason='';
 if(row&&['SCHEDULED','PUBLISHED','COMPLETE'].includes(row.status))readonlyReason='Already scheduled or published. Manage live metadata in YouTube Studio; this editor is for pending videos.';
 else if(!row||classification!=='MATCHED'||/DUPLICATE|UNRESOLVED/.test(clean(row.duplicate_disposition).toUpperCase()))readonlyReason='This row is blocked, unresolved, duplicated, or no longer eligible.';
 else if(recovery)readonlyReason='An execution needs recovery. Verify its remote state before editing metadata.';
 else if(!['BATCH_READY','PRIVATE_UPLOADED','PREPARED','AWAITING_METADATA'].includes(row.status))readonlyReason='Already scheduled or published. Manage live metadata in YouTube Studio; this editor is for pending videos.';
 return {shortId:row?.short_id||manifest?.short_id,song:row?.source_song||manifest?.song,status:row?.status||classification,values,sourceValues,problems,manifestProblems,differences,editable:!readonlyReason,readonlyReason,revision:metadataRevision(row,manifest,recovery),suggestedTitle:shorterTitle(values.public_title)};
}
async function recoveryIds(outputDir,batchId){
 const ids=new Set(),pending=new Set(['APPLYING','APPLIED','APPLIED_UNVERIFIED','VERIFYING','VERIFIED','TRACKER_UPDATING','VERIFIED_PENDING_TRACKER','RECONCILIATION_REQUIRED','UPLOADING','PRIVATE_UPLOADED','REMOTE_STATE_UNKNOWN']);
 for(const name of await fs.readdir(outputDir)){if(!/\.journal\.json$/.test(name))continue;let journal;try{journal=JSON.parse(await fs.readFile(path.join(outputDir,name),'utf8'));}catch{continue;}if((journal.batch_id||journal.batchId)!==batchId)continue;for(const row of journal.rows||[])if(pending.has(row.state))ids.add(row.short_id||row.shortId);}
 return ids;
}
export async function auditBulkMetadata(options){
 if(!/^BULK_\d+$/.test(options.batchId))throw Error('SELECT_PREPARED_BULK_BATCH');
 const batch=await loadExistingBatch(options),pending=await recoveryIds(options.outputDir,options.batchId);
 const items=batch.links.map(link=>assessMetadataRow({row:link.tracker,manifest:link.manifest,classification:link.classification,recovery:pending.has(link.tracker?.short_id)}));
 for(const item of items)for(const issue of [...item.problems,...item.manifestProblems])await recordException(options.outputDir,{code:'METADATA_CHECK_'+issue.code,file:batch.manifest.manifestPath,batchId:options.batchId,shortId:item.shortId,message:issue.message});
 return {batchId:options.batchId,manifestPath:batch.manifest.manifestPath,trackerPath:options.trackerPath,items,problemCount:items.filter(item=>item.problems.length||item.manifestProblems.length).length,differenceCount:items.filter(item=>item.differences.length).length};
}
export async function applyMetadataEdit({repository,item,revision,edits}){
 if(!item.editable)throw Error(item.readonlyReason||'METADATA_ROW_NOT_EDITABLE');
 if(revision!==item.revision)throw Error('METADATA_CHANGED: Reopen the editor before saving.');
 if(!edits||Object.keys(edits).some(key=>!METADATA_FIELDS.includes(key)))throw Error('UNSUPPORTED_METADATA_FIELD');
 const values={...item.values,...edits};
 if(METADATA_FIELDS.some(key=>typeof values[key]!=='string'))throw Error('METADATA_MUST_BE_TEXT');
 const problems=metadataProblems(values);if(problems.length)throw Error(problems.map(issue=>issue.message+' '+issue.solution).join('\n'));
 const changed=Object.fromEntries(METADATA_FIELDS.filter(key=>values[key]!==item.values[key]).map(key=>[key,values[key]]));
 if(Object.keys(changed).length)await repository.commit({short_id:item.shortId,...changed});
 return {shortId:item.shortId,fields:Object.keys(changed),remoteWrites:0};
}
export async function saveBulkMetadata(options){
 return withPipelineLock(options.outputDir,async()=>{
  const audit=await auditBulkMetadata(options),item=audit.items.find(row=>row.shortId===options.shortId);if(!item)throw Error('METADATA_ROW_NOT_FOUND');
  let backup;
  const repository={commit:async update=>{
   const tracker=await openTracker(options.trackerPath);
   backup=await backupTracker(options.trackerPath,'metadata-edit-'+crypto.randomUUID());
   await updateTrackerRows(tracker,[update]);await saveTracker(tracker);
   const saved=(await readTracker(options.trackerPath)).find(row=>row.short_id===options.shortId);
   if(!saved||Object.entries(update).some(([key,value])=>String(saved[key]??'')!==String(value)))throw Error('METADATA_SAVE_READBACK_FAILED');
  }};
  const result=await applyMetadataEdit({repository,item,revision:options.revision,edits:options.edits});
  if(result.fields.includes('related_video_id'))await exportRelatedVideoActions({rows:await readTracker(options.trackerPath),outputDir:options.outputDir});
  return {...result,backup,destination:'tracker'};
 });
}

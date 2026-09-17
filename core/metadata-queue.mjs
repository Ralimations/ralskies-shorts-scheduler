import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {readJson,writeJson,recordException,withPipelineLock} from './pipeline-store.mjs';
import {editableDraft,metadataMissing,exportRelatedVideoActions,hashFile} from './draft-intake.mjs';
import {generateMetadataSuggestions,metadataRevision,validateCandidate} from './metadata-suggestions.mjs';
import {titleKey,assertUniqueTitle} from './title-identity.mjs';
import {retrieveCreativeMemory,recordGeneration,recordApproval} from './creative-memory.mjs';
const clean=v=>String(v??'').trim();
export function draftTopicKey(row={}) {
  const source=clean(row.source_song)||clean(row.original_filename||row.file_name)||clean(row.short_id);
  return source.normalize('NFKC').replace(/\.[a-z0-9]{2,5}$/i,'').replace(/\s*(?:\(\s*\d+\s*\)|[-_]\s*(?:clip\s*)?\d+)\s*$/i,'').replace(/\s+/g,' ').trim().toLowerCase();
}
function selectWeeklyTargets(rows,limit) {
  const selected=[],seen=new Set();
  for(const row of rows) {
    const key=draftTopicKey(row)||clean(row.short_id);
    if(seen.has(key))continue;
    seen.add(key);selected.push(row);if(selected.length>=limit)break;
  }
  return selected;
}
async function stageQueueMedia({outputDir,reportId,rows}) {
  const journalPath=path.join(outputDir,'metadata-queue-staging',reportId+'.json');
  const journal=await readJson(journalPath,{reportId,state:'COPYING',entries:[]});
  const staged=new Map();
  for(const row of rows) {
    const source=path.resolve(clean(row.current_path));
    const hash=clean(row.file_hash).toUpperCase();
    if(!/^[A-F0-9]{64}$/.test(hash))throw Error('WEEKLY_STAGE_IDENTITY_INVALID:'+clean(row.short_id));
    const hashRoot=path.dirname(source),destination=path.join(hashRoot,'queued',reportId,hash+'.mp4');
    await fs.mkdir(path.dirname(destination),{recursive:true});
    let sourceExists=true;try{await fs.stat(source);}catch(error){if(error.code==='ENOENT')sourceExists=false;else throw error;}
    if(sourceExists&&await hashFile(source)!==hash)throw Error('WEEKLY_STAGE_SOURCE_HASH_MISMATCH:'+clean(row.short_id));
    let destinationExists=true;try{await fs.stat(destination);}catch(error){if(error.code==='ENOENT')destinationExists=false;else throw error;}
    if(destinationExists&&await hashFile(destination)!==hash)throw Error('WEEKLY_STAGE_DESTINATION_COLLISION:'+clean(row.short_id));
    if(!destinationExists){if(!sourceExists)throw Error('WEEKLY_STAGE_SOURCE_MISSING:'+clean(row.short_id));await fs.copyFile(source,destination);if(await hashFile(destination)!==hash)throw Error('WEEKLY_STAGE_COPY_HASH_MISMATCH:'+clean(row.short_id));}
    const entry={shortId:clean(row.short_id),source,destination,hash,state:'COPIED'};journal.entries=journal.entries.filter(item=>item.shortId!==entry.shortId).concat(entry);await writeJson(journalPath,journal);staged.set(entry.shortId,entry);
  }
  journal.state='COPIED';await writeJson(journalPath,journal);return {journalPath,staged};
}
function queuePath(outputDir,id) {
  if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('INVALID_METADATA_QUEUE_ID');
  return path.join(outputDir,'metadata-queues',id+'.json');
}
export async function latestMetadataQueue(outputDir) {
  const pointer=await readJson(path.join(outputDir,'metadata-queue-latest.json'),null);
  return pointer?readJson(queuePath(outputDir,pointer.id),null):null;
}
export async function generateQueueMetadata({outputDir,repository,config,generate=generateMetadataSuggestions,shouldStop=()=>false,onProgress=()=>{},limit=null}={}) {
  const rows=await repository.read(),allTargets=rows.filter(row=>editableDraft(row)&&['public_title','description','youtube_tags'].some(key=>!clean(row[key])));
  const requestedLimit=limit==null?null:Number(limit);if(requestedLimit!==null&&(!Number.isInteger(requestedLimit)||requestedLimit<1))throw Error('INVALID_METADATA_BATCH_LIMIT');const targets=requestedLimit===null?allTargets:selectWeeklyTargets(allTargets,requestedLimit);const report={id:crypto.randomUUID(),state:'GENERATING',batchMode:requestedLimit===null?'ALL':'WEEK',requestedLimit,createdAt:new Date().toISOString(),total:targets.length,available:allTargets.length,availableUnique:requestedLimit===null?undefined:new Set(allTargets.map(draftTopicKey)).size,entries:[],errors:[],skipped:rows.filter(editableDraft).length-targets.length};
  const file=queuePath(outputDir,report.id);
  await writeJson(file,report);await writeJson(path.join(outputDir,'metadata-queue-latest.json'),{id:report.id});
  const used=rows.map(row=>clean(row.public_title)).filter(Boolean);
  for(const row of targets) {
    if(shouldStop())break;
    try {
      const rag=await retrieveCreativeMemory(outputDir,{song:row.source_song,source:row.source_show||row.source,artist:row.artist_or_fandom,niche:row.niche,contentType:row.content_type});
      const suggestion=await generate({...config,row,context:{},ragContext:rag,avoidTitles:[...used,...(rag.recent_titles||[]).map(item=>item.title).filter(Boolean)]});
      const key=titleKey(row.public_title||suggestion.candidates[0]?.title);
      if(!clean(row.public_title)&&used.some(title=>titleKey(title)===key))throw Error('TITLE_ALREADY_USED');
      report.entries.push({shortId:row.short_id,filename:row.original_filename||row.file_name,suggestion});
      await recordGeneration(outputDir,suggestion);
      used.push(row.public_title||suggestion.candidates[0].title);
    } catch(error) {
      report.errors.push({shortId:row.short_id,filename:row.original_filename||row.file_name,message:error.message});
      await recordException(outputDir,{code:'DRAFT_METADATA_QUEUE_ROW_FAILED',shortId:row.short_id,message:error.message});
      if(/UNREACHABLE|HTTP_401|HTTP_403|SELECT_LM_STUDIO_MODEL/.test(error.message))break;
    }
    await writeJson(file,report);
    onProgress({id:report.id,total:report.total,completed:report.entries.length,failed:report.errors.length,current:row.original_filename||row.file_name});
  }
  report.pending=report.total-report.entries.length-report.errors.length;
  report.state=report.pending?'STOPPED':'REVIEW_REQUIRED';
  await writeJson(file,report);return report;
}
export async function approveQueueMetadata({outputDir,repository,id,selections=[],approved=false}) {
  if(approved!==true)throw Error('METADATA_APPROVAL_REQUIRED');
  return withPipelineLock(outputDir,async()=>{
    const file=queuePath(outputDir,id),report=await readJson(file);
    if(report.state==='APPROVED')return {applied:report.entries.length,alreadyApplied:true};
    if(!['REVIEW_REQUIRED','STOPPED','APPLYING'].includes(report.state))throw Error('QUEUE_NOT_READY_FOR_REVIEW');
    const rows=await repository.read();
    if(report.state==='APPLYING') {
      const matches=(report.updates||[]).every(update=>{const row=rows.find(r=>r.short_id===update.short_id);return row&&Object.entries(update).every(([key,v])=>String(row[key]??'')===String(v??''));});
      if(!matches)throw Error('METADATA_QUEUE_RECOVERY_REQUIRED');
      report.state='APPROVED';await writeJson(file,report);return {applied:report.updates.length,alreadyApplied:true};
    }
    if(!report.entries.length)throw Error('NO_METADATA_TO_APPLY');
    if(selections.length!==report.entries.length||new Set(selections.map(s=>s.shortId)).size!==selections.length)throw Error('REVIEW_ALL_QUEUE_ENTRIES');
    const updates=[],proposedRows=structuredClone(rows);
    for(const entry of report.entries) {
      const row=rows.find(r=>r.short_id===entry.shortId),suggestion=entry.suggestion,choice=selections.find(s=>s.shortId===entry.shortId);
      if(!row||!editableDraft(row)||row.file_hash!==suggestion.hash||metadataRevision(row)!==suggestion.revision)throw Error('METADATA_SUGGESTION_STALE:'+entry.shortId);
      const candidate=suggestion.candidates[choice?.candidateIndex??0];
      if(!candidate)throw Error('SELECT_METADATA_SUGGESTION');
      const values={public_title:row.public_title||choice?.title||candidate.title,description:row.description||candidate.description,youtube_tags:row.youtube_tags||candidate.tags.join(', ')};
      validateCandidate({title:values.public_title,description:values.description,tags:values.youtube_tags.split(',').map(clean).filter(Boolean)});
      assertUniqueTitle(proposedRows,row.short_id,values.public_title);
      const update={short_id:row.short_id,...Object.fromEntries(suggestion.missingFields.filter(k=>!clean(row[k])).map(k=>[k,values[k]]))};
      if(!row.category)update.category='Music';
      if(!row.source_song){update.source_song=suggestion.context.song;if(row.schedule_policy==='four-per-week')Object.assign(update,{scheduled_date:'',scheduled_time:'',posting_slot:'',schedule_order:'',schedule_policy:''});}
      if(!row.artist_or_fandom&&suggestion.context.artist)update.artist_or_fandom=suggestion.context.artist;
      const merged={...row,...update},missing=metadataMissing(merged);
      Object.assign(update,{metadata_state:missing.length?'AWAITING_METADATA':'METADATA_READY',status:row.youtube_video_id?'PRIVATE_UPLOADED':missing.length?'AWAITING_METADATA':'BATCH_READY'});
      updates.push(update);Object.assign(proposedRows.find(r=>r.short_id===row.short_id),update);
    }
     const stageRows=rows.filter(row=>report.entries.some(entry=>entry.shortId===row.short_id)&&clean(row.current_path));
     const stagedMedia=stageRows.length?await stageQueueMedia({outputDir,reportId:report.id,rows:stageRows}):null;
     if(stagedMedia?.staged.size){const stagedBatchId='INTAKE-WEEK-'+report.id;for(const update of updates){const staged=stagedMedia.staged.get(update.short_id);if(staged)Object.assign(update,{batch_id:stagedBatchId,current_path:staged.destination,current_filename:path.basename(staged.destination)});}report.stagedBatchId=stagedBatchId;report.staging={folder:path.dirname([...stagedMedia.staged.values()][0].destination),files:[...stagedMedia.staged.values()].map(item=>({shortId:item.shortId,source:item.source,destination:item.destination,hash:item.hash}))};}
     report.state='APPLYING';report.updates=updates;await writeJson(file,report);
     if(stagedMedia){const journal=await readJson(stagedMedia.journalPath,{entries:[]});journal.state='TRACKER_UPDATED';await writeJson(stagedMedia.journalPath,journal);}
    await repository.commit({updates});
    for(const entry of report.entries){const row=rows.find(item=>item.short_id===entry.shortId),choice=selections.find(item=>item.shortId===entry.shortId),candidate=entry.suggestion.candidates[choice?.candidateIndex??entry.suggestion.defaultCandidateIndex??0],update=updates.find(item=>item.short_id===entry.shortId);await recordApproval(outputDir,{suggestion:entry.suggestion,candidateIndex:choice?.candidateIndex??entry.suggestion.defaultCandidateIndex??0,approvedTitle:update.public_title||row.public_title||candidate.title,approvedDescription:update.description||row.description||candidate.description,approvedHashtags:(update.youtube_tags||row.youtube_tags||candidate.tags.join(', ')).split(',').map(clean).filter(Boolean)});}
    report.state='APPROVED';report.approvedAt=new Date().toISOString();await writeJson(file,report);
    await exportRelatedVideoActions({rows:await repository.read(),outputDir});
    return {applied:updates.length,stagedBatchId:report.stagedBatchId||null,queuedFolder:report.staging?.folder||null};
  });
}
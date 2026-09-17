import crypto from 'node:crypto';
import path from 'node:path';
import {readJson,writeJson,recordException,withPipelineLock} from './pipeline-store.mjs';
import {editableDraft,metadataMissing,exportRelatedVideoActions} from './draft-intake.mjs';
import {generateMetadataSuggestions,metadataRevision,validateCandidate} from './metadata-suggestions.mjs';
import {titleKey,assertUniqueTitle} from './title-identity.mjs';
import {retrieveCreativeMemory,recordGeneration,recordApproval} from './creative-memory.mjs';
const clean=v=>String(v??'').trim();
function queuePath(outputDir,id) {
  if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('INVALID_METADATA_QUEUE_ID');
  return path.join(outputDir,'metadata-queues',id+'.json');
}
export async function latestMetadataQueue(outputDir) {
  const pointer=await readJson(path.join(outputDir,'metadata-queue-latest.json'),null);
  return pointer?readJson(queuePath(outputDir,pointer.id),null):null;
}
export async function generateQueueMetadata({outputDir,repository,config,generate=generateMetadataSuggestions,shouldStop=()=>false,onProgress=()=>{}}) {
  const rows=await repository.read(),targets=rows.filter(row=>editableDraft(row)&&['public_title','description','youtube_tags'].some(key=>!clean(row[key])));
  const report={id:crypto.randomUUID(),state:'GENERATING',createdAt:new Date().toISOString(),total:targets.length,entries:[],errors:[],skipped:rows.filter(editableDraft).length-targets.length};
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
    report.state='APPLYING';report.updates=updates;await writeJson(file,report);
    await repository.commit({updates});
    for(const entry of report.entries){const row=rows.find(item=>item.short_id===entry.shortId),choice=selections.find(item=>item.shortId===entry.shortId),candidate=entry.suggestion.candidates[choice?.candidateIndex??entry.suggestion.defaultCandidateIndex??0],update=updates.find(item=>item.short_id===entry.shortId);await recordApproval(outputDir,{suggestion:entry.suggestion,candidateIndex:choice?.candidateIndex??entry.suggestion.defaultCandidateIndex??0,approvedTitle:update.public_title||row.public_title||candidate.title,approvedDescription:update.description||row.description||candidate.description,approvedHashtags:(update.youtube_tags||row.youtube_tags||candidate.tags.join(', ')).split(',').map(clean).filter(Boolean)});}
    report.state='APPROVED';report.approvedAt=new Date().toISOString();await writeJson(file,report);
    await exportRelatedVideoActions({rows:await repository.read(),outputDir});
    return {applied:updates.length};
  });
}

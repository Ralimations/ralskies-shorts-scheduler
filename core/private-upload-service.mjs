import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const HASH=/^[A-F0-9]{64}$/, clean=v=>String(v??'').trim(), upper=v=>clean(v).toUpperCase();
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
function digest(plan){const {planHash,...unsigned}=plan;return crypto.createHash('sha256').update(JSON.stringify(stable(unsigned))).digest('hex');}
async function writeJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const temp=`${file}.tmp-${process.pid}-${Date.now()}`;await fs.writeFile(temp,`${JSON.stringify(value,null,2)}\n`);await fs.rename(temp,file);}
async function readJson(file){return JSON.parse(await fs.readFile(file,'utf8'));}
async function fileHash(file){const h=crypto.createHash('sha256'),handle=await fs.open(file,'r');try{for await(const chunk of handle.createReadStream())h.update(chunk);}finally{await handle.close();}return h.digest('hex').toUpperCase();}
function sourcePath(item){return clean(item.tracker?.current_path||item.manifest?.current_path||item.tracker?.file_path);}
function phtSchedule(utc){const instant=Date.parse(clean(utc));return Number.isNaN(instant)?'':new Date(instant+8*60*60*1000).toISOString().slice(0,16).replace('T',' ')+' Asia/Manila';}

export function derivePrivateUploadOperations(batch,{channelId=''}={}){
  if(!batch?.batchId||!Array.isArray(batch.readiness))throw Error('UPLOAD_BATCH_REQUIRED');
  return batch.readiness.filter(item=>{const row=item.tracker||{};return item.classification==='MATCHED'&&item.metadata?.state==='METADATA_READY'&&item.productionEligibility==='AWAITING_PRIVATE_UPLOAD'&&upper(row.status)==='BATCH_READY'&&upper(row.schedule_eligible)==='YES'&&!clean(row.youtube_video_id);}).map(item=>{
    const row=item.tracker,sha256=upper(row.file_hash||item.identity?.hash),filePath=sourcePath(item);
    if(!HASH.test(sha256))throw Error(`UPLOAD_HASH_INVALID:${clean(row.short_id)}`);
    if(!filePath||!fsSync.existsSync(filePath))throw Error(`UPLOAD_SOURCE_MISSING:${clean(row.short_id)}`);
    return {shortId:clean(row.short_id),batchId:clean(batch.batchId),song:clean(row.source_song||item.manifest?.song),sha256,filePath:path.resolve(filePath),fileSize:fsSync.statSync(filePath).size,temporaryTitle:sha256,categoryId:clean(row.youtube_category_id)||'10',privacyStatus:'private',channelId:clean(channelId),schedulePht:phtSchedule(item.utcPublishAt),publishAtUtc:clean(item.utcPublishAt)};
  }).sort((a,b)=>a.publishAtUtc.localeCompare(b.publishAtUtc)||a.shortId.localeCompare(b.shortId)).map((operation,index)=>Object.freeze({...operation,order:index+1}));
}

export function buildPrivateUploadPlan({batch,channelId='',executionId=crypto.randomUUID(),createdAt=new Date().toISOString()}={}){
  const operations=Object.freeze(derivePrivateUploadOperations(batch,{channelId})),base={schemaVersion:1,executionId,batchId:clean(batch.batchId),mode:'PRIVATE_UPLOAD',concurrency:1,failFast:true,createdAt,operationCount:operations.length,operations};
  return Object.freeze({...base,planHash:digest(base)});
}
export function validatePrivateUploadPlan(plan){
  if(!plan||plan.mode!=='PRIVATE_UPLOAD'||!clean(plan.executionId)||!clean(plan.batchId))throw Error('UPLOAD_PLAN_INVALID');
  if(plan.concurrency!==1||plan.failFast!==true)throw Error('UPLOAD_PLAN_SAFETY_INVALID');
  if(!Array.isArray(plan.operations)||plan.operationCount!==plan.operations.length||plan.operationCount<1)throw Error('UPLOAD_PLAN_COUNT_INVALID');
  if(plan.planHash!==digest(plan))throw Error('UPLOAD_PLAN_HASH_MISMATCH');
  const ids=new Set();for(const [index,op] of plan.operations.entries()){if(op.order!==index+1||op.batchId!==plan.batchId||!clean(op.shortId)||!HASH.test(upper(op.sha256))||op.temporaryTitle!==upper(op.sha256)||op.privacyStatus!=='private'||ids.has(op.shortId))throw Error('UPLOAD_PLAN_OPERATION_INVALID');ids.add(op.shortId);}return true;
}
export function assertUploadPlanCurrent(plan,batch){validatePrivateUploadPlan(plan);if(JSON.stringify(derivePrivateUploadOperations(batch,{channelId:plan.operations[0]?.channelId||''}))!==JSON.stringify(plan.operations))throw Error('UPLOAD_PLAN_STALE');return true;}
function durable(execution,journal,plan,op,index){if(execution.executionId!==plan.executionId||execution.planHash!==plan.planHash||execution.batchId!==plan.batchId||execution.operationCount!==plan.operationCount||execution.state!=='RUNNING')throw Error('UPLOAD_EXECUTION_IDENTITY_MISMATCH');const row=journal.rows[index];if(!row||row.shortId!==op.shortId||row.sha256!==op.sha256||row.filePath!==op.filePath||row.state!=='UPLOADING')throw Error('UPLOAD_JOURNAL_IDENTITY_MISMATCH');return Object.freeze({executionId:execution.executionId,planHash:execution.planHash,batchId:execution.batchId,operationIndex:index,shortId:row.shortId,sha256:row.sha256,journalState:row.state,persistedAt:row.updatedAt});}

export async function runPrivateUploadPlan({plan,batch,approved=false,approvalPhrase='',adapter,readRemote,trackerUpdate=async()=>{},executionRecordPath,journalPath,now=()=>new Date().toISOString()}={}){
  validatePrivateUploadPlan(plan);assertUploadPlanCurrent(plan,batch);
  if(approved!==true||approvalPhrase!==`UPLOAD ${plan.batchId}`)throw Error('EXPLICIT_UPLOAD_APPROVAL_REQUIRED');
  if(!adapter?.upload||typeof readRemote!=='function'||!executionRecordPath||!journalPath)throw Error('UPLOAD_RUNNER_DEPENDENCY_MISSING');
  if(fsSync.existsSync(executionRecordPath)||fsSync.existsSync(journalPath))throw Error('UPLOAD_EXECUTION_ALREADY_EXISTS_RECONCILE_FIRST');
  const execution={executionId:plan.executionId,planHash:plan.planHash,batchId:plan.batchId,operationCount:plan.operationCount,state:'PLANNED',createdAt:now(),updatedAt:now()};
  const journal={executionId:plan.executionId,planHash:plan.planHash,batchId:plan.batchId,rows:plan.operations.map(op=>({order:op.order,shortId:op.shortId,sha256:op.sha256,filePath:op.filePath,state:'PLANNED',youtubeVideoId:'',updatedAt:now()}))};
  await writeJson(executionRecordPath,execution);await writeJson(journalPath,journal);execution.state='RUNNING';execution.updatedAt=now();await writeJson(executionRecordPath,execution);
  for(const [index,op] of plan.operations.entries()){
    if(await fileHash(op.filePath)!==op.sha256){execution.state='FAILED';execution.updatedAt=now();await writeJson(executionRecordPath,execution);throw Error(`UPLOAD_SOURCE_HASH_MISMATCH:${op.shortId}`);}
    journal.rows[index].state='UPLOADING';journal.rows[index].updatedAt=now();await writeJson(journalPath,journal);const context=durable(await readJson(executionRecordPath),await readJson(journalPath),plan,op,index);
    let inserted;try{inserted=await adapter.upload(op,context);}catch(error){journal.rows[index].state='REMOTE_STATE_UNKNOWN';journal.rows[index].error=String(error?.message||error);journal.rows[index].updatedAt=now();await writeJson(journalPath,journal);execution.state='RECOVERY_REQUIRED';execution.updatedAt=now();await writeJson(executionRecordPath,execution);throw error;}
    const youtubeVideoId=clean(inserted?.id);if(!youtubeVideoId){journal.rows[index].state='REMOTE_STATE_UNKNOWN';journal.rows[index].updatedAt=now();await writeJson(journalPath,journal);execution.state='RECOVERY_REQUIRED';execution.updatedAt=now();await writeJson(executionRecordPath,execution);throw Error(`UPLOAD_RESPONSE_ID_MISSING:${op.shortId}`);}
    journal.rows[index].state='PRIVATE_UPLOADED';journal.rows[index].youtubeVideoId=youtubeVideoId;journal.rows[index].updatedAt=now();await writeJson(journalPath,journal);
    let remote;try{remote=await readRemote(youtubeVideoId);}catch(error){journal.rows[index].state='RECONCILIATION_REQUIRED';journal.rows[index].error=String(error?.message||error);journal.rows[index].updatedAt=now();await writeJson(journalPath,journal);execution.state='RECOVERY_REQUIRED';execution.updatedAt=now();await writeJson(executionRecordPath,execution);throw error;}
    if(!remote||clean(remote.id)!==youtubeVideoId||upper(remote.snippet?.title)!==op.temporaryTitle||clean(remote.status?.privacyStatus)!=='private'||(op.channelId&&clean(remote.snippet?.channelId)!==op.channelId)){journal.rows[index].state='RECONCILIATION_REQUIRED';journal.rows[index].updatedAt=now();await writeJson(journalPath,journal);execution.state='RECOVERY_REQUIRED';execution.updatedAt=now();await writeJson(executionRecordPath,execution);throw Error(`PRIVATE_UPLOAD_VERIFICATION_FAILED:${op.shortId}`);}
    journal.rows[index].state='VERIFIED';journal.rows[index].updatedAt=now();await writeJson(journalPath,journal);
    try{await trackerUpdate(op,remote);}catch(error){journal.rows[index].state='VERIFIED_PENDING_TRACKER';journal.rows[index].error=String(error?.message||error);journal.rows[index].updatedAt=now();await writeJson(journalPath,journal);execution.state='RECOVERY_REQUIRED';execution.updatedAt=now();await writeJson(executionRecordPath,execution);throw error;}
    journal.rows[index].state='COMPLETE';journal.rows[index].updatedAt=now();await writeJson(journalPath,journal);
  }
  execution.state='COMPLETE';execution.updatedAt=now();await writeJson(executionRecordPath,execution);return {ok:true,state:'COMPLETE',executionId:plan.executionId,operationCount:plan.operationCount,completed:journal.rows.filter(row=>row.state==='COMPLETE').length};
}
export function createPrivateUploadAdapter({client,enabled=false}={}){return {async upload(operation,durableContext){if(!enabled)throw Error('REAL_PRIVATE_UPLOAD_DISABLED');if(!durableContext||durableContext.journalState!=='UPLOADING'||durableContext.shortId!==operation.shortId||durableContext.sha256!==operation.sha256)throw Error('DURABLE_UPLOAD_CONTEXT_REQUIRED');return client.videos.insertPrivateResumable(operation);}};}
export async function findUploadRecovery({directory,batchId}={}){let names=[];try{names=await fs.readdir(directory);}catch(error){if(error.code==='ENOENT')return [];throw error;}const risky=new Set(['UPLOADING','PRIVATE_UPLOADED','REMOTE_STATE_UNKNOWN','RECONCILIATION_REQUIRED','VERIFIED_PENDING_TRACKER']),found=[];for(const name of names.filter(value=>/^upload-.*\.journal\.json$/i.test(value))){let journal;try{journal=await readJson(path.join(directory,name));}catch{continue;}if(clean(journal.batchId)!==clean(batchId))continue;const rows=(journal.rows||[]).filter(row=>risky.has(upper(row.state)));if(rows.length)found.push({executionId:journal.executionId,batchId:journal.batchId,file:path.join(directory,name),rows});}return found;}

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
export async function atomicWrite(file,value){const tmp=`${file}.tmp-${process.pid}-${Date.now()}`;await fs.writeFile(tmp,JSON.stringify(value,null,2),{encoding:'utf8',flag:'w'});await fs.rename(tmp,file);}
export async function persistExecutionRecord({path:recordPath,executionId,batchId,plan,operationCount,orderedRows}){const rec={executionId,batchId,mode:'PRODUCTION',createdAt:new Date().toISOString(),planHash:plan.planHash||crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex'),operationCount,orderedShortIds:orderedRows.map(r=>String(r.short_id)),orderedYoutubeIds:orderedRows.map(r=>String(r.youtube_video_id)),concurrency:1,failFast:true,approved:true,state:'PLANNED'};await atomicWrite(recordPath,rec);const check=JSON.parse(await fs.readFile(recordPath,'utf8'));if(check.executionId!==executionId||check.operationCount!==operationCount)throw Error('EXECUTION_RECORD_READBACK_FAILED');return rec;}
export async function readExecutionRecord(recordPath){return JSON.parse(await fs.readFile(recordPath,'utf8'));}
export async function readExecutionJournal(journalPath){return JSON.parse(await fs.readFile(journalPath,'utf8'));}
export async function readRowJournal(journalPath, shortId){const j=JSON.parse(await fs.readFile(journalPath,'utf8'));return j.rows?.find(r=>String(r.short_id)===String(shortId));}
export async function appendProductionLog(logPath,event){await fs.mkdir(path.dirname(logPath),{recursive:true});await fs.appendFile(logPath,JSON.stringify({...event,timestamp:event.timestamp||new Date().toISOString()})+'\n','utf8');}
const ENVELOPE_STATES=new Set(['PLANNED','APPLYING','FAILED','APPLIED_UNVERIFIED','VERIFIED_PENDING_TRACKER','RECONCILIATION_REQUIRED','COMPLETE']);
export function aggregateExecutionState({rows=[],operationCount,error}={}){
 const states=rows.map(row=>String(row?.state||''));
 if(Number(operationCount)>0&&states.length===Number(operationCount)&&states.every(state=>state==='COMPLETE'))return 'COMPLETE';
 if(states.includes('APPLIED_UNVERIFIED'))return 'APPLIED_UNVERIFIED';
 if(states.includes('RECONCILIATION_REQUIRED'))return 'RECONCILIATION_REQUIRED';
 if(states.includes('VERIFIED_PENDING_TRACKER')||states.includes('TRACKER_UPDATING')||states.includes('VERIFIED'))return 'VERIFIED_PENDING_TRACKER';
 if(states.includes('APPLIED')||states.includes('VERIFYING'))return 'APPLIED_UNVERIFIED';
 if(error)return 'FAILED';
 return 'APPLYING';
}
export async function updateExecutionRecordState({path:recordPath,state,executionId,operationCount}={}){
 if(!ENVELOPE_STATES.has(state))throw Error('INVALID_EXECUTION_STATE:'+state);
 const current=await readExecutionRecord(recordPath);
 if(executionId!=null&&String(current.executionId)!==String(executionId))throw Error('EXECUTION_RECORD_IDENTITY_MISMATCH');
 if(operationCount!=null&&Number(current.operationCount)!==Number(operationCount))throw Error('EXECUTION_RECORD_OPERATION_COUNT_MISMATCH');
 const next={...current,state,updatedAt:new Date().toISOString()};
 await atomicWrite(recordPath,next);
 const check=await readExecutionRecord(recordPath);
 if(check.state!==state||check.executionId!==current.executionId||Number(check.operationCount)!==Number(current.operationCount))throw Error('EXECUTION_RECORD_STATE_READBACK_FAILED');
 return check;
}
export function isExecutionLogicallyComplete(record,journal){
 if(!record||!journal)return false;
 const rows=Array.isArray(journal.rows)?journal.rows:[];
 const count=Number(record.operationCount);
 if(!count||rows.length!==count)return false;
 if(journal.operation_count!=null&&Number(journal.operation_count)!==count)return false;
 if(journal.execution_id!=null&&String(record.executionId)!==String(journal.execution_id))return false;
 if(journal.batch_id!=null&&String(record.batchId)!==String(journal.batch_id))return false;
 return rows.every((row,index)=>row.state==='COMPLETE'&&String(row.executionId||record.executionId)===String(record.executionId)&&(row.operation_index==null||Number(row.operation_index)===index)&&String(row.short_id)===String(record.orderedShortIds?.[index])&&String(row.youtube_video_id)===String(record.orderedYoutubeIds?.[index]));
}
export async function reconcileExecutionEnvelope({executionRecordPath,journalPath}={}){
 const record=await readExecutionRecord(executionRecordPath);const journal=await readExecutionJournal(journalPath);const complete=isExecutionLogicallyComplete(record,journal);
 if(!complete)return {changed:false,logicallyComplete:false,state:record.state,record,journal};
 if(record.state==='COMPLETE')return {changed:false,logicallyComplete:true,state:'COMPLETE',record,journal};
 const updated=await updateExecutionRecordState({path:executionRecordPath,state:'COMPLETE',executionId:record.executionId,operationCount:record.operationCount});
 return {changed:true,logicallyComplete:true,state:'COMPLETE',before:record.state,record:updated,journal};
}
export async function assertDurableWrite({record,rowJournal,executionId,row,plan}){if(!record||record.executionId!==executionId)throw Error('WRITE_DENIED_NO_EXECUTION_RECORD');if(!rowJournal||rowJournal.state!=='APPLYING')throw Error('WRITE_DENIED_ROW_NOT_APPLYING');if(String(rowJournal.executionId)!==String(executionId)||String(rowJournal.youtube_video_id)!==String(row.youtube_video_id))throw Error('WRITE_DENIED_IDENTITY_MISMATCH');if(!plan.approvedRowIds.includes(String(row.short_id))||!plan.youtubeIds.includes(String(row.youtube_video_id)))throw Error('WRITE_DENIED_PLAN_MISMATCH');}

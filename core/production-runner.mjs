import fs from 'node:fs/promises';
import {assertWriteAllowed} from './execution-plan.mjs';
import {persistExecutionRecord,appendProductionLog,assertDurableWrite} from './production-durability.mjs';
export async function runPlannedExecution({executionPlan,rows,mode='DRY_RUN',write,read,trackerUpdate,channelId,journalPath,onTransition,interruptAfterState,interruptPredicate,executionRecordPath,productionLogPath}={}) {
 if(!executionPlan||!Array.isArray(executionPlan.approvedRowIds)||!Array.isArray(executionPlan.youtubeIds)) throw new Error('NO_EXECUTION_PLAN: writes are disabled');
 if(executionPlan.operationCount!==executionPlan.approvedRowIds.length) throw new Error('OPERATION_COUNT_MISMATCH');
 const universe=new Map(rows.map(r=>[String(r.short_id),r]));const plannedRows=executionPlan.approvedRowIds.map(id=>universe.get(String(id)));if(plannedRows.some(r=>!r))throw new Error('PLAN_ROW_MISSING');
 const journal={execution_id:executionPlan.executionId||executionPlan.execution_id,batch_id:executionPlan.batchId||executionPlan.batch_id,mode,operation_count:executionPlan.operationCount,created_at:executionPlan.createdAt||executionPlan.created_at,rows:[]};
 const persist=async()=>{if(journalPath)await fs.writeFile(journalPath,JSON.stringify(journal,null,2));}; const transition=async(entry,state)=>{entry.state=state;entry.last_updated=new Date().toISOString();if(onTransition)await onTransition({...entry});await persist();if(interruptAfterState===state&&state!=='APPLIED'&&(!interruptPredicate||interruptPredicate(entry)))throw Object.assign(new Error(`INTERRUPTED_AFTER_${state}`),{code:'INTERRUPTED',journalState:state});};
 await persist();let record=null;if(mode==='PRODUCTION'&&executionRecordPath){record=await persistExecutionRecord({path:executionRecordPath,executionId:journal.execution_id,batchId:journal.batch_id,plan:executionPlan,operationCount:executionPlan.operationCount,orderedRows:plannedRows});await appendProductionLog(productionLogPath,{executionId:journal.execution_id,batchId:journal.batch_id,state:'PLANNED',event:'EXECUTION_CREATED'});}let calls=0;
 for(const row of plannedRows){const id=String(row.short_id);if(['FAILED','BLOCKED','DUPLICATE'].includes(String(row.status||'').toUpperCase()))throw new Error(`ROW_BLOCKED:${id}`);if(calls>=executionPlan.operationCount)throw new Error('OPERATION_COUNT_EXCEEDED');assertWriteAllowed({approvedRowIds:executionPlan.approvedRowIds.map(String),youtubeIds:executionPlan.youtubeIds.map(String)},row);if(String(row.batch_id)!==String(executionPlan.batchId||executionPlan.batch_id))throw new Error(`BATCH_MISMATCH:${id}`);
  const entry={short_id:id,youtube_video_id:row.youtube_video_id,state:'PLANNED'};journal.rows.push(entry);await transition(entry,'PRECHECK');
  if(mode!=='DRY_RUN'){await transition(entry,'APPLYING');if(record)await assertDurableWrite({record,rowJournal:{...entry,executionId:journal.execution_id},executionId:journal.execution_id,row,plan:executionPlan});if(!channelId)throw new Error('CHANNEL_REQUIRED');await write(row);calls++;await transition(entry,'APPLIED');if(interruptAfterState==='APPLIED'&&(!interruptPredicate||interruptPredicate(entry))){entry.state='APPLIED_UNVERIFIED';entry.last_updated=new Date().toISOString();await persist();throw Object.assign(new Error('INTERRUPTED_AFTER_APPLIED'),{code:'INTERRUPTED'});}await transition(entry,'VERIFYING');await read(row);await transition(entry,'VERIFIED');await transition(entry,'TRACKER_UPDATING');if(trackerUpdate)await trackerUpdate(row);await transition(entry,'COMPLETE');
  } else {calls++;await transition(entry,'PLANNED');}
 }
 return {executionId:journal.execution_id,operationCount:executionPlan.operationCount,plannedWrites:calls,journal};
}





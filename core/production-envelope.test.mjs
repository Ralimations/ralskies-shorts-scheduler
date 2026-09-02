import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createExecutionPlan} from './execution-plan.mjs';
import {runPlannedExecution} from './production-runner.mjs';
import {persistExecutionRecord,readExecutionRecord,readExecutionJournal,updateExecutionRecordState,reconcileExecutionEnvelope} from './production-durability.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'production-envelope-'));
const rows=[1,2].map(n=>({batch_id:'BULK_TEST',short_id:`R${n}`,youtube_video_id:`Y${n}`,status:'BATCH_READY'}));
const plan=()=>createExecutionPlan({batchId:'BULK_TEST',mode:'PRODUCTION',rowIds:rows.map(row=>row.short_id),rows});
const paths=label=>({journal:path.join(root,`${label}.journal.json`),execution:path.join(root,`${label}.execution.json`),log:path.join(root,`${label}.log`)});
const run=async(label,options={})=>{const p=paths(label);let writes=0;const result=await runPlannedExecution({executionPlan:plan(),rows,mode:'PRODUCTION',channelId:'TEST',journalPath:p.journal,executionRecordPath:p.execution,productionLogPath:p.log,write:async()=>{writes++;},read:async()=>{},trackerUpdate:async()=>{},verificationDelays:[0,0],...options});return {p,result,writes};};

const complete=await run('two-row');
assert.equal(complete.writes,2);
assert.deepEqual(complete.result.journal.rows.map(row=>row.state),['COMPLETE','COMPLETE']);
assert.equal((await readExecutionRecord(complete.p.execution)).state,'COMPLETE');

const interruptedPaths=paths('stopped-after-row1');let interruptedWrites=0;
await assert.rejects(()=>runPlannedExecution({executionPlan:plan(),rows,mode:'PRODUCTION',channelId:'TEST',journalPath:interruptedPaths.journal,executionRecordPath:interruptedPaths.execution,productionLogPath:interruptedPaths.log,write:async()=>{interruptedWrites++;},read:async()=>{},trackerUpdate:async()=>{},interruptAfterState:'COMPLETE',interruptPredicate:entry=>entry.short_id==='R1'}),/INTERRUPTED_AFTER_COMPLETE/);
const stoppedJournal=await readExecutionJournal(interruptedPaths.journal);const stoppedRecord=await readExecutionRecord(interruptedPaths.execution);
assert.equal(interruptedWrites,1);
assert.deepEqual(stoppedJournal.rows.map(row=>row.state),['COMPLETE']);
assert.notEqual(stoppedRecord.state,'COMPLETE');
assert.equal(stoppedRecord.state,'FAILED');

const recoveryPaths=paths('restart-recovery');
const recoveryPlan=plan();
await persistExecutionRecord({path:recoveryPaths.execution,executionId:recoveryPlan.executionId,batchId:recoveryPlan.batchId,plan:recoveryPlan,operationCount:2,orderedRows:rows});
await fs.writeFile(recoveryPaths.journal,JSON.stringify({execution_id:recoveryPlan.executionId,batch_id:recoveryPlan.batchId,operation_count:2,rows:[{short_id:'R1',youtube_video_id:'Y1',executionId:recoveryPlan.executionId,operation_index:0,state:'COMPLETE'},{short_id:'R2',youtube_video_id:'Y2',executionId:recoveryPlan.executionId,operation_index:1,state:'APPLIED_UNVERIFIED'}]},null,2));
await updateExecutionRecordState({path:recoveryPaths.execution,state:'APPLIED_UNVERIFIED',executionId:recoveryPlan.executionId,operationCount:2});
const preserved=await reconcileExecutionEnvelope({executionRecordPath:recoveryPaths.execution,journalPath:recoveryPaths.journal});
assert.equal(preserved.logicallyComplete,false);assert.equal(preserved.changed,false);assert.equal((await readExecutionRecord(recoveryPaths.execution)).state,'APPLIED_UNVERIFIED');
const recoveredJournal=await readExecutionJournal(recoveryPaths.journal);recoveredJournal.rows[1].state='COMPLETE';await fs.writeFile(recoveryPaths.journal,JSON.stringify(recoveredJournal,null,2));
const recovered=await reconcileExecutionEnvelope({executionRecordPath:recoveryPaths.execution,journalPath:recoveryPaths.journal});
assert.equal(recovered.logicallyComplete,true);assert.equal(recovered.changed,true);assert.equal((await readExecutionRecord(recoveryPaths.execution)).state,'COMPLETE');

const legacyPaths=paths('legacy-complete');const legacyPlan=plan();
await persistExecutionRecord({path:legacyPaths.execution,executionId:legacyPlan.executionId,batchId:legacyPlan.batchId,plan:legacyPlan,operationCount:2,orderedRows:rows});
await fs.writeFile(legacyPaths.journal,JSON.stringify({rows:rows.map(row=>({short_id:row.short_id,youtube_video_id:row.youtube_video_id,state:'COMPLETE'}))},null,2));
let youtubeWrites=0;const legacy=await reconcileExecutionEnvelope({executionRecordPath:legacyPaths.execution,journalPath:legacyPaths.journal});
assert.equal(legacy.logicallyComplete,true);assert.equal(legacy.changed,true);assert.equal((await readExecutionRecord(legacyPaths.execution)).state,'COMPLETE');assert.equal(youtubeWrites,0);

console.log(JSON.stringify({status:'PASS',twoRowEnvelope:'COMPLETE',stoppedEnvelope:stoppedRecord.state,recoveryPreserved:preserved.state,recoveryCompleted:recovered.state,legacyRecognized:true,youtubeWrites}));

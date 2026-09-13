import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {titleIssue,assertPlanTitles} from './youtube-title-validation.mjs';
import {createExecutionPlan,hashExecutionPlan} from './execution-plan.mjs';
import {executeProductionRequest} from './production-entry.mjs';
import {armRealPlan,disarmRealPlan,createRealAdapter} from './youtube-adapter.mjs';
const rows=()=>[1,2].map(i=>({short_id:'R'+i,youtube_video_id:'Y'+i,batch_id:'BULK_TEST',status:'BATCH_READY',public_title:'Approved cover '+i,description:'Description',youtube_tags:'cover,music',scheduled_date:'2030-01-01',scheduled_time:'17:30'}));
function planFor(items){const plan={...createExecutionPlan({batchId:'BULK_TEST',mode:'PRODUCTION',rowIds:items.map(r=>r.short_id),rows:items}),concurrency:1,failFast:true};return {...plan,planHash:hashExecutionPlan(plan)};}
test('titles enforce API limits without silently rewriting approved wording',()=>{
 for(const value of ['', '   ',null,undefined])assert.equal(titleIssue(value),'TITLE_EMPTY');
 assert.equal(titleIssue('a'.repeat(100)),null);assert.match(titleIssue('a'.repeat(101)),/TOO_LONG/);
 assert.equal(titleIssue('A <cover>'),'TITLE_CONTAINS_ANGLE_BRACKET');
 assert.equal(titleIssue('A cover — with feeling'),null);
});
test('an invalid later title blocks the entire live plan before a read, write, tracker update or journal',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'title-preflight-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const items=rows();items[1].public_title='a'.repeat(110);const plan=planFor(items);let calls=0;
 await assert.rejects(executeProductionRequest({request:{approved:true,executionEnvironment:'REAL',executionPlan:plan},rows:items,realEnabled:true,adapter:{applyVideoUpdate:async()=>calls++},read:async()=>calls++,trackerUpdate:async()=>calls++,journalPath:path.join(dir,'j.json'),executionRecordPath:path.join(dir,'e.json')}),/R2 TITLE_TOO_LONG/);
 assert.equal(calls,0);assert.deepEqual(await fs.readdir(dir),[]);
});
test('final payload validation prevents a malformed adapter operation from reaching YouTube',async()=>{
 const items=rows().slice(0,1),plan=planFor(items);plan.operations=[{...plan.operations[0],finalTitle:'<invalid>'}];armRealPlan(plan);
 let writes=0;const context={executionId:plan.executionId,planHash:plan.planHash,batchId:plan.batchId,approved:true,operationIndex:0,shortId:'R1',youtubeId:'Y1',plan,executionRecord:{executionId:plan.executionId},rowJournal:{state:'APPLYING',executionId:plan.executionId,youtube_video_id:'Y1'}};
 await assert.rejects(createRealAdapter({enabled:true,fakeClient:{videos:{update:async()=>writes++}}}).applyVideoUpdate(items[0],context),/INVALID_VIDEO_TITLE/);assert.equal(writes,0);disarmRealPlan();
});
test('a rejected write is retained as a recovery item and stops before the next row',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'write-failure-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const items=rows(),plan=planFor(items);let writes=0;
 await assert.rejects(executeProductionRequest({request:{approved:true,executionEnvironment:'REAL',executionPlan:plan},rows:items,realEnabled:true,adapter:{applyVideoUpdate:async()=>{writes++;throw Error('YouTube API 400: invalid title');}},read:async()=>{throw Error('Unexpected read');},journalPath:path.join(dir,'j.json'),executionRecordPath:path.join(dir,'e.json'),productionLogPath:path.join(dir,'p.log')}),/invalid title/);
 const journal=JSON.parse(await fs.readFile(path.join(dir,'j.json'),'utf8'));assert.equal(writes,1);assert.equal(journal.rows.length,1);assert.equal(journal.rows[0].state,'RECONCILIATION_REQUIRED');assert.match(journal.rows[0].error,/invalid title/);
 assert.equal(JSON.parse(await fs.readFile(path.join(dir,'e.json'),'utf8')).state,'RECONCILIATION_REQUIRED');
});

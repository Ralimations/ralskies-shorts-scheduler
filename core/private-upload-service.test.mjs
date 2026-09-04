import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildPrivateUploadPlan,createPrivateUploadAdapter,findUploadRecovery,runPrivateUploadPlan,validatePrivateUploadPlan} from './private-upload-service.mjs';

async function fixture(count=2){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ralskies-upload-')),readiness=[];
  for(let i=0;i<count;i++){const body=Buffer.from(`video-${i}`),sha=crypto.createHash('sha256').update(body).digest('hex').toUpperCase(),file=path.join(dir,`${sha.toLowerCase()}.mp4`);await fs.writeFile(file,body);readiness.push({classification:'MATCHED',productionEligibility:'AWAITING_PRIVATE_UPLOAD',metadata:{state:'METADATA_READY'},manifest:{song:`Song ${i}`},identity:{hash:sha},tracker:{short_id:`RS-${i}`,batch_id:'BULK_03',source_song:`Song ${i}`,file_hash:sha,current_path:file,status:'BATCH_READY',schedule_eligible:'YES',youtube_video_id:''}});}
  const batch={batchId:'BULK_03',readiness},plan=buildPrivateUploadPlan({batch,executionId:'upload-test',createdAt:'2026-09-04T00:00:00.000Z'});
  return {dir,batch,plan,execution:path.join(dir,'upload-upload-test.execution.json'),journal:path.join(dir,'upload-upload-test.journal.json')};
}

test('two-row private upload is sequential, verified, tracked, and durably complete',async()=>{
  const x=await fixture(),calls=[],updates=[];
  const adapter={upload:async(op,ctx)=>{calls.push({id:op.shortId,ctx});return {id:`YT-${op.shortId}`};}};
  const result=await runPrivateUploadPlan({plan:x.plan,batch:x.batch,approved:true,approvalPhrase:'UPLOAD BULK_03',adapter,readRemote:async id=>({id,snippet:{title:x.plan.operations.find(op=>`YT-${op.shortId}`===id).temporaryTitle},status:{privacyStatus:'private'}}),trackerUpdate:async(op,remote)=>updates.push([op.shortId,remote.id]),executionRecordPath:x.execution,journalPath:x.journal});
  assert.equal(result.completed,2);assert.deepEqual(calls.map(x=>x.id),['RS-0','RS-1']);assert.equal(calls.every(x=>x.ctx.journalState==='UPLOADING'),true);assert.deepEqual(updates,[['RS-0','YT-RS-0'],['RS-1','YT-RS-1']]);
  assert.equal(JSON.parse(await fs.readFile(x.execution)).state,'COMPLETE');assert.deepEqual(JSON.parse(await fs.readFile(x.journal)).rows.map(r=>r.state),['COMPLETE','COMPLETE']);
  assert.equal((await findUploadRecovery({directory:x.dir,batchId:'BULK_03'})).length,0);
});

test('possible remote write stops fail-fast and cannot be retried',async()=>{
  const x=await fixture(),calls=[];const adapter={upload:async op=>{calls.push(op.shortId);throw Error('socket closed');}};
  await assert.rejects(runPrivateUploadPlan({plan:x.plan,batch:x.batch,approved:true,approvalPhrase:'UPLOAD BULK_03',adapter,readRemote:async()=>null,executionRecordPath:x.execution,journalPath:x.journal}),/socket closed/);
  assert.deepEqual(calls,['RS-0']);assert.equal(JSON.parse(await fs.readFile(x.execution)).state,'RECOVERY_REQUIRED');assert.deepEqual(JSON.parse(await fs.readFile(x.journal)).rows.map(r=>r.state),['REMOTE_STATE_UNKNOWN','PLANNED']);assert.equal((await findUploadRecovery({directory:x.dir,batchId:'BULK_03'})).length,1);
  await assert.rejects(runPrivateUploadPlan({plan:x.plan,batch:x.batch,approved:true,approvalPhrase:'UPLOAD BULK_03',adapter,readRemote:async()=>null,executionRecordPath:x.execution,journalPath:x.journal}),/RECONCILE_FIRST/);assert.deepEqual(calls,['RS-0']);
});

test('approval, immutable-plan, and adapter durability guards allow zero writes on failure',async()=>{
  const x=await fixture(1),calls=[];const adapter=createPrivateUploadAdapter({enabled:true,client:{videos:{insertPrivateResumable:async op=>{calls.push(op);return {id:'YT'};}}}});
  await assert.rejects(runPrivateUploadPlan({plan:x.plan,batch:x.batch,approved:true,approvalPhrase:'wrong',adapter,readRemote:async()=>null,executionRecordPath:x.execution,journalPath:x.journal}),/APPROVAL/);
  const tampered={...x.plan,operations:[{...x.plan.operations[0],fileSize:99}]};assert.throws(()=>validatePrivateUploadPlan(tampered),/HASH_MISMATCH/);
  await assert.rejects(adapter.upload(x.plan.operations[0],{journalState:'UPLOADING',shortId:'wrong',sha256:x.plan.operations[0].sha256}),/DURABLE/);assert.equal(calls.length,0);
});

test('verified upload with tracker failure is recoverable and does not advance another row',async()=>{
  const x=await fixture(),calls=[];const adapter={upload:async op=>{calls.push(op.shortId);return {id:`YT-${op.shortId}`};}};
  await assert.rejects(runPrivateUploadPlan({plan:x.plan,batch:x.batch,approved:true,approvalPhrase:'UPLOAD BULK_03',adapter,readRemote:async id=>({id,snippet:{title:x.plan.operations[0].temporaryTitle},status:{privacyStatus:'private'}}),trackerUpdate:async()=>{throw Error('tracker locked');},executionRecordPath:x.execution,journalPath:x.journal}),/tracker locked/);
  assert.deepEqual(calls,['RS-0']);assert.equal(JSON.parse(await fs.readFile(x.execution)).state,'RECOVERY_REQUIRED');assert.deepEqual(JSON.parse(await fs.readFile(x.journal)).rows.map(r=>r.state),['VERIFIED_PENDING_TRACKER','PLANNED']);
});

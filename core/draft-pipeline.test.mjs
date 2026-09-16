import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanDrafts, saveDraftMetadata, hashFile, exportRelatedVideoActions } from './draft-intake.mjs';
import { buildIntakeBatch } from './existing-batch-service.mjs';
import { buildPrivateUploadPlan, runPrivateUploadPlan, createPrivateUploadAdapter } from './private-upload-service.mjs';
import { buildProductionReview } from './production-review.mjs';
import { calendarEvents, planReservations, calendarMonth, assertScheduleAvailable, validateSlots } from './schedule-calendar.mjs';
import { remoteMatchesHash } from './draft-desktop.mjs';

const now=Date.parse('2026-09-13T00:00:00Z');
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ralskies-drafts-')),draftFolder=path.join(root,'drafts'),hashedFolder=path.join(draftFolder,'hashed'),outputDir=path.join(root,'output');
  await fs.mkdir(draftFolder);await fs.mkdir(outputDir);
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const old={short_id:'LEGACY',file_hash:'F'.repeat(64),batch_id:'BULK_03',status:'DUPLICATE',public_title:'Approved old title',description:'Existing description',notes:'Unresolved',scheduled_date:'2026-09-14',scheduled_time:'17:30',timezone:'Asia/Manila'};
  const rows=[structuredClone(old)],repository={read:async()=>structuredClone(rows),commit:async({additions=[],updates=[]})=>{rows.push(...structuredClone(additions));for(const update of updates)Object.assign(rows.find(row=>row.short_id===update.short_id),update);}};
  const add=async(name='clip.mp4',body='new clip')=>{const file=path.join(draftFolder,name);await fs.writeFile(file,body);await fs.utimes(file,new Date(now-60000),new Date(now-60000));return file;};
  return {root,draftFolder,hashedFolder,outputDir,old,rows,repository,add,now};
}
test('dry run is read-only; intake copies once, preserves originals, legacy metadata and duplicate rows',async t=>{
  const x=await fixture(t),source=await x.add();
  const before=await fs.readdir(x.outputDir);
  const preview=await scanDrafts({...x,dryRun:true});
  assert.equal(preview.added.length,1);assert.equal(x.rows.length,1);assert.deepEqual(await fs.readdir(x.outputDir),before);await fs.access(source);
  await assert.rejects(fs.access(x.hashedFolder));
  const result=await scanDrafts({...x,dryRun:false}),row=result.added[0];
  assert.equal(row.status,'AWAITING_METADATA');assert.equal(row.public_title,'');assert.equal(await hashFile(row.current_path),row.file_hash);
  await fs.access(source);assert.equal(await hashFile(source),row.file_hash);assert.deepEqual(x.rows[0],x.old);
  await x.add('same-again.mp4');
  const second=await scanDrafts({...x,dryRun:false});
  assert.equal(second.added.length,0);assert.equal(second.skipped.length,2);assert.equal(x.rows.length,2);await fs.access(path.join(x.draftFolder,'same-again.mp4'));
});
test('freshly copying files wait; identical and ancestor staging roots are rejected',async t=>{
  const x=await fixture(t),source=await x.add();await fs.utimes(source,new Date(now),new Date(now));
  assert.equal((await scanDrafts({...x,dryRun:false})).waiting.length,1);
  await assert.rejects(scanDrafts({...x,hashedFolder:x.draftFolder,dryRun:false}),/SEPARATE/);
  assert.equal(x.rows.length,1);await fs.access(source);
});
test('tracker failure retains the source and verified copy, logs exception, and supports safe retry',async t=>{
  const x=await fixture(t),source=await x.add(),original=x.repository.commit;
  x.repository.commit=async()=>{throw Error('Workbook locked');};
  const failed=await scanDrafts({...x,dryRun:false});
  assert.equal(failed.exceptions.length,1);await fs.access(source);assert.equal(x.rows.length,1);
  const exceptions=JSON.parse(await fs.readFile(path.join(x.outputDir,'exceptions.json')));assert.match(exceptions[0].message,/locked/);
  x.repository.commit=original;
  const retried=await scanDrafts({...x,dryRun:false});
  assert.equal(retried.added.length,1);assert.equal(x.rows.length,2);await fs.access(source);
});
test('destination collision is never overwritten or registered',async t=>{
  const x=await fixture(t),source=await x.add(),hash=await hashFile(source);await fs.mkdir(x.hashedFolder);
  const destination=path.join(x.hashedFolder,hash+'.mp4');await fs.writeFile(destination,'unrelated existing file');
  const result=await scanDrafts({...x,dryRun:false});assert.equal(result.exceptions.length,1);assert.equal(x.rows.length,1);
  assert.equal(await fs.readFile(destination,'utf8'),'unrelated existing file');await fs.access(source);
});
test('metadata-free draft can upload privately but cannot enter publication; metadata edits leave old rows intact',async t=>{
  const x=await fixture(t);await x.add();const result=await scanDrafts({...x,dryRun:false}),row=x.rows[1];
  let batch=buildIntakeBatch(x.rows,result.batchId),plan=buildPrivateUploadPlan({batch,channelId:'CHANNEL'});
  assert.equal(plan.operationCount,1);assert.equal(plan.operations[0].temporaryTitle,row.file_hash);
  row.youtube_video_id='abcDEF_1234';row.status='PRIVATE_UPLOADED';
  assert.equal(buildProductionReview({batchId:result.batchId,rows:x.rows,manifestRows:batch.manifest.rows}).plannedOperationCount,0);
  await saveDraftMetadata({repository:x.repository,shortId:row.short_id,metadata:{public_title:'New cover',description:'My cover',youtube_tags:'cover,music',category:'Music',related_video_id:'abcDEF_5678',file_hash:'malicious'}});assert.equal(x.rows[1].file_hash,row.file_hash);
  const reservations=planReservations({rows:x.rows,batchId:result.batchId,startDate:'2026-09-14',now});await x.repository.commit({updates:reservations.updates});
  batch=buildIntakeBatch(x.rows,result.batchId);
  assert.equal(buildProductionReview({batchId:result.batchId,rows:x.rows,manifestRows:batch.manifest.rows}).plannedOperationCount,1);
  assert.deepEqual(x.rows[0],x.old);
  await assert.rejects(saveDraftMetadata({repository:x.repository,shortId:'LEGACY',metadata:{public_title:'changed'}}),/NOT_EDITABLE/);
  await exportRelatedVideoActions({rows:x.rows,outputDir:x.outputDir});assert.match(await fs.readFile(path.join(x.outputDir,'RELATED_VIDEO_MANUAL.csv'),'utf8'),/abcDEF_5678/);
});
test('resumable session is journaled before media transfer',async t=>{
  const x=await fixture(t);await x.add();const intake=await scanDrafts({...x,dryRun:false}),batch=buildIntakeBatch(x.rows,intake.batchId),plan=buildPrivateUploadPlan({batch,channelId:'CHANNEL'}),journalPath=path.join(x.outputDir,'upload-test.journal.json');
  const client={videos:{insertPrivateResumable:async op=>{
    await op.saveSession('https://www.googleapis.com/upload/session/example');
    const journal=JSON.parse(await fs.readFile(journalPath));assert.equal(journal.rows[0].resumableSessionUrl,'https://www.googleapis.com/upload/session/example');return {id:'abcDEF_1234'};
  }}};
  const adapter=createPrivateUploadAdapter({client,enabled:true});
  const result=await runPrivateUploadPlan({plan,batch,approved:true,approvalPhrase:'UPLOAD '+batch.batchId,adapter,readRemote:async id=>({id,snippet:{title:plan.operations[0].temporaryTitle,channelId:'CHANNEL'},status:{privacyStatus:'private'}}),executionRecordPath:path.join(x.outputDir,'upload-test.execution.json'),journalPath});
  assert.equal(result.completed,1);
});
test('daily and every-other-day reservations skip both legacy reservations and manual YouTube schedules',()=>{
  const drafts=Array.from({length:3},(_,i)=>({short_id:'RS-'+i,batch_id:'INTAKE-TEST',status:'AWAITING_METADATA'}));
  const rows=[...drafts,{short_id:'OLD',scheduled_date:'2026-09-14',scheduled_time:'17:30'}],snapshot={syncedAt:'2026-09-13T00:00:00Z',videos:[{id:'MANUAL',snippet:{title:'Manual upload'},status:{privacyStatus:'private',publishAt:'2026-09-14T14:30:00Z'}}]};
  const daily=planReservations({rows,batchId:'INTAKE-TEST',startDate:'2026-09-14',slots:['17:30','22:30'],snapshot,now});
  assert.deepEqual(daily.updates.map(row=>[row.scheduled_date,row.scheduled_time]),[['2026-09-15','17:30'],['2026-09-15','22:30'],['2026-09-16','17:30']]);
  const alternate=planReservations({rows,batchId:'INTAKE-TEST',startDate:'2026-09-14',slots:['17:30','22:30'],snapshot,now,cadence:'every-other-day'});
  assert.deepEqual(alternate.updates.map(row=>row.scheduled_date),['2026-09-16','2026-09-16','2026-09-18']);
  assert.throws(()=>validateSlots(['20:17']),/PROTECTED/);assert.throws(()=>validateSlots(['21:00']),/PROTECTED/);assert.throws(()=>validateSlots(['01:30']),/DISABLED/);assert.deepEqual(validateSlots(['01:30'],true),['01:30']);
  assert.throws(()=>planReservations({rows,batchId:'BULK_03',startDate:'2026-09-14',now}),/NEW_INTAKE/);
});
test('calendar distinguishes observed publication, reservations, drift, and untracked uploads',()=>{
  const rows=[{short_id:'ONE',youtube_video_id:'yt1',scheduled_date:'2026-09-14',scheduled_time:'17:30',public_title:'Cover'},{short_id:'TWO',scheduled_date:'2026-09-15',scheduled_time:'22:30',status:'AWAITING_METADATA'}];
  const snapshot={syncedAt:'2026-09-15T00:00:00Z',videos:[{id:'yt1',snippet:{publishedAt:'2026-09-14T09:45:00Z'},status:{privacyStatus:'public'}},{id:'other',snippet:{title:'Manual'},status:{privacyStatus:'private',publishAt:'2026-09-16T14:30:00Z'}}]};
  const events=calendarEvents(rows,snapshot);
  assert.deepEqual(events.map(event=>event.state),['RESERVATION_CONFLICT','PUBLISHED','RESERVED','YOUTUBE_SCHEDULED']);
  assert.equal(events.at(-1).isTracked,false);assert.equal(events[1].pht,'2026-09-14 17:45');
  const month=calendarMonth(events,'2026-09',['17:30','22:30'],now);assert.equal(month.length,30);assert.equal(month[14].slots[1].state,'OCCUPIED');assert.equal(month[14].slots[0].state,'AVAILABLE');
  assert.throws(()=>assertScheduleAvailable(rows,{short_id:'NEW',scheduled_date:'2026-09-16',scheduled_time:'22:30'},snapshot,now),/OCCUPIED/);
});
test('remote matching accepts an exact original hash filename; etags and partial titles do not match',()=>{
  const hash='A'.repeat(64);
  assert.equal(remoteMatchesHash({fileDetails:{fileName:hash+'.mp4'}},hash),true);
  assert.equal(remoteMatchesHash({etag:hash,snippet:{title:'cover'}},hash),false);
  assert.equal(remoteMatchesHash({snippet:{title:hash.slice(0,12)}},hash),false);
});

test('nested hashed subtree is excluded even for untracked files; repeat scans preserve originals and accept new weekly arrivals',async t=>{
  const x=await fixture(t),source=await x.add(),before=await fs.stat(source),sourceHash=await hashFile(source);
  await fs.mkdir(path.join(x.hashedFolder,'nested'),{recursive:true});
  await fs.writeFile(path.join(x.hashedFolder,'nested','untracked-staged.mp4'),'not an intake source');
  const first=await scanDrafts({...x,dryRun:false});
  assert.equal(first.added.length,1);assert.equal(first.exceptions.length,0);
  assert.equal(await hashFile(source),sourceHash);assert.equal((await fs.stat(source)).mtimeMs,before.mtimeMs);
  const second=await scanDrafts({...x,dryRun:false});
  assert.equal(second.added.length,0);assert.equal(second.skipped.length,1);assert.equal(second.exceptions.length,0);
  const later=await x.add('next-week.mp4','a different new clip');
  const third=await scanDrafts({...x,dryRun:false});
  assert.equal(third.added.length,1);assert.equal(third.added[0].original_path,later);
  await fs.access(source);await fs.access(later);
  assert.equal(await hashFile(third.added[0].current_path),await hashFile(later));
});
test('staging cannot contain the draft root or redirect through a junction',async t=>{
  const x=await fixture(t);await x.add();
  await assert.rejects(scanDrafts({...x,hashedFolder:x.root,dryRun:true}),/SEPARATE/);
  const external=path.join(x.root,'external');await fs.mkdir(external);
  await fs.symlink(external,x.hashedFolder,process.platform==='win32'?'junction':'dir');
  await assert.rejects(scanDrafts({...x,dryRun:true}),/LINK/);
});

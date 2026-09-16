import fs from 'node:fs/promises';
import path from 'node:path';
import { readTracker } from './tracker-service.mjs';
import { buildIntakeBatch, loadExistingBatch } from './existing-batch-service.mjs';
import { trackerRepository, scanDrafts, validateDraftFolders, saveDraftMetadata, isIntake, editableDraft, exportRelatedVideoActions } from './draft-intake.mjs';
import { readJson, writeJson, recordException, withPipelineLock } from './pipeline-store.mjs';
import { calendarEvents, planReservations, assertScheduleAvailable, DEFAULT_SLOTS } from './schedule-calendar.mjs';
import { createYouTubeRealClient, loadYouTubeConfig } from './youtube-real-client.mjs';

const clean = value => String(value ?? '').trim();
export function remoteMatchesHash(video, hash) {
  const expected = clean(hash).toUpperCase();
  return /^[A-F0-9]{64}$/.test(expected) && [video?.snippet?.title, video?.fileDetails?.fileName].some(value => clean(value).replace(/\.mp4$/i,'').toUpperCase() === expected);
}
export async function syncChannelCalendar(outputDir) {
  const config = await loadYouTubeConfig(), client = createYouTubeRealClient({ config }), channel = await client.channels.mine();
  if (!channel || channel.id !== config.expectedChannelId || channel.snippet?.title !== config.expectedChannelTitle) throw Error('CHANNEL_MISMATCH');
  const videos = await client.videos.listChannelUploads(channel.contentDetails?.relatedPlaylists?.uploads);
  if (videos.some(video => video.snippet?.channelId !== channel.id)) throw Error('CALENDAR_CHANNEL_MISMATCH');
  const snapshot = { channelId: channel.id, syncedAt: new Date().toISOString(), videos };
  await writeJson(path.join(outputDir,'youtube-calendar.json'), snapshot);
  return snapshot;
}
export async function loadAllBatches({ outputDir, trackerPath, transactionPath }) {
  const rows = await readTracker(trackerPath), transaction = await readJson(transactionPath, { state: 'COMPLETE', batches: [] });
  const batches = [];
  for (const batch of transaction.batches || []) {
    try {
      const detail = await loadExistingBatch({ batchId: batch.batchId, outputDir, trackerPath, transactionPath, trackerRows: rows });
      batches.push({ ...batch, itemCount: detail.readiness.length, detail });
    } catch (error) { batches.push({ ...batch, reconciliationError: error.message }); }
  }
  for (const batchId of [...new Set(rows.filter(isIntake).map(row=>row.batch_id))]) {
    const detail = buildIntakeBatch(rows, batchId);
    batches.push({ batchId, startDate: detail.startDate, endDate: detail.endDate, folderPath: detail.folderPath, itemCount: detail.itemCount, detail });
  }
  return { ...transaction, batches };
}
export async function validateIntakeProduction({ rows, plan, outputDir }) {
  if (!/^INTAKE-/.test(plan.batchId)) return;
  const {findUploadRecovery}=await import('./private-upload-service.mjs');
  if((await findUploadRecovery({directory:outputDir,batchId:plan.batchId})).length)throw Error('UPLOAD_RECOVERY_REQUIRED');
  const snapshot = await syncChannelCalendar(outputDir);
  for (const id of plan.approvedRowIds) {
    const row = rows.find(item=>item.short_id===id), video = snapshot.videos.find(item=>item.id===row?.youtube_video_id);
    if (!row || !editableDraft(row) || video?.status?.privacyStatus !== 'private' || video.status.publishAt || !remoteMatchesHash(video,row.file_hash) || video.processingDetails?.processingStatus !== 'succeeded') throw Error('INTAKE_REMOTE_NOT_READY:' + id);
    assertScheduleAvailable(rows,row,snapshot);
  }
}
export function registerDraftDesktop({ ipcMain, outputDir, trackerPath, isProductionBusy = () => false, onScan = () => {}, startTimer = setInterval, stopTimer = clearInterval, syncCalendar = syncChannelCalendar }) {
  const configPath = path.join(outputDir,'draft-settings.json'), snapshotPath = path.join(outputDir,'youtube-calendar.json');
  let busy = false, timer;
  const defaults = { enabled: false, draftFolder: '', hashedFolder: path.join(outputDir,'hashed'), slots: ['20:00'], cadence: 'four-per-week', postsPerDay: 1, horizonDays: 14, optionalSlot: false };
  const settings = () => readJson(configPath, defaults);
  const repository = () => trackerRepository(trackerPath);
  const guard = async (action, { record = true } = {}) => {
    if (busy || isProductionBusy()) throw Error('PIPELINE_BUSY');
    busy = true;
    try { return await action(); }
    catch (error) { if(record)await recordException(outputDir,{ code:'DRAFT_PIPELINE_ERROR',message:error.message }); throw error; }
    finally { busy = false; }
  };
  const scan = async dryRun => guard(async()=>{
    const config = await settings();
    if (!config.draftFolder) throw Error('SELECT_DRAFT_FOLDER');
    return scanDrafts({ ...config, outputDir, repository: await repository(), dryRun });
  }, { record: !dryRun });
  const status = async()=>{
    const log=await readJson(path.join(outputDir,'exceptions.json'),[]);
    return { settings:await settings(), rows:(await readTracker(trackerPath)).filter(isIntake),busy,lastScan:await readJson(path.join(outputDir,'draft-last-scan.json'),null),exceptions:(Array.isArray(log)?log:log.exceptions||[]).filter(entry=>/^DRAFT_/.test(entry.code||'')&&!entry.resolved) };
  };
  ipcMain.handle('engine:draft-status',status);
  ipcMain.handle('engine:draft-configure',(_event, input)=>guard(async()=>{
    const prior = await settings(), config = { ...prior, enabled: input.enabled === true };
    if (input.draftFolder !== undefined) {
      const folder = await fs.realpath(input.draftFolder);
      if (!(await fs.stat(folder)).isDirectory()) throw Error('DRAFT_FOLDER_REQUIRED');
      config.draftFolder=folder;
      config.hashedFolder=path.join(folder,'hashed');
    }
    if (!config.draftFolder && config.enabled) throw Error('SELECT_DRAFT_FOLDER');
    await fs.mkdir(outputDir,{recursive:true});
    // Stopping must work even when a removable drive or draft folder is gone.
    if(config.enabled || input.draftFolder !== undefined)await validateDraftFolders(config.draftFolder,config.hashedFolder);
    await writeJson(configPath,config); return config;
  }));
  ipcMain.handle('engine:draft-scan',(_event,p={})=>scan(p.dryRun !== false));
  ipcMain.handle('engine:draft-metadata',(_event,p)=>guard(()=>withPipelineLock(outputDir,async()=>{
    const repo = await repository(), result = await saveDraftMetadata({ repository:repo, shortId:p.shortId, metadata:p.metadata });
    await exportRelatedVideoActions({ rows:await repo.read(), outputDir }); return result;
  })));
  ipcMain.handle('engine:draft-reserve-preview',(_event,p)=>guard(async()=>{
    const snapshot=await syncCalendar(outputDir);
    return planReservations({ ...p, cadence:'four-per-week', postsPerDay:1, rows:await readTracker(trackerPath), snapshot });
  }, {record:false}));
  ipcMain.handle('engine:draft-reserve',(_event,p)=>guard(()=>withPipelineLock(outputDir,async()=>{
    const repo=await repository(),snapshot=await readJson(snapshotPath,{}),plan=planReservations({ ...p.plan, cadence:'four-per-week', postsPerDay:1, rows:await repo.read(),snapshot });
    if(plan.fingerprint!==p.plan.fingerprint)throw Error('RESERVATION_PREVIEW_STALE');
    await repo.commit({updates:plan.updates});return plan;
  })));
  ipcMain.handle('engine:draft-link',(_event,p)=>guard(()=>withPipelineLock(outputDir,async()=>{
    const repo=await repository(),rows=await repo.read(),matches=rows.filter(row=>row.short_id===p.shortId);
    if(matches.length!==1||!editableDraft(matches[0])||matches[0].youtube_video_id)throw Error('DRAFT_NOT_LINKABLE');
    const row=matches[0],videoId=clean(p.videoId);
    if(!/^[A-Za-z0-9_-]{11}$/.test(videoId)||rows.some(item=>item.youtube_video_id===videoId))throw Error('YOUTUBE_ID_INVALID_OR_ALREADY_LINKED');
    const snapshot=await syncCalendar(outputDir),video=snapshot.videos.find(item=>item.id===videoId);
    if(!video||video.status?.privacyStatus!=='private'||video.status.publishAt||!remoteMatchesHash(video,row.file_hash))throw Error('PRIVATE_HASH_MATCH_REQUIRED');
    const candidates=snapshot.videos.filter(item=>item.status?.privacyStatus==='private'&&remoteMatchesHash(item,row.file_hash));
    if(candidates.length!==1)throw Error('AMBIGUOUS_REMOTE_HASH');
    await repo.commit({updates:[{short_id:row.short_id,youtube_video_id:videoId,status:'PRIVATE_UPLOADED',verification_state:'VERIFIED_PRIVATE_LINK',verification_timestamp:new Date().toISOString()}]});
    await exportRelatedVideoActions({rows:await repo.read(),outputDir});return {shortId:row.short_id,videoId};
  })));
  ipcMain.handle('engine:calendar',async()=>({ events:calendarEvents(await readTracker(trackerPath),await readJson(snapshotPath,{})), syncedAt:(await readJson(snapshotPath,{})).syncedAt||null }));
  ipcMain.handle('engine:calendar-sync',()=>guard(async()=>{
    const snapshot=await syncCalendar(outputDir);
    return {events:calendarEvents(await readTracker(trackerPath),snapshot),syncedAt:snapshot.syncedAt};
  }));
  // The watcher owns local intake only. Network writes retain the existing live-mode
  // and immutable-plan gates, and are never performed by scans or dry runs.
  const tick=async()=>{
    if(busy||isProductionBusy())return;
    try {
      if(!(await settings()).enabled)return;
      const result=await scan(false);await writeJson(path.join(outputDir,'draft-last-scan.json'),{...result,at:new Date().toISOString()});
      if(result.exceptions.length) {
        const config=await settings();await writeJson(configPath,{...config,enabled:false});
      }
      if(result.added.length||result.exceptions.length)onScan({added:result.added.length,exceptions:result.exceptions.length});
    } catch(error) {
      if(error.message==='PIPELINE_BUSY')return;
      await recordException(outputDir,{code:'DRAFT_WATCHER_STOPPED',message:error.message});
      const config=await settings();await writeJson(configPath,{...config,enabled:false});
    }
  };
  timer=startTimer(()=>tick().catch(()=>{}),15000);timer.unref?.();
  return { stop:()=>stopTimer(timer), isBusy:()=>busy };
}

export async function discoverIntakeBatch({batchId,trackerPath,outputDir}) {
  const {matchPrivateVideos,normalizeHashTitle}=await import('./youtube-matching.mjs');
  const rows=await readTracker(trackerPath),selected=rows.filter(row=>row.batch_id===batchId&&editableDraft(row)&&!row.youtube_video_id);
  const snapshot=await syncCalendar(outputDir);
  const videos=snapshot.videos.filter(video=>video.status?.privacyStatus==='private'&&!video.status.publishAt).map(video=>({
    id:video.id,title:normalizeHashTitle(video.snippet?.title)||normalizeHashTitle(video.fileDetails?.fileName)||video.snippet?.title||'',privacyStatus:'private'
  }));
  const match=matchPrivateVideos(videos,selected);
  return {...match,batchId,expected:selected.length,selectedRows:selected.length,channel:{id:snapshot.channelId}};
}

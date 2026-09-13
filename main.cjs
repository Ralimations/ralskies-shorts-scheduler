const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const PROJECT = __dirname;
const OUT = path.join(PROJECT, 'outputs', 'ralskies-content-engine');
const STATE = path.join(OUT, 'phase2_upload_state.json');
const INSPECT = path.join(OUT, 'Ralskies_Upload_Tracker.xlsx.inspect.ndjson');
const SETTINGS = path.join(OUT, 'desktop_settings.json');
const BATCH_TRANSACTION = path.join(OUT, 'bulk_preparation_transaction.json');
const TRACKER = path.join(OUT, 'Ralskies_Upload_Tracker.xlsx');
let draftDesktop, trackerMutationBusy=false;
const mutatingHandlers=new Set(['engine:apply-private-upload','engine:confirm-matches','engine:finalize-recovery','engine:apply-production','engine:approve-title','engine:keep-title','engine:metadata-approve']);
const registerHandler=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(name,handler)=>registerHandler(name,async(...args)=>{
  if(!mutatingHandlers.has(name))return handler(...args);
  if(trackerMutationBusy||draftDesktop?.isBusy())throw Error('TRACKER_MUTATION_IN_PROGRESS');
  trackerMutationBusy=true;try{return await handler(...args);}finally{trackerMutationBusy=false;}
});
function walk(dir){let out=[]; for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name); if(e.isDirectory()&&e.name!=='node_modules'&&!f.includes(`${path.sep}.git${path.sep}`))out.push(...walk(f)); else if(e.isFile()&&e.name.toLowerCase().endsWith('.mp4'))out.push(f)} return out}
function digest(file){return new Promise((ok,no)=>{const h=crypto.createHash('sha256');fs.createReadStream(file).on('error',no).on('data',x=>h.update(x)).on('end',()=>ok(h.digest('hex')))})}
function dashboard(){if(!fs.existsSync(INSPECT))return {}; const lines=fs.readFileSync(INSPECT,'utf8').split(/\r?\n/).filter(Boolean); const t=lines.map(x=>JSON.parse(x)).find(x=>x.kind==='table'&&x.sheet==='Dashboard'); const r={}; for(const row of t?.values||[])if(row?.[0])r[String(row[0])]=row[1]; return r}
async function inventory(){const files=(await Promise.all(walk(ROOT).map(async file=>{try{return {file:path.relative(ROOT,file),name:path.basename(file),hash:await digest(file),size:fs.statSync(file).size,status:'REVIEW'};}catch(error){if(error.code==='ENOENT')return null;throw error;}}))).filter(Boolean); const state=fs.existsSync(STATE)?JSON.parse(fs.readFileSync(STATE,'utf8')):{}; return {files,dashboard:dashboard(),state,scannedAt:new Date().toISOString()}}
ipcMain.handle('engine:inventory',inventory);
ipcMain.handle('engine:batches',async()=>{const {loadAllBatches}=await import('./core/draft-desktop.mjs');return loadAllBatches({outputDir:OUT,trackerPath:TRACKER,transactionPath:BATCH_TRANSACTION});});
ipcMain.handle('engine:batch-detail',async(_e,batchId)=>{const {loadExistingBatch}=await import('./core/existing-batch-service.mjs');return loadExistingBatch({batchId,transactionPath:BATCH_TRANSACTION,outputDir:OUT,trackerPath:TRACKER});});
ipcMain.handle('engine:upload-review',async(_e,batchId='BULK_03')=>{const {loadExistingBatch}=await import('./core/existing-batch-service.mjs');const {buildPrivateUploadPlan,findUploadRecovery}=await import('./core/private-upload-service.mjs');const {loadYouTubeConfig}=await import('./core/youtube-real-client.mjs');const config=await loadYouTubeConfig(),batch=await loadExistingBatch({batchId,transactionPath:BATCH_TRANSACTION,outputDir:OUT,trackerPath:TRACKER}),plan=buildPrivateUploadPlan({batch,channelId:config.expectedChannelId}),configured=config.productionUploadEnabled===true,runtimeEnabled=process.env.RALSKIES_ENABLE_REAL==='1',recovery=await findUploadRecovery({directory:OUT,batchId});return {batchId,enabled:configured&&runtimeEnabled&&!recovery.length,configured,runtimeEnabled,recoveryRequired:recovery.length,executionId:plan.executionId,planHash:plan.planHash,operationCount:plan.operationCount,concurrency:plan.concurrency,failFast:plan.failFast,approvalPhrase:`UPLOAD ${batchId}`,plan,rows:plan.operations.map(op=>({order:op.order,shortId:op.shortId,song:op.song,filePath:op.filePath,fileSize:op.fileSize,sha256:op.sha256,temporaryTitle:op.temporaryTitle,schedulePht:op.schedulePht,publishAtUtc:op.publishAtUtc,privacyStatus:op.privacyStatus}))};});
ipcMain.handle('engine:apply-private-upload',async(_e,p)=>{const plan=p?.uploadPlan;if(!plan||p?.approved!==true||p?.approvalPhrase!==`UPLOAD ${plan?.batchId}`)return {ok:false,code:'EXPLICIT_UPLOAD_APPROVAL_REQUIRED'};if(process.env.RALSKIES_ENABLE_REAL!=='1')return {ok:false,code:'REAL_PRODUCTION_EXECUTION_DISABLED'};const {loadExistingBatch}=await import('./core/existing-batch-service.mjs');const {assertUploadPlanCurrent,createPrivateUploadAdapter,findUploadRecovery,runPrivateUploadPlan}=await import('./core/private-upload-service.mjs');const {loadYouTubeConfig,createYouTubeRealClient}=await import('./core/youtube-real-client.mjs');const {openTracker,backupTracker,updateTrackerRows,saveTracker}=await import('./core/tracker-service.mjs');const config=await loadYouTubeConfig();if(config.productionUploadEnabled!==true)return {ok:false,code:'PRODUCTION_UPLOAD_DISABLED'};if((await findUploadRecovery({directory:OUT,batchId:plan.batchId})).length)return {ok:false,code:'UPLOAD_RECOVERY_REQUIRED'};const batch=await loadExistingBatch({batchId:plan.batchId,transactionPath:BATCH_TRANSACTION,outputDir:OUT,trackerPath:TRACKER});assertUploadPlanCurrent(plan,batch);const client=createYouTubeRealClient({config}),channel=await client.channels.mine();if(!channel||channel.id!==config.expectedChannelId||channel.snippet?.title!==config.expectedChannelTitle)return {ok:false,code:'CHANNEL_MISMATCH'};const backup=await backupTracker(TRACKER,`upload-${plan.executionId}`);let tracker=await openTracker(TRACKER);const trackerUpdate=async(op,remote)=>{const timestamp=new Date().toISOString();await updateTrackerRows(tracker,[{short_id:op.shortId,youtube_video_id:remote.id,status:'PRIVATE_UPLOADED',match_status:'CONFIRMED',match_verified_at:timestamp,verification_state:'VERIFIED_PRIVATE_UPLOAD',verification_timestamp:timestamp}]);await saveTracker(tracker);tracker=await openTracker(TRACKER);};const result=await runPrivateUploadPlan({plan,batch,approved:true,approvalPhrase:p.approvalPhrase,adapter:createPrivateUploadAdapter({client,enabled:true}),readRemote:id=>client.videos.list(id),trackerUpdate,executionRecordPath:path.join(OUT,`upload-${plan.executionId}.execution.json`),journalPath:path.join(OUT,`upload-${plan.executionId}.journal.json`)});if(/^INTAKE-/.test(plan.batchId)){const {exportRelatedVideoActions}=await import('./core/draft-intake.mjs');const {readTracker}=await import('./core/tracker-service.mjs');await exportRelatedVideoActions({rows:await readTracker(TRACKER),outputDir:OUT});}return {...result,backup,channel:{id:channel.id,title:channel.snippet?.title}};});
ipcMain.handle('engine:preview-batch',async(_e,batchId='BULK_01')=>{const {previewBatch}=await import('./core/staging-service.mjs'); return previewBatch({transactionPath:BATCH_TRANSACTION,trackerPath:TRACKER,batchId})});
ipcMain.handle('engine:discover-private',async(_e,batchId='BULK_02')=>{if(/^INTAKE-/.test(batchId)){const {discoverIntakeBatch}=await import('./core/draft-desktop.mjs');return discoverIntakeBatch({batchId,trackerPath:TRACKER,outputDir:OUT});}const {discoverPrivateBatch}=await import('./core/youtube-service.mjs'); return discoverPrivateBatch({batchId})});
ipcMain.handle('engine:confirm-matches',async(_e,payload)=>{
  if(/^INTAKE-/.test(payload.batchId)){
    const {discoverIntakeBatch}=await import('./core/draft-desktop.mjs');
    const fresh=await discoverIntakeBatch({batchId:payload.batchId,trackerPath:TRACKER,outputDir:OUT});
    const pairs=value=>(value?.results||[]).filter(row=>row.status==='MATCHED').map(row=>[row.row.short_id,row.videoId]).sort();
    if(JSON.stringify(pairs(fresh))!==JSON.stringify(pairs(payload.discovery)))throw Error('INTAKE_MATCH_PREVIEW_STALE');
    payload={...payload,discovery:fresh};
  }
const {confirmMatches}=await import('./core/match-confirmation.mjs'); return confirmMatches({discovery:payload.discovery,trackerPath:TRACKER,batchId:payload.batchId||'BULK_02'})});
ipcMain.handle('engine:verify-confirmed',async(_e,batchId='BULK_02')=>{const {verifyConfirmedBatch}=await import('./core/youtube-service.mjs'); return verifyConfirmedBatch({batchId})});
ipcMain.handle('engine:preview-metadata',async(_e,batchId='BULK_02')=>{const {previewMetadataSchedule}=await import('./core/youtube-service.mjs'); return previewMetadataSchedule({batchId})});
ipcMain.handle('engine:reconcile-readonly',async(_e,p)=>{try{const {reconcileReadOnly}=await import('./core/recovery-service.mjs');const result=await reconcileReadOnly({journalRow:p.journalRow,readRemote:async()=>p.mockRemote});return {ok:true,status:result.state==='REMOTE_STATE_VERIFIED'?'VERIFIED':'RECONCILIATION_REQUIRED',executionId:p.executionId||null,shortId:p.shortId||null,youtubeId:p.journalRow?.youtube_video_id||null,firstReadPassed:Boolean(result.first?.pass),secondReadPassed:Boolean(result.second?.pass),fields:[...(result.first?.mismatches||[]),...(result.second?.mismatches||[])].map(x=>({field:String(x.field),expected:x.expected??null,actual:x.actual??null,match:false}))};}catch(error){return {ok:false,code:'RECONCILIATION_FAILED',message:String(error.message||error)}}});
ipcMain.handle('engine:recovery-journals',()=>{if(!fs.existsSync(OUT))return [];return fs.readdirSync(OUT).filter(f=>f.toLowerCase().includes('journal')||f.includes('execution')).map(f=>{try{return JSON.parse(fs.readFileSync(path.join(OUT,f),'utf8'))}catch{return null}}).filter(Boolean).flatMap(j=>(j.rows||[]).filter(r=>['APPLIED','APPLIED_UNVERIFIED','VERIFYING','UPLOADING','PRIVATE_UPLOADED','REMOTE_STATE_UNKNOWN','VERIFIED_PENDING_TRACKER','RECONCILIATION_REQUIRED'].includes(String(r.state||'').toUpperCase())).map(r=>({...r,state:String(r.state||'').toUpperCase(),execution_id:j.execution_id||j.executionId,batch_id:j.batch_id||j.batchId,short_id:r.short_id||r.shortId||'',youtube_video_id:r.youtube_video_id||r.youtubeVideoId||''})));});
ipcMain.handle('engine:finalize-recovery',async(_e,p)=>{if(!p?.reconciliation||p.reconciliation.status!=='VERIFIED'||p.reconciliation.firstReadPassed!==true||p.reconciliation.secondReadPassed!==true)return {ok:false,code:'RECONCILIATION_NOT_VERIFIED',message:'Finalize Tracker requires two successful read-only verifications.'};try{const {finalizeTracker}=await import('./core/recovery-service.mjs');const result=await finalizeTracker({trackerPath:TRACKER,shortId:p.shortId,reason:p.reason||'INTERRUPTED_AFTER_REMOTE_WRITE'});return {ok:true,status:'COMPLETE',executionId:p.executionId||null,shortId:p.shortId,trackerUpdated:true,journalState:'COMPLETE',reconciliationReason:p.reason||'INTERRUPTED_AFTER_REMOTE_WRITE',backup:result.backup};}catch(error){return {ok:false,code:'TRACKER_FINALIZATION_FAILED',message:String(error.message||error)}}});
ipcMain.handle('engine:production-review',async(_e,batchId='BULK_03')=>{
  const {loadExistingBatch}=await import('./core/existing-batch-service.mjs');
  const {buildProductionReview}=await import('./core/production-review.mjs');
  const {loadYouTubeConfig,createYouTubeRealClient}=await import('./core/youtube-real-client.mjs');
  const batch=await loadExistingBatch({batchId,transactionPath:BATCH_TRANSACTION,outputDir:OUT,trackerPath:TRACKER});
  const model=buildProductionReview({batchId,rows:batch.trackerRows,manifestRows:batch.manifest.rows});
  const {planTitleIssues}=await import('./core/youtube-title-validation.mjs');
  const config=await loadYouTubeConfig(),client=createYouTubeRealClient({config}),remoteBlockers=planTitleIssues(model.plan),remoteById=new Map();
  for(const row of model.rows.filter(item=>item.productionEligibility==='READY')){
    const remote=await client.videos.list(row.youtubeId);
    remoteById.set(row.youtubeId,remote);
    if(!remote)remoteBlockers.push({shortId:row.shortId,code:'VIDEO_NOT_FOUND'});
    else if(remote.snippet?.channelId!==config.expectedChannelId)remoteBlockers.push({shortId:row.shortId,code:'CHANNEL_MISMATCH'});
    else if(remote.status?.privacyStatus!=='private')remoteBlockers.push({shortId:row.shortId,code:'VIDEO_NOT_PRIVATE'});
    else if(!(await import('./core/draft-desktop.mjs')).remoteMatchesHash(remote,row.hash))remoteBlockers.push({shortId:row.shortId,code:'HASH_TITLE_MISMATCH'});
    if(!row.publishAtUtc||Date.parse(row.publishAtUtc)<=Date.now())remoteBlockers.push({shortId:row.shortId,code:'PUBLISH_TIME_NOT_FUTURE'});
  }
  if(/^INTAKE-/.test(batchId)&&model.plan.operationCount){try{const {validateIntakeProduction}=await import('./core/draft-desktop.mjs');await validateIntakeProduction({rows:batch.trackerRows,plan:model.plan,outputDir:OUT});}catch(error){remoteBlockers.push({code:error.message});}}
  return {...model,blockedCount:model.blockedCount+remoteBlockers.length,remoteBlockers,rows:model.rows.map(row=>{const remote=remoteById.get(row.youtubeId);return {...row,currentYoutubeTitle:remote?.snippet?.title||row.currentYoutubeTitle,currentPrivacy:remote?.status?.privacyStatus||'',channelId:remote?.snippet?.channelId||''};}),batch:{batchId:batch.batchId,startDate:batch.startDate,endDate:batch.endDate,folderPath:batch.folderPath,manifestPath:batch.manifest.manifestPath}};
});
ipcMain.handle('engine:apply-production',async(event,p)=>{
  const {executeProductionRequest}=await import('./core/production-entry.mjs');
  const {readTracker,openTracker,backupTracker,updateTrackerRows,saveTracker}=await import('./core/tracker-service.mjs');
  const {hashExecutionPlan,assertExecutionPlanCurrent}=await import('./core/execution-plan.mjs');
  const {compareRemoteTarget}=await import('./core/production-verification.mjs');
  const plan=p?.executionPlan;
  if(!plan||p?.approved!==true)return {ok:false,code:'EXPLICIT_APPROVAL_REQUIRED'};
  if(p?.dryRun===true){const rows=await readTracker(TRACKER);return executeProductionRequest({request:{...p,executionPlan:plan},rows,realEnabled:false,read:async()=>{},trackerUpdate:async()=>{}});}
  if(process.env.RALSKIES_ENABLE_REAL!=='1')return {ok:false,code:'REAL_PRODUCTION_EXECUTION_DISABLED'};
  if(plan.mode!=='PRODUCTION'||!plan.batchId||plan.planHash!==hashExecutionPlan(plan)||plan.operationCount!==plan.approvedRowIds?.length||plan.youtubeIds?.length!==plan.operationCount)return {ok:false,code:'PLAN_IDENTITY_MISMATCH'};
  const {acquireProductionExecution,releaseProductionExecution,getActiveProductionExecution}=await import('./core/production-execution-lock.mjs');
  if(!acquireProductionExecution({batchId:plan.batchId,executionId:plan.executionId}))return {ok:false,code:'EXECUTION_IN_PROGRESS',message:`${plan.batchId} is already running as ${getActiveProductionExecution(plan.batchId)}.`};
  try{
    const rows=await readTracker(TRACKER);
    try{assertExecutionPlanCurrent(plan,rows);}catch(error){return {ok:false,code:'PLAN_STALE',message:error.message};}
    const {assertPlanTitles}=await import('./core/youtube-title-validation.mjs');
    try{assertPlanTitles(plan);}catch(error){return {ok:false,code:'INVALID_VIDEO_TITLES',message:error.message};}
    const {loadYouTubeConfig,createYouTubeRealClient}=await import('./core/youtube-real-client.mjs');
    const {createRealAdapter,armRealPlan}=await import('./core/youtube-adapter.mjs');
    const config=await loadYouTubeConfig(),client=createYouTubeRealClient({config});
    for(const id of plan.approvedRowIds){
      const row=rows.find(r=>String(r.short_id)===String(id)),video=await client.videos.list(row?.youtube_video_id);
      if(!row||!video||video.id!==row.youtube_video_id||video.snippet?.channelId!==config.expectedChannelId||video.status?.privacyStatus!=='private')return {ok:false,code:'PRODUCTION_PREFLIGHT_FAILED',shortId:id};
    }
    const {validateIntakeProduction}=await import('./core/draft-desktop.mjs');await validateIntakeProduction({rows,plan,outputDir:OUT});
    armRealPlan(plan);
    const backup=await backupTracker(TRACKER,'production-'+plan.executionId);
    let tracker=await openTracker(TRACKER);
    const read=row=>client.videos.list(row.youtube_video_id);
    const trackerUpdate=async row=>{await updateTrackerRows(tracker,[{short_id:row.short_id,status:'SCHEDULED',verification_state:'VERIFIED',verification_timestamp:new Date().toISOString()}]);await saveTracker(tracker);tracker=await openTracker(TRACKER);};
    const onTransition=entry=>{try{if(!event.sender.isDestroyed())event.sender.send('engine:production-progress',{executionId:plan.executionId,batchId:plan.batchId,total:plan.operationCount,shortId:entry.short_id,youtubeId:entry.youtube_video_id,operationIndex:entry.operation_index,state:entry.state,updatedAt:entry.last_updated});}catch{/* Progress rendering must never interrupt the durable runner. */}};
    return await executeProductionRequest({request:{...p,executionPlan:plan,approved:true,executionEnvironment:'REAL'},rows,adapter:createRealAdapter({fakeClient:client,enabled:true}),realEnabled:true,read,verifyRemote:(remote,row)=>compareRemoteTarget({row,remote,channelId:config.expectedChannelId}),trackerUpdate,onTransition,journalPath:path.join(OUT,'production-'+plan.executionId+'.journal.json'),executionRecordPath:path.join(OUT,'production-'+plan.executionId+'.execution.json'),productionLogPath:path.join(OUT,'production-'+plan.executionId+'.log'),trackerBackup:backup});
  }finally{releaseProductionExecution({batchId:plan.batchId,executionId:plan.executionId});}
});
ipcMain.handle('engine:apply-metadata',async(_e,p)=>{if(!p?.executionPlan)throw Error('NO_EXECUTION_PLAN');if(p.dryRun!==true)throw Error('PRODUCTION_APPLY_REQUIRES_EXPLICIT_APPROVAL');const {runPlannedExecution}=await import('./core/production-runner.mjs');const {readTracker}=await import('./core/tracker-service.mjs');return runPlannedExecution({executionPlan:p.executionPlan,rows:await readTracker(TRACKER),mode:'DRY_RUN',read:async()=>{}})});
ipcMain.handle('engine:title-recommend',async(_e,shortId)=>{const {readTracker}=await import('./core/tracker-service.mjs');const {recommendTitle}=await import('./core/title-intelligence.mjs');const row=(await readTracker(TRACKER)).find(r=>String(r.short_id)===String(shortId));if(!row)throw Error('Short not found');return recommendTitle(row)});
ipcMain.handle('engine:title-audit',async()=>{const {readTracker}=await import('./core/tracker-service.mjs');const {auditTitle}=await import('./core/title-intelligence.mjs');return (await readTracker(TRACKER)).map(auditTitle).filter(x=>x.audit==='TITLE_REVIEW_RECOMMENDED')});
ipcMain.handle('engine:title-review-queue',async()=>{const {readTracker}=await import('./core/tracker-service.mjs');const {auditTitle,recommendTitle}=await import('./core/title-intelligence.mjs');const {HUMAN_EDIT_CANDIDATES}=await import('./core/recommendation-variety.mjs');const rows=(await readTracker(TRACKER)).map(auditTitle).filter(x=>x.health!=='TITLE_HEALTHY'&&x.title_review_status!=='TITLE_KEEP_CURRENT').sort((a,b)=>String(a.priority).localeCompare(String(b.priority))||String(a.health).localeCompare(String(b.health)));return Promise.all(rows.map(async row=>({...row,recommendations:(await recommendTitle(row)).recommendations.concat(HUMAN_EDIT_CANDIDATES[row.short_id]?[{title:HUMAN_EDIT_CANDIDATES[row.short_id],family:'HUMAN_EDIT',score:null,warnings:[],supporting_examples:[]}]:[])})));});
ipcMain.handle('engine:approve-title',async(_e,p)=>{const {approveTitle}=await import('./core/title-approval.mjs');return approveTitle({shortId:p.shortId,title:p.title,family:p.family,source:p.source,trackerPath:TRACKER})});
ipcMain.handle('engine:keep-title',async(_e,shortId)=>{const {keepCurrentTitle}=await import('./core/title-approval.mjs');return keepCurrentTitle({shortId,trackerPath:TRACKER})});
ipcMain.handle('engine:settings',()=>fs.existsSync(SETTINGS)?JSON.parse(fs.readFileSync(SETTINGS,'utf8')):{timezone:'Asia/Manila',slots:['17:30','22:30'],optionalSlot:'01:30',protectedWindow:'20:00–21:00',shortsPerDay:2,dryRun:true});
ipcMain.handle('engine:save-settings',(_e,settings)=>{fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(SETTINGS,JSON.stringify(settings,null,2));return settings});
ipcMain.handle('engine:choose-folder',()=>dialog.showOpenDialogSync({properties:['openDirectory']})?.[0]||null);
ipcMain.handle('engine:dry-run',(_e,action)=>({action,dryRun:true,message:'No files, tracker rows, or YouTube resources were modified.'}));
function createWindow(){const win=new BrowserWindow({width:1440,height:930,minWidth:1100,minHeight:700,backgroundColor:'#0b1020',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false}});win.loadFile(path.join(__dirname,'renderer','index.html'))}
app.whenReady().then(async()=>{const {registerDraftDesktop}=await import('./core/draft-desktop.mjs');draftDesktop=registerDraftDesktop({ipcMain,outputDir:OUT,trackerPath:TRACKER,isProductionBusy:()=>trackerMutationBusy,onScan:payload=>{for(const win of BrowserWindow.getAllWindows()){if(!win.isDestroyed())win.webContents.send('engine:draft-changed',payload);}}});const {registerMetadataDesktop}=await import('./core/metadata-suggestions.mjs');const {trackerRepository}=await import('./core/draft-intake.mjs');registerMetadataDesktop({ipcMain,outputDir:OUT,repository:await trackerRepository(TRACKER),isProductionBusy:()=>draftDesktop.isBusy()});createWindow();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow()})}); app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});








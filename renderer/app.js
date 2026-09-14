const state={inventory:null,calendar:[],batches:null,batchDetail:null,selectedBatch:'BULK_03',titleQueue:[],recovery:[],view:'dashboard',modal:null,busy:false,productionBusy:false,productionProgress:null};
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const clean=value=>String(value??'').trim();
const upper=value=>clean(value).toUpperCase();

function counts(detail=state.batchDetail){
  const rows=detail?.readiness||[],total=rows.length;
  return {total,linked:rows.filter(item=>clean(item.tracker?.youtube_video_id)).length,awaiting:rows.filter(item=>item.productionEligibility==='AWAITING_PRIVATE_UPLOAD').length,ready:rows.filter(item=>item.productionEligibility==='READY').length,scheduled:rows.filter(item=>['SCHEDULED','PUBLISHED','COMPLETE'].includes(upper(item.tracker?.status))).length,blocked:rows.filter(item=>item.productionEligibility==='BLOCKED').length};
}
function notify(message,type='success'){
  const root=$('#toast-root');if(!root)return;
  const item=document.createElement('div');item.className=`toast ${type}`;item.innerHTML=`<strong>${type==='error'?'Action failed':'Notification'}</strong><span>${esc(message)}</span>${type==='error'&&window.ErrorGuidance?.describe(message)?'<p>'+esc(window.ErrorGuidance.describe(message))+'</p>':''}`;root.appendChild(item);
  setTimeout(()=>item.remove(),6000);
}
function setModal(title,body,footer=''){state.modal={title,body,footer};render();}
function closeModal(){state.metadataGeneration=(state.metadataGeneration||0)+1;if(state.productionBusy){notify('Production is still running. Wait for a completion or error result.','info');return;}state.modal=null;render();}
function modalHtml(){if(!state.modal)return '';const locked=state.productionBusy;return `<div class="modal-backdrop" ${locked?'':'data-close-modal'}><section class="modal-card" role="dialog" aria-modal="true" aria-label="${esc(state.modal.title)}" data-modal-card><div class="modal-head"><div><p class="eyebrow">WORKFLOW</p><h2>${esc(state.modal.title)}</h2></div>${locked?'':`<button class="icon-button" data-close-modal aria-label="Close">×</button>`}</div><div class="modal-body">${state.modal.body}</div><div class="modal-actions">${state.modal.footer||(locked?'<button class="ghost" disabled>Execution in progress...</button>':'<button class="ghost" data-close-modal>Close</button>')}</div></section></div>`;}
function selectedBatchRecord(){return state.batches?.batches?.find(batch=>batch.batchId===state.selectedBatch);}
function workflow(){
  const c=counts();
  if(!c.total)return {number:0,title:'Select a prepared batch',detail:'Choose a batch to begin.'};
  if(c.scheduled===c.total)return {number:4,title:'Batch complete',detail:'All rows are scheduled or published.'};
  if(c.awaiting)return {number:1,title:'Match private YouTube uploads',detail:`${c.awaiting} hash-titled private videos need to be discovered and linked.`};
  if(c.ready)return {number:2,title:'Apply metadata and schedule',detail:`${c.ready} linked private videos are ready for production review.`};
  return {number:0,title:'Resolve blockers',detail:`${c.blocked} rows require attention before production.`};
}
function summaryCards(){
  const c=counts(),w=workflow();
  return `<div class="grid"><div class="card"><div class="label">Selected batch</div><div class="value">${esc(state.selectedBatch)}</div><div class="hint">${esc(selectedBatchRecord()?.startDate)} to ${esc(selectedBatchRecord()?.endDate)}</div></div><div class="card"><div class="label">Private videos linked</div><div class="value">${c.linked} / ${c.total}</div><div class="hint">${c.awaiting} awaiting match</div></div><div class="card"><div class="label">Ready for metadata</div><div class="value">${c.ready}</div><div class="hint">${c.scheduled} already complete</div></div><div class="card"><div class="label">Next step</div><div class="value small">Step ${w.number||'—'}</div><div class="hint">${esc(w.title)}</div></div></div>`;
}
function dashboard(){
  const w=workflow();
  return `${summaryCards()}<section class="panel section"><div class="section-title"><h2>Current workflow</h2><span class="pill">PRIVATE → MATCH → METADATA → SCHEDULE</span></div><ol class="steps"><li class="${w.number===1?'current':''}"><strong>Find private uploads</strong><span>Read hash titles from the Ralskies YouTube channel.</span></li><li class="${w.number===2?'current':''}"><strong>Confirm exact matches</strong><span>Persist YouTube IDs only after one-to-one hash matching.</span></li><li class="${w.number===2?'current':''}"><strong>Review metadata and schedule</strong><span>Compare the current hash title with the final tracker title and publish time.</span></li><li class="${w.number===4?'current':''}"><strong>Apply and verify</strong><span>Update sequentially, read back every video, then update the tracker.</span></li></ol><div class="callout"><strong>${esc(w.title)}</strong><span>${esc(w.detail)}</span></div><div class="button-row"><button class="primary" data-continue-workflow ${[1,2].includes(w.number)?'':'disabled'}>${w.number===4?'Batch Complete':`Continue ${esc(state.selectedBatch)}`}</button><button class="ghost" data-view-batches>Choose another batch</button></div></section>`;
}
function videos(){
  const rows=(state.inventory?.files||[]).slice(0,100);
  return `<section class="panel"><div class="section-title"><h2>Local video inventory</h2><span class="pill">${state.inventory?.files?.length||0} MP4 files</span></div><table><thead><tr><th>File</th><th>SHA-256</th><th>Size</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.name)}</td><td class="mono">${esc(row.hash)}</td><td>${(row.size/1048576).toFixed(1)} MB</td></tr>`).join('')}</tbody></table></section>`;
}
function batchTable(){
  return (state.batches?.batches||[]).map(batch=>{const detail=batch.detail,c=counts(detail),selected=batch.batchId===state.selectedBatch;return `<tr class="${selected?'selected-row':''}"><td><strong>${esc(batch.batchId)}</strong></td><td>${esc(batch.startDate)} to ${esc(batch.endDate)}</td><td>${c.total||batch.itemCount||0}</td><td>${c.linked}</td><td>${c.scheduled}</td><td><button class="ghost" data-select-batch="${esc(batch.batchId)}">${selected?'Selected':'Select'}</button><button class="ghost" data-inspect-batch="${esc(batch.batchId)}">Inspect</button></td></tr>`;}).join('');
}
function batches(){
  const c=counts(),w=workflow();
  return `<section class="panel"><div class="section-title"><div><h2>Prepared batches</h2><p class="subtle">The app uses the existing bulk folders and manifests. It does not restage them.</p></div><span class="pill">${esc(state.selectedBatch)}</span></div><table><thead><tr><th>Batch</th><th>Date range</th><th>Rows</th><th>YouTube IDs</th><th>Complete</th><th>Actions</th></tr></thead><tbody>${batchTable()}</tbody></table></section><section class="panel section"><div class="section-title"><h2>${esc(state.selectedBatch)} production flow</h2><span class="pill">NEXT: ${esc(w.title)}</span></div>${summaryCards()}<div class="button-row"><button class="ghost" data-bulk-meta-audit>Check Metadata</button><button class="primary" data-discover-private ${c.awaiting?'':'disabled'}>1. Find &amp; Match Private Videos</button><button class="ghost" data-metadata-review ${c.ready?'':'disabled'}>2. Review Metadata &amp; Schedule</button><button class="ghost" data-upload-review ${c.awaiting?'':'disabled'}>Upload Missing Videos via API</button></div><p class="subtle">Upload new files privately through the API, or upload hashed files manually and use Find &amp; Match Private Videos.</p></section>`;
}
function queue(){
  const rows=state.batchDetail?.readiness||[];
  return `<section class="panel"><div class="section-title"><h2>${esc(state.selectedBatch)} queue</h2><span class="pill">${rows.length} rows</span></div><table><thead><tr><th>Short ID</th><th>Song</th><th>YouTube ID</th><th>PHT schedule</th><th>Status</th><th>Next action</th></tr></thead><tbody>${rows.map(item=>{const row=item.tracker||{};return `<tr><td>${esc(row.short_id||item.identity?.shortId)}</td><td>${esc(row.source_song||item.manifest?.song)}</td><td class="mono">${esc(row.youtube_video_id||'Not linked')}</td><td>${esc(row.scheduled_date)} ${esc(row.scheduled_time)}</td><td><span class="pill">${esc(row.status||item.classification)}</span></td><td>${esc(item.productionEligibility)}</td></tr>`;}).join('')}</tbody></table></section>`;
}
function calendar(){
  const rows=state.calendar||[];
  return `<section class="panel"><div class="section-title"><h2>Schedule calendar</h2><span class="pill">Asia/Manila</span></div>${rows.length?`<table><thead><tr><th>Date / time</th><th>Short</th><th>Status</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.scheduled_time||row.scheduled_date||'')}</td><td>${esc(row.file||row.short_id||'')}</td><td>${esc(row.status||'READY')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">No separate calendar artifact is stored. The authoritative schedules are visible in Upload Queue.</div>'}</section>`;
}
function youtube(){
  const c=counts();
  return `<section class="panel"><div class="section-title"><h2>YouTube production service</h2><span class="pill">Ralskies · PRIVATE FIRST</span></div><div class="grid"><div class="card"><div class="label">Channel</div><div class="value small">Ralskies</div><div class="hint">UCIt8eA8uvrDVbpta0pgIc5Q</div></div><div class="card"><div class="label">Selected batch</div><div class="value">${esc(state.selectedBatch)}</div></div><div class="card"><div class="label">Private IDs linked</div><div class="value">${c.linked} / ${c.total}</div></div><div class="card"><div class="label">Ready to schedule</div><div class="value">${c.ready}</div></div></div><div class="button-row"><button class="primary" data-discover-private ${c.awaiting?'':'disabled'}>Sync Existing Private Videos</button><button class="ghost" data-metadata-review ${c.ready?'':'disabled'}>Metadata &amp; Schedule Review</button></div><div class="callout"><strong>No duplicate upload is needed.</strong><span>The sync reads each private video's hash title, matches it to the selected batch, and stores the existing YouTube ID after confirmation.</span></div></section>`;
}
function titleLab(){
  const item=state.titleQueue?.[0];if(!item)return '<section class="panel"><div class="empty">No unresolved title reviews.</div></section>';
  return `<section class="panel"><div class="section-title"><h2>Title Lab</h2><span class="pill">${state.titleQueue.length} reviews</span></div><div class="callout"><strong>${esc(item.short_id)}</strong><span>${esc(item.current_title)}</span></div><div class="grid section">${item.recommendations.map((rec,index)=>`<div class="card"><div class="label">Option ${String.fromCharCode(65+index)}</div><div class="value small">${esc(rec.title)}</div><div class="hint">${esc(rec.family)}</div><button class="ghost" data-title-option="${index}">Review this title</button></div>`).join('')}</div><button class="ghost" data-keep-title>Keep current title</button></section>`;
}
function settings(){
  const s=state.settings||{};
  return `<section class="panel settings"><div class="section-title"><h2>Production settings</h2><span class="pill">LOCAL</span></div><label>Timezone<input id="setting-timezone" value="${esc(s.timezone||'Asia/Manila')}"></label><label>Daily slots<input id="setting-slots" value="${esc((s.slots||['17:30','22:30']).join(', '))}"></label><label>Shorts per day<input id="setting-count" type="number" min="1" max="5" value="${esc(s.shortsPerDay||2)}"></label><button class="primary" data-save-settings>Save Settings</button></section>`;
}
function logs(){
  return `<section class="panel"><div class="section-title"><h2>Recovery and activity</h2><span class="pill">${state.recovery.length} recovery items</span></div>${state.recovery.length?state.recovery.map(row=>`<div class="callout"><strong>${esc(row.short_id)} · ${esc(row.state)}</strong><span>Execution ${esc(row.execution_id)} · YouTube ${esc(row.youtube_video_id||'unknown')}</span></div>`).join(''):'<div class="empty">No unresolved production recovery items.</div>'}</section>`;
}
function currentView(){return state.view==='drafts'?window.DraftViews.drafts(state,esc):state.view==='dashboard'?dashboard():state.view==='videos'?videos():state.view==='calendar'?(window.DraftViews?window.DraftViews.calendar(state,esc):calendar()):state.view==='queue'?queue():state.view==='batches'?batches():state.view==='youtube'?youtube():state.view==='title-lab'?titleLab():state.view==='settings'?settings():logs();}
function render(){const title={drafts:'Drafts',dashboard:'Dashboard',videos:'Videos',calendar:'Calendar',queue:'Upload Queue',batches:'Batches',youtube:'YouTube','title-lab':'Title Lab',settings:'Settings',logs:'Logs'}[state.view]||'Dashboard';$('#view-title').textContent=title;$('#view').innerHTML=currentView();$('#modal-root').innerHTML=modalHtml();document.querySelectorAll('nav button').forEach(button=>button.classList.toggle('active',button.dataset.view===state.view));}
async function refresh(){
  const [inventory,calendar,batches,titleQueue,recovery,settings]=await Promise.all([window.ralskies.inventory(),window.ralskies.calendar(),window.ralskies.batches(),window.ralskies.titleReviewQueue(),window.ralskies.recoveryJournals(),window.ralskies.settings()]);
  Object.assign(state,{inventory,calendar,batches,titleQueue,recovery,settings});
  if(window.ralskies.draftStatus)state.drafts=await window.ralskies.draftStatus();
  if(!batches?.batches?.some(batch=>batch.batchId===state.selectedBatch))state.selectedBatch=batches?.batches?.[0]?.batchId||'BULK_03';
  state.batchDetail=batches?.batches?.find(batch=>batch.batchId===state.selectedBatch)?.detail||(batches?.batches?.length?await window.ralskies.batchDetail(state.selectedBatch):null);
  render();
}
async function selectBatch(batchId){state.view='batches';state.selectedBatch=batchId;state.batchDetail=await window.ralskies.batchDetail(batchId);state.modal=null;render();notify(`${batchId} selected. ${workflow().title}.`);}
function batchDetailBody(detail){const c=counts(detail);return `<div class="grid"><div class="card">Rows: ${c.total}</div><div class="card">Linked: ${c.linked}</div><div class="card">Ready: ${c.ready}</div><div class="card">Complete: ${c.scheduled}</div></div><dl class="details"><dt>Folder</dt><dd>${esc(detail.folderPath)}</dd><dt>Manifest</dt><dd>${esc(detail.manifest?.manifestPath)}</dd></dl><div class="button-row"><button class="primary" data-discover-private>Find private videos</button><button class="ghost" data-metadata-review>Metadata review</button></div>`;}
async function discoverPrivate(){
  notify(`Reading private YouTube videos for ${state.selectedBatch}…`,'info');
  const result=await window.ralskies.discoverPrivate(state.selectedBatch);state.discovery=result;
  const matched=result.counts?.MATCHED||0,missing=result.missing?.length||0,cleanMatch=matched===result.expected&&missing===0&&(result.counts?.DUPLICATE_MATCH||0)===0;
  const rows=(result.results||[]).filter(row=>['MATCHED','ALREADY_LINKED','DUPLICATE_MATCH'].includes(row.status)).map(row=>`<tr><td>${esc(row.status)}</td><td class="mono">${esc(row.videoId)}</td><td class="mono">${esc(row.hash||'Not a selected-batch hash')}</td><td>${esc(row.row?.short_id||'—')}</td></tr>`).join('');
  const body=`<div class="grid"><div class="card">Expected: ${result.expected}</div><div class="card">Matched: ${matched}</div><div class="card">Missing: ${missing}</div><div class="card">Unrelated private videos: ${(result.counts?.UNKNOWN||0)+(result.counts?.INVALID_HASH_TITLE||0)}</div></div><div class="callout"><strong>${cleanMatch?'Exact selected-batch match found':'Match is not complete'}</strong><span>Unrelated private videos are shown only as an information count and do not block this batch.</span></div><table><thead><tr><th>Result</th><th>YouTube ID</th><th>Hash title</th><th>Short ID</th></tr></thead><tbody>${rows}</tbody></table>`;
  const footer=`<button class="ghost" data-close-modal>Close</button><button class="primary" data-confirm-matches ${cleanMatch?'':'disabled'}>Confirm ${matched} Exact Matches</button>`;
  setModal(`${state.selectedBatch} · Private Video Match`,body,footer);notify(cleanMatch?`${matched} exact private-video matches found. Review and confirm them.`:`Only ${matched} of ${result.expected} expected matches were found.`,cleanMatch?'success':'error');
}
async function confirmMatches(){
  const result=await window.ralskies.confirmMatches({batchId:state.selectedBatch,discovery:state.discovery});
  state.batchDetail=await window.ralskies.batchDetail(state.selectedBatch);
  setModal('Matches saved',`<div class="success-box"><strong>${result.verified} YouTube IDs verified and linked.</strong><p>The videos remain private and still have their hash titles. The next step applies the tracker metadata and schedules.</p></div>`,'<button class="ghost" data-close-modal>Close</button><button class="primary" data-metadata-review>Review Metadata &amp; Schedule</button>');
  notify(`${result.verified} private videos linked to ${state.selectedBatch}.`);
}
async function metadataReview(){
  notify(`Reading current YouTube state for ${state.selectedBatch}…`,'info');
  const model=await window.ralskies.productionReview(state.selectedBatch);state.productionReview=model;
  const rows=model.rows.filter(row=>row.productionEligibility==='READY').map(row=>`<tr><td>${row.order}</td><td>${esc(row.shortId)}</td><td>${esc(row.song)}</td><td class="mono">${esc(row.youtubeId)}</td><td class="mono">${esc(row.currentYoutubeTitle)}</td><td>${esc(row.finalAuthoritativeTitle)}</td><td>${esc(row.schedulePht)}</td><td>${esc(row.publishAtUtc)}</td></tr>`).join('');
  const blockers=[...(model.remoteBlockers||[]),...(model.exclusions||[]).filter(item=>String(item.reason).startsWith('BLOCKED'))];
  const body=`<div class="grid"><div class="card">Linked: ${model.youtubeLinkedCount}</div><div class="card">Ready: ${model.readyCount}</div><div class="card">Writes: ${model.plannedOperationCount}</div><div class="card">Blockers: ${blockers.length}</div></div><div class="callout"><strong>Current YouTube values were read live.</strong><span>The hash title will be replaced by the final tracker title. Description, tags, category and publishAt will also be applied.</span></div>${blockers.length?`<div class="error-box">${blockers.map(item=>`${esc(item.shortId)}: ${esc(item.code||item.reason)}`).join('<br>')}</div>`:''}<table><thead><tr><th>#</th><th>Short</th><th>Song</th><th>YouTube ID</th><th>Current title</th><th>Final title</th><th>PHT</th><th>UTC</th></tr></thead><tbody>${rows}</tbody></table>`;
  const footer=`<button class="ghost" data-close-modal>Close</button><button class="primary" data-request-production ${model.plannedOperationCount&&blockers.length===0?'':'disabled'}>Continue to Final Approval</button>`;
  setModal(`${state.selectedBatch} · Metadata & Schedule Review`,body,footer);notify(blockers.length?`Review blocked by ${blockers.length} issue(s).`:`${model.plannedOperationCount} videos are ready for final approval.`,blockers.length?'error':'success');
}
function productionProgressBody(){
  const progress=state.productionProgress||{},total=Number(progress.total||0),completed=progress.completedIds?.size||0,percent=total?Math.round(completed/total*100):0;
  const row=progress.currentShortId?`<div class="progress-current"><strong>${esc(progress.currentShortId)}</strong><span>${esc(progress.currentState||'STARTING')}</span></div>`:'<div class="progress-current"><strong>Preparing protected execution</strong><span>STARTING</span></div>';
  return `<div class="progress-box" role="status" aria-live="polite"><div class="progress-summary"><strong>${completed} of ${total} complete</strong><span>${percent}%</span></div><progress data-production-progress max="${total||1}" value="${completed}">${percent}%</progress>${row}<p>Each video is updated, read back, verified, and recorded before the next video starts.</p><p><strong>Do not click Apply again or close the app while this is running.</strong></p></div>`;
}
function showProductionProgress(){state.modal={title:`Applying ${state.productionReview?.batchId||'batch'}`,body:productionProgressBody(),footer:'<button class="ghost" disabled>Execution in progress...</button>'};render();}
function handleProductionProgress(payload){
  const expected=state.productionReview?.plan?.executionId||state.productionReview?.plan?.execution_id;
  if(!state.productionBusy||!payload||String(payload.executionId)!==String(expected))return;
  const progress=state.productionProgress;if(payload.state==='COMPLETE')progress.completedIds.add(String(payload.shortId));progress.currentShortId=payload.shortId||progress.currentShortId;progress.currentState=payload.state||progress.currentState;showProductionProgress();
}
function requestProduction(){
  const model=state.productionReview,phrase=`APPLY ${model.batchId}`;
  setModal('Final production approval',`<div class="warning-box"><strong>THIS WILL MODIFY REAL YOUTUBE VIDEOS.</strong><p>${model.plannedOperationCount} existing private videos will receive metadata and future schedules, sequentially. No uploads will occur.</p></div><label>Type exactly <strong>${esc(phrase)}</strong><input id="production-phrase" autocomplete="off"></label>`,'<button class="ghost" data-close-modal>Cancel</button><button class="primary" data-confirm-production>Apply Metadata & Schedule</button>');
}
async function applyProduction(){
  const model=state.productionReview,expected=`APPLY ${model.batchId}`,actual=$('#production-phrase')?.value;
  if(actual!==expected){notify(`Approval phrase must be exactly: ${expected}`,'error');return;}
  if(state.productionBusy){notify('This production execution is already running.','info');return;}
  state.productionBusy=true;state.productionProgress={total:model.plannedOperationCount,completedIds:new Set(),currentShortId:'',currentState:'STARTING'};showProductionProgress();
  notify(`Production started for ${model.plannedOperationCount} private videos. Progress is shown in this window.`,'info');
  try{
    const result=await window.ralskies.applyProduction({approved:true,executionEnvironment:'REAL',executionPlan:model.plan,planHash:model.planHash});
    if(!result?.ok){state.productionBusy=false;state.productionProgress=null;const code=result?.code||'UNKNOWN',message=result?.message||'No remote write was started by this request.';setModal(code==='EXECUTION_IN_PROGRESS'?'Production already running':'Production stopped',`<div class="error-box"><strong>${esc(code)}</strong><p>${esc(message)}</p><p>${esc(window.ErrorGuidance?.describe(message)||window.ErrorGuidance?.describe(code)||'Review Logs / Recovery before trying again.')}</p></div>`);notify(code==='EXECUTION_IN_PROGRESS'?'Production is already running. Watch the active progress window.':`Production stopped: ${code}`,code==='EXECUTION_IN_PROGRESS'?'info':'error');return;}
    state.productionBusy=false;state.productionProgress=null;
    setModal('Production execution complete',`<div class="success-box"><strong>${model.plannedOperationCount} operations completed.</strong><p>Each video was written, read back, verified, and then recorded in the tracker.</p></div>`);notify(`${model.batchId} metadata and schedules were applied successfully.`);
    try{await refresh();setModal('Production execution complete',`<div class="success-box"><strong>${model.plannedOperationCount} operations completed.</strong><p>Each video was written, read back, verified, and then recorded in the tracker.</p></div>`);}catch(refreshError){notify(`Execution completed, but screen refresh failed: ${refreshError?.message||refreshError}`,'error');}
  }catch(error){state.productionBusy=false;state.productionProgress=null;const code=error?.code||'PRODUCTION_EXECUTION_ERROR';setModal('Production stopped',`<div class="error-box"><strong>${esc(code)}</strong><p>${esc(error?.message||String(error))}</p><p>Do not retry until Logs / Recovery shows whether a remote write occurred.</p><p>${esc(window.ErrorGuidance?.describe(error?.message)||window.ErrorGuidance?.describe(code)||"")} </p></div>`);notify(`Production stopped: ${code}`,'error');}
}
async function uploadReview(){
  const model=await window.ralskies.uploadReview(state.selectedBatch);state.uploadReview=model;
  const rows=model.rows.map(row=>`<tr><td>${row.order}</td><td>${esc(row.shortId)}</td><td>${esc(row.song)}</td><td>${esc(row.schedulePht)}</td><td class="mono">${esc(row.filePath)}</td></tr>`).join('');
  setModal(`${state.selectedBatch} · API Private Upload`,`<div class="warning-box"><strong>Use this only for videos not already uploaded.</strong><p>Your current hash-titled private videos should be handled with Find & Match instead.</p></div><table><thead><tr><th>#</th><th>Short</th><th>Song</th><th>Schedule</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table><label>Type exactly <strong>${esc(model.approvalPhrase)}</strong><input id="upload-phrase" autocomplete="off"></label>`,`<button class="ghost" data-close-modal>Cancel</button><button class="primary" data-confirm-upload ${model.enabled&&model.operationCount?'':'disabled'}>Upload as Private</button>`);
}
async function applyUpload(){
  const model=state.uploadReview,phrase=$('#upload-phrase')?.value;if(phrase!==model.approvalPhrase){notify(`Approval phrase must be exactly: ${model.approvalPhrase}`,'error');return;}
  const result=await window.ralskies.applyPrivateUpload({approved:true,approvalPhrase:phrase,uploadPlan:model.plan});if(!result?.ok){notify(`Upload blocked: ${result?.code||'UNKNOWN'}`,'error');return;}await refresh();closeModal();notify(`${result.completed} private uploads completed and verified.`);
}

document.addEventListener('click',async event=>{
  const target=event.target;
  if(target.matches('[data-close-modal]')){closeModal();return;}
  try{
    if(target.closest('button')?.getAttributeNames().some(name=>name.startsWith('data-bulk-meta-'))){await window.BulkMetadata.action(target);return;}
    const nav=target.closest('nav button');if(nav){state.view=nav.dataset.view;render();return;}
    if(target.closest('button')?.getAttributeNames().some(name=>name.startsWith('data-llm-'))){await metadataAction(target);return;}
    if(target.closest('button')?.getAttributeNames().some(name=>name.startsWith('data-draft-')||name.startsWith('data-calendar-'))){await draftAction(target);return;}
    const select=target.closest('[data-select-batch]');if(select){await selectBatch(select.dataset.selectBatch);return;}
    const inspect=target.closest('[data-inspect-batch]');if(inspect){await selectBatch(inspect.dataset.inspectBatch);setModal(`${state.selectedBatch} · Batch Details`,batchDetailBody(state.batchDetail));return;}
    if(target.closest('[data-view-batches]')){state.view='batches';render();return;}
    if(target.closest('[data-continue-workflow]')){const step=workflow().number;if(step===1)await discoverPrivate();else if(step===2)await metadataReview();else notify(workflow().detail,'info');return;}
    if(target.closest('[data-discover-private]')){await discoverPrivate();return;}
    if(target.closest('[data-confirm-matches]')){await confirmMatches();return;}
    if(target.closest('[data-metadata-review]')){await metadataReview();return;}
    if(target.closest('[data-request-production]')){requestProduction();return;}
    if(target.closest('[data-confirm-production]')){await applyProduction();return;}
    if(target.closest('[data-upload-review]')){await uploadReview();return;}
    if(target.closest('[data-confirm-upload]')){await applyUpload();return;}
    if(target.id==='refresh'){notify('Refreshing tracker, manifests and local inventory…','info');await refresh();notify('Application state refreshed.');return;}
    const option=target.closest('[data-title-option]');if(option){const item=state.titleQueue[0],rec=item.recommendations[Number(option.dataset.titleOption)];setModal('Confirm local title edit',`<p><strong>Current:</strong> ${esc(item.current_title)}</p><p><strong>New:</strong> ${esc(rec.title)}</p><p>This changes the local tracker only.</p>`,'<button class="ghost" data-close-modal>Cancel</button><button class="primary" data-confirm-title>Edit Local Tracker</button>');state.pendingTitle=rec;return;}
    if(target.closest('[data-confirm-title]')){const item=state.titleQueue[0],rec=state.pendingTitle;await window.ralskies.approveTitle({shortId:item.short_id,title:rec.title,family:rec.family,source:'LOCAL_RAG'});await refresh();closeModal();notify('Local tracker title updated.');return;}
    if(target.closest('[data-keep-title]')){await window.ralskies.keepTitle(state.titleQueue[0].short_id);await refresh();notify('Current title marked as human reviewed.');return;}
    if(target.closest('[data-save-settings]')){state.settings=await window.ralskies.saveSettings({...(state.settings||{}),timezone:$('#setting-timezone').value,slots:$('#setting-slots').value.split(',').map(value=>value.trim()).filter(Boolean),shortsPerDay:Number($('#setting-count').value)});notify('Settings saved.');return;}
  }catch(error){notify(error?.message||String(error),'error');}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.modal)closeModal();});
if(typeof window.ralskies.onProductionProgress==='function')window.ralskies.onProductionProgress(handleProductionProgress);
refresh().catch(error=>{render();notify(`Startup failed: ${error?.message||error}`,'error');});

async function refreshDrafts(){
  if(window.ralskies.draftStatus)state.drafts=await window.ralskies.draftStatus();
  state.calendar=await window.ralskies.calendar();
  const batches=await window.ralskies.batches();state.batches=batches;
  if(state.selectedBatch)state.batchDetail=batches?.batches?.find(batch=>batch.batchId===state.selectedBatch)?.detail||state.batchDetail;
  render();
}
function showDraftSchedule(){
  const batches=[...new Set((state.drafts?.rows||[]).map(row=>row.batch_id))];
  if(!batches.length){notify('Intake new drafts first.','info');return;}
  setModal('Reserve posting times',`<p>Reserve empty slots locally. Publication is applied later through the batch review.</p><label>New batch<select id="draft-schedule-batch">${batches.map(id=>`<option value="${esc(id)}" ${id===state.selectedBatch?'selected':''}>${esc(id)}</option>`).join('')}</select></label><label>Start date (Manila)<input type="date" id="draft-start" value="${new Date(Date.now()+8*3600000).toISOString().slice(0,10)}"></label><label>Available times, separated by commas<input id="draft-slots" value="17:30, 22:30"></label><label>Frequency<select id="draft-cadence"><option value="daily">Daily</option><option value="every-other-day">Every other day</option></select></label><label class="checkbox-label"><input id="draft-optional" type="checkbox"> Enable optional 01:30 slot</label><p>20:00–21:00 is always reserved for manual posts. Existing reservations and old batches remain unchanged.</p>`,'<button class="ghost" data-close-modal>Cancel</button><button class="primary" data-draft-reservation-preview>Preview Reservations</button>');
}
async function draftAction(target){
  if(target.closest('[data-draft-folder]')){
    const folder=await window.ralskies.chooseFolder();if(folder){await window.ralskies.draftConfigure({draftFolder:folder,enabled:false});await refreshDrafts();}return true;
  }
  if(target.closest('[data-draft-watch]')){
    await window.ralskies.draftConfigure({enabled:!state.drafts?.settings?.enabled});await refreshDrafts();return true;
  }
  if(target.closest('[data-draft-preview],[data-draft-scan]')){
    const dryRun=Boolean(target.closest('[data-draft-preview]')),result=await window.ralskies.draftScan({dryRun});
    await refreshDrafts();
    setModal(dryRun?'Intake preview':'Intake result',`<p>${result.added.length} ${dryRun?'would be added':'added'} · ${result.skipped.length} already tracked · ${result.waiting.length} still copying · ${result.exceptions.length} exceptions</p><p>${dryRun?'No files or tracker rows were changed.':'New drafts are available below. No YouTube upload occurred.'}</p><ul>${result.added.map(row=>`<li>${esc(row.original_filename)} → ${esc(row.short_id)}</li>`).join('')}${result.exceptions.map(item=>`<li>${esc(item.message)}</li>`).join('')}</ul>`);return true;
  }
  const edit=target.closest('[data-draft-edit]');
  if(edit){
    const row=state.drafts.rows.find(item=>item.short_id===edit.dataset.draftEdit);state.editingDraft=row.short_id;
    setModal('Draft metadata',`<p>${esc(row.original_filename)} · ${esc(row.short_id)}</p>${[['public_title','Title'],['source_song','Song'],['artist_or_fandom','Artist / fandom'],['youtube_tags','Tags (comma separated)'],['related_video_id','Related video ID (optional)']].map(([key,label])=>`<label>${label}<input id="draft-meta-${key}" value="${esc(row[key])}" ${key==='public_title'?'maxlength="100"':''}></label>`).join('')}<label>Description<textarea id="draft-meta-description" rows="6" maxlength="5000">${esc(row.description)}</textarea></label><label>Category<select id="draft-meta-category"><option value="">Choose category</option><option value="Music" ${row.category==='Music'?'selected':''}>Music</option></select></label><p>Blank required fields keep this draft waiting for metadata. Changes apply to this draft only.</p>`,'<button class="ghost" data-close-modal>Cancel</button><button class="primary" data-draft-metadata-save>Save Metadata</button>');return true;
  }
  if(target.closest('[data-draft-metadata-save]')){
    const metadata=Object.fromEntries(['public_title','description','source_song','artist_or_fandom','youtube_tags','related_video_id','category'].map(key=>[key,$('#draft-meta-'+key).value]));
    await window.ralskies.draftMetadata({shortId:state.editingDraft,metadata});state.modal=null;await refreshDrafts();notify('Draft metadata saved.');return true;
  }
  if(target.closest('[data-draft-schedule]')){showDraftSchedule();return true;}
  if(target.closest('[data-draft-reservation-preview]')){
    const plan=await window.ralskies.draftReservePreview({batchId:$('#draft-schedule-batch').value,startDate:$('#draft-start').value,slots:$('#draft-slots').value.split(',').map(value=>value.trim()).filter(Boolean),cadence:$('#draft-cadence').value,optionalSlot:$('#draft-optional').checked});
    state.reservationPlan=plan;
    setModal('Review local reservations',`<p>${plan.updates.length} new reservations. YouTube sync: ${esc(plan.snapshotAt||'not yet synced; tracker only')}.</p><table><thead><tr><th>Short</th><th>Date</th><th>Time (Manila)</th></tr></thead><tbody>${plan.updates.map(row=>`<tr><td>${esc(row.short_id)}</td><td>${esc(row.scheduled_date)}</td><td>${esc(row.scheduled_time)}</td></tr>`).join('')}</tbody></table>`,'<button class="ghost" data-close-modal>Cancel</button><button class="primary" data-draft-reservation-save '+(plan.updates.length?'':'disabled')+'>Save Reservations</button>');return true;
  }
  if(target.closest('[data-draft-reservation-save]')){
    await window.ralskies.draftReserve({plan:state.reservationPlan});state.modal=null;await refreshDrafts();notify('Posting times reserved locally.');return true;
  }
  const link=target.closest('[data-draft-link]');
  if(link){state.linkingDraft=link.dataset.draftLink;setModal('Link private YouTube upload',`<p>Upload the hashed MP4 and finish saving it as Private. Keep the hash filename or hash title so the program can verify the match.</p><label>YouTube video URL or ID<input id="draft-youtube-id"></label>`,'<button class="ghost" data-close-modal>Cancel</button><button class="primary" data-draft-link-save>Verify and Link</button>');return true;}
  if(target.closest('[data-draft-link-save]')){
    let videoId=$('#draft-youtube-id').value.trim();
    if(videoId.includes('://')){const url=new URL(videoId);if(!['youtube.com','www.youtube.com','youtu.be','m.youtube.com'].includes(url.hostname))throw Error('Enter a YouTube URL');videoId=url.hostname==='youtu.be'?url.pathname.slice(1):url.searchParams.get('v')||url.pathname.split('/').at(-1);}
    await window.ralskies.draftLink({shortId:state.linkingDraft,videoId});state.modal=null;await refreshDrafts();notify('Existing private upload linked.');return true;
  }
  if(target.closest('[data-calendar-sync]')){state.calendar=await window.ralskies.calendarSync();render();notify('YouTube calendar synced.');return true;}
  const month=target.closest('[data-calendar-month]');
  if(month){const current=state.calendarMonth||new Date(Date.now()+8*3600000).toISOString().slice(0,7),date=new Date(current+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+Number(month.dataset.calendarMonth));state.calendarMonth=date.toISOString().slice(0,7);render();return true;}
  return false;
}
document.addEventListener('change',event=>{if(event.target.id==='calendar-month'&&event.target.value){state.calendarMonth=event.target.value;render();}});

if(typeof window.ralskies.onDraftChanged==='function')window.ralskies.onDraftChanged(result=>{
  notify(result.exceptions?'Intake stopped. See Drafts for the logged exception.':result.added+' new draft(s) registered.',result.exceptions?'error':'info');
  if(!state.modal&&!state.productionBusy)refreshDrafts().catch(error=>notify(error.message,'error'));
});

function lmConnectionInput(){
  let host=$('#lm-host').value.trim();if(host==='::1')host='[::1]';
  const port=$('#lm-port').value.trim();
  if(!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535)throw Error('Enter a port from 1 to 65535.');
  return {baseUrl:$('#lm-protocol').value+'://'+host+':'+port+'/v1',model:$('#lm-model').value.trim(),timeoutSeconds:Number($('#lm-timeout').value)};
}
async function showLmSettings(){
  const config=await window.ralskies.metadataSettings(),url=new URL(config.baseUrl);
  setModal('LM Studio connection',`<p>Connect to the model you already serve in LM Studio.</p><label>Local server address<input id="lm-host" value="${esc(url.hostname)}" placeholder="127.0.0.1"></label><label>Port<input id="lm-port" type="number" min="1" max="65535" value="${esc(url.port||'1234')}"></label><label>Protocol<select id="lm-protocol"><option value="http" ${url.protocol==='http:'?'selected':''}>HTTP</option><option value="https" ${url.protocol==='https:'?'selected':''}>HTTPS</option></select></label><label>Model ID (optional if the server exposes one model)<input id="lm-model" value="${esc(config.model)}" placeholder="Use the model already served by LM Studio"></label><label>Generation timeout (seconds)<input id="lm-timeout" type="number" min="30" max="600" value="${esc(config.timeoutSeconds||300)}"></label><div id="lm-connection-status" class="subtle" role="status">In LM Studio, enable the server in the Developer tab.</div>`,'<button class="ghost" data-close-modal>Close</button><button class="ghost" data-llm-test>Test Connection</button><button class="primary" data-llm-save-settings>Save Connection</button>');
}
function showMetadataPrompt(shortId){
  const row=state.drafts?.rows?.find(item=>item.short_id===shortId);if(!row)throw Error('Draft not found');
  state.suggestDraftId=shortId;
  const context=state.metadataContext||{};
  setModal('Suggest missing metadata',`<p>${esc(row.original_filename||row.file_name)} · ${esc(shortId)}</p><p>Give Qwen the cover details and any useful clip notes. Suggestions stay separate until you review and save them.</p><label>Song name<input id="lm-song" value="${esc(row.source_song||context.song||'')}"></label><label>Original artist / fandom (optional)<input id="lm-artist" value="${esc(row.artist_or_fandom||context.artist||'')}"></label><label>Clip notes<textarea id="lm-notes" rows="3" maxlength="2000" placeholder="For example: the final chorus, soft opening, or dramatic high note"></textarea></label><label>Writing style (optional)<input id="lm-style" maxlength="500" value="${esc(context.style||'Concise, natural, and specific to this cover')}"></label><p>Song details and your notes are sent to your configured local LM Studio server.</p>`,'<button class="ghost" data-close-modal>Cancel</button><button class="ghost" data-llm-settings>Connection Settings</button><button class="primary" data-llm-generate>Generate Suggestions</button>');
}
function showMetadataCandidates(){
  const suggestion=state.metadataSuggestion;
  setModal('Review metadata suggestions',`<p>Model: ${esc(suggestion.model)}. Only missing metadata will be filled.</p><div class="metadata-candidates">${suggestion.candidates.map((candidate,index)=>`<article class="card"><h3>${esc(candidate.title)}</h3><p class="metadata-description">${esc(candidate.description)}</p><p class="subtle">Tags: ${esc(candidate.tags.join(', '))}</p><button class="primary" data-llm-pick="${index}">Review This Suggestion</button></article>`).join('')}</div>`);
}
async function metadataAction(target){
  if(target.closest('[data-llm-settings]')){await showLmSettings();return;}
  if(target.closest('[data-llm-test]')){
    const input=lmConnectionInput(),box=$('#lm-connection-status');box.textContent='Connecting to LM Studio…';
    try{const models=await window.ralskies.metadataModels(input);box.textContent=models.length?'Connected. Available model IDs: '+models.map(item=>item.id).join(', '):'Connected, but the server exposes no models.';}catch(error){box.textContent=error.message;}
    return;
  }
  if(target.closest('[data-llm-save-settings]')){
    await window.ralskies.metadataSettingsSave(lmConnectionInput());state.modal=null;render();notify('LM Studio connection saved.');return;
  }
  const suggest=target.closest('[data-llm-suggest]');if(suggest){showMetadataPrompt(suggest.dataset.llmSuggest);return;}
  if(target.closest('[data-llm-generate]')){
    if(state.llmBusy){notify('A metadata request is still running.','info');return;}
    const context={song:$('#lm-song').value,artist:$('#lm-artist').value,clipNotes:$('#lm-notes').value,style:$('#lm-style').value};
    if(!context.song.trim())throw Error('Enter the song name first.');
    state.metadataContext=context;
    const requestId=(state.metadataGeneration||0)+1;state.metadataGeneration=requestId;state.llmBusy=true;
    setModal('Generating metadata suggestions','<p>Your local model is writing suggestions. This may take several minutes, depending on your model and configured timeout.</p><p>No tracker metadata is changed by generation.</p>');
    try{
      const suggestion=await window.ralskies.metadataGenerate({shortId:state.suggestDraftId,context});
      if(state.metadataGeneration===requestId){state.metadataSuggestion=suggestion;showMetadataCandidates();}
    }catch(error){if(state.metadataGeneration===requestId){state.modal=null;render();notify(error.message,'error');}}
    finally{state.llmBusy=false;}
    return;
  }
  const pick=target.closest('[data-llm-pick]');
  if(pick){
    const suggestion=state.metadataSuggestion,index=Number(pick.dataset.llmPick),candidate=suggestion.candidates[index],row=state.drafts.rows.find(item=>item.short_id===suggestion.shortId);
    state.metadataCandidateIndex=index;
    const fields={public_title:row.public_title||candidate.title,description:row.description||candidate.description,youtube_tags:row.youtube_tags||candidate.tags.join(', ')};
    setModal('Approve draft metadata',`<p>Review or edit the missing fields before saving. Existing metadata is shown read-only.</p><label>Title<input id="lm-review-public_title" maxlength="100" value="${esc(fields.public_title)}" ${suggestion.missingFields.includes('public_title')?'':'readonly'}></label><label>Description<textarea id="lm-review-description" rows="6" maxlength="5000" ${suggestion.missingFields.includes('description')?'':'readonly'}>${esc(fields.description)}</textarea></label><label>Tags<input id="lm-review-youtube_tags" value="${esc(fields.youtube_tags)}" ${suggestion.missingFields.includes('youtube_tags')?'':'readonly'}></label><label>Category<select id="lm-review-category" ${row.category?'disabled':''}><option value="Music">Music</option></select></label><p>Song: ${esc(row.source_song||suggestion.context.song)}. Artist / fandom: ${esc(row.artist_or_fandom||suggestion.context.artist||'Not supplied')}.</p>`,'<button class="ghost" data-llm-back>Other Suggestions</button><button class="primary" data-llm-approve>Approve &amp; Save to Tracker</button>');return;
  }
  if(target.closest('[data-llm-back]')){showMetadataCandidates();return;}
  if(target.closest('[data-llm-approve]')){
    const suggestion=state.metadataSuggestion,edits=Object.fromEntries(suggestion.missingFields.map(key=>[key,$('#lm-review-'+key).value]));
    await window.ralskies.metadataApprove({id:suggestion.id,candidateIndex:state.metadataCandidateIndex,edits,category:$('#lm-review-category').value,approved:true});
    state.modal=null;await refreshDrafts();notify('Approved metadata saved to this draft.');return;
  }
}

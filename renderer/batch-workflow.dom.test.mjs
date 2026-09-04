import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';

const source=await fs.readFile(new URL('./app.js',import.meta.url),'utf8');
const hashA='A'.repeat(64),hashB='B'.repeat(64);
function detail(linked=false){return {batchId:'BULK_03',folderPath:'G:\\RS_BULK\\BULK_03',manifest:{manifestPath:'G:\\RS_BULK\\BULK_03\\BULK_MANIFEST.xlsx'},readiness:[hashA,hashB].map((hash,index)=>({classification:'MATCHED',identity:{shortId:`RS-${index}`,hash},manifest:{song:`Song ${index}`},metadata:{state:'METADATA_READY'},productionEligibility:linked?'READY':'AWAITING_PRIVATE_UPLOAD',tracker:{short_id:`RS-${index}`,source_song:`Song ${index}`,file_hash:hash,youtube_video_id:linked?`YT-${index}`:'',scheduled_date:'2026-09-14',scheduled_time:index?'22:30':'17:30',status:'BATCH_READY'}}))};}
const dom=new JSDOM('<body><div class="app"><aside><nav><button data-view="dashboard"></button><button data-view="batches">Batches</button></nav></aside><main><h1 id="view-title"></h1><button id="refresh"></button><section id="view"></section></main></div><div id="modal-root"></div><div id="toast-root"></div></body>',{runScripts:'outside-only'});
const {window}=dom;let linked=false,confirmCalls=0,productionCalls=0,progressCallback,resolveProduction;
const productionResult=new Promise(resolve=>{resolveProduction=resolve;});
window.ralskies={
  inventory:async()=>({files:[],dashboard:{}}),calendar:async()=>[],titleReviewQueue:async()=>[],recoveryJournals:async()=>[],settings:async()=>({timezone:'Asia/Manila',slots:['17:30','22:30'],shortsPerDay:2}),
  batches:async()=>({batches:[{batchId:'BULK_03',startDate:'2026-09-14',endDate:'2026-09-20',itemCount:2,detail:detail(linked)}]}),batchDetail:async()=>detail(linked),
  discoverPrivate:async()=>({batchId:'BULK_03',expected:2,selectedRows:2,missing:[],counts:{MATCHED:2,UNKNOWN:3,ALREADY_LINKED:0,DUPLICATE_MATCH:0,INVALID_HASH_TITLE:1},results:[{status:'MATCHED',videoId:'YT-0',hash:hashA,row:{short_id:'RS-0'}},{status:'MATCHED',videoId:'YT-1',hash:hashB,row:{short_id:'RS-1'}}]}),
  confirmMatches:async()=>{confirmCalls++;linked=true;return {verified:2};},
  productionReview:async()=>({batchId:'BULK_03',youtubeLinkedCount:2,readyCount:2,plannedOperationCount:2,blockedCount:0,remoteBlockers:[],exclusions:[],planHash:'plan-hash',plan:{executionId:'test-execution',operationCount:2},rows:[{order:1,shortId:'RS-0',song:'Song 0',youtubeId:'YT-0',hash:hashA,currentYoutubeTitle:hashA,finalAuthoritativeTitle:'Final Song 0',schedulePht:'2026-09-14 17:30',publishAtUtc:'2026-09-14T09:30:00.000Z',productionEligibility:'READY'},{order:2,shortId:'RS-1',song:'Song 1',youtubeId:'YT-1',hash:hashB,currentYoutubeTitle:hashB,finalAuthoritativeTitle:'Final Song 1',schedulePht:'2026-09-14 22:30',publishAtUtc:'2026-09-14T14:30:00.000Z',productionEligibility:'READY'}]}),
  applyProduction:async()=>{productionCalls++;return productionResult;},onProductionProgress:callback=>{progressCallback=callback;return()=>{};},uploadReview:async()=>({}),applyPrivateUpload:async()=>({ok:true}),approveTitle:async()=>({}),keepTitle:async()=>({}),saveSettings:async value=>value
};
vm.runInContext(source,dom.getInternalVMContext());await new Promise(resolve=>setTimeout(resolve,0));
test('guided production workflow locks repeated Apply clicks and reports persisted progress',async()=>{
  assert.match(window.document.body.textContent,/Current workflow/);
  window.document.querySelector('[data-view="batches"]').click();assert.match(window.document.querySelector('#view').textContent,/Find & Match Private Videos/);
  window.document.querySelector('[data-discover-private]').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.match(window.document.querySelector('#modal-root').textContent,/Exact selected-batch match found/);assert.match(window.document.querySelector('#modal-root').textContent,/Unrelated private videos: 4/);assert.equal(window.document.querySelector('[data-confirm-matches]').disabled,false);assert.ok(window.document.querySelector('.toast'));
  window.document.querySelector('[data-confirm-matches]').click();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(confirmCalls,1,window.document.body.textContent);assert.match(window.document.querySelector('#modal-root').textContent,/2 YouTube IDs verified and linked/);
  window.document.querySelector('[data-metadata-review]').click();await new Promise(resolve=>setTimeout(resolve,0));assert.match(window.document.querySelector('#modal-root').textContent,/Current YouTube values were read live/);assert.match(window.document.querySelector('#modal-root').textContent,/Final Song 0/);
  window.document.querySelector('[data-request-production]').click();assert.ok(window.document.querySelector('#production-phrase'));assert.match(window.document.querySelector('#modal-root').textContent,/APPLY BULK_03/);assert.equal(productionCalls,0);
  window.document.querySelector('#production-phrase').value='APPLY BULK_03';
  window.document.querySelector('[data-confirm-production]').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(productionCalls,1);
  assert.match(window.document.querySelector('#modal-root').textContent,/0 of 2 complete/);
  assert.ok(window.document.querySelector('[data-production-progress]'));
  assert.equal(window.document.querySelector('[data-confirm-production]'),null);
  assert.equal(window.document.querySelector('[data-close-modal]'),null);
  window.document.querySelector('.modal-backdrop').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(productionCalls,1);
  assert.match(window.document.querySelector('#modal-root').textContent,/Execution in progress/);
  progressCallback({executionId:'test-execution',shortId:'RS-0',state:'PRECHECK'});
  assert.match(window.document.querySelector('#modal-root').textContent,/RS-0/);
  progressCallback({executionId:'test-execution',shortId:'RS-0',state:'COMPLETE'});
  assert.match(window.document.querySelector('#modal-root').textContent,/1 of 2 complete/);
  assert.equal(Number(window.document.querySelector('[data-production-progress]').value),1);
  resolveProduction({ok:true});await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(productionCalls,1);
  assert.match(window.document.querySelector('#modal-root').textContent,/Production execution complete/);
  assert.doesNotMatch(window.document.querySelector('#toast-root').textContent,/PLAN_STALE/);
  dom.window.close();
});

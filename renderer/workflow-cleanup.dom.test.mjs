import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {JSDOM} from 'jsdom';
test('five-screen navigation, saved reservation defaults, and historical log pagination work',async()=>{
 const dom=new JSDOM(await fs.readFile(new URL('./index.html',import.meta.url),'utf8'),{runScripts:'outside-only'}),w=dom.window;
 const settings={timezone:'Asia/Manila',slots:['01:30','22:30'],optionalSlotEnabled:true};
 w.ralskies={calendar:async()=>({events:[]}),batches:async()=>({batches:[]}),titleReviewQueue:async()=>[],recoveryJournals:async()=>[],settings:async()=>settings,saveSettings:async value=>value,draftStatus:async()=>({settings:{},rows:[{short_id:'NEW',batch_id:'INTAKE-TEST',status:'AWAITING_METADATA'}]}),activityHistory:async()=>({total:101,entries:Array.from({length:101},(_,i)=>({event:'Saved event '+i}))})};
 w.eval((await Promise.all(['draft-views.js','app.js'].map(f=>fs.readFile(new URL(f,import.meta.url),'utf8')))).join('\n'));const settle=()=>new Promise(r=>setTimeout(r,0));await settle();
 assert.deepEqual([...w.document.querySelectorAll('nav button')].map(b=>b.dataset.view),['drafts','batches','calendar','settings','logs']);assert.equal(w.document.querySelector('#view-title').textContent,'Drafts');
 w.document.querySelector('[data-draft-schedule]').click();assert.equal(w.document.querySelector('#draft-window-start').value,'20:00');assert.equal(w.document.querySelector('#draft-window-end').value,'02:00');assert.equal(w.document.querySelector('#draft-optional').checked,true);
 w.document.querySelector('[data-close-modal]').click();w.document.querySelector('[data-view="settings"]').click();assert.equal(w.document.querySelector('#setting-timezone').readOnly,true);assert.equal(w.document.querySelector('#setting-count'),null);
 w.document.querySelector('[data-view="logs"]').click();await settle();assert.match(w.document.querySelector('#view').textContent,/Saved event 0/);assert.doesNotMatch(w.document.querySelector('#view').textContent,/Saved event 100/);w.document.querySelector('[data-history-page="1"]').click();assert.match(w.document.querySelector('#view').textContent,/Saved event 100/);
 dom.window.close();
});

test('completed batches are hidden by default and can be opened in upload history',async()=>{
 const dom=new JSDOM(await fs.readFile(new URL('./index.html',import.meta.url),'utf8'),{runScripts:'outside-only'}),w=dom.window;
 const detail={readiness:[{tracker:{status:'SCHEDULED',short_id:'RS-1'},productionEligibility:'BLOCKED'}]};
 w.ralskies={calendar:async()=>({events:[]}),batches:async()=>({batches:[{batchId:'BULK_DONE',detail}]}),titleReviewQueue:async()=>[],recoveryJournals:async()=>[],settings:async()=>({}),draftStatus:async()=>({settings:{},rows:[]})};
 w.eval((await Promise.all(['draft-views.js','app.js'].map(f=>fs.readFile(new URL(f,import.meta.url),'utf8')))).join('\n'));await new Promise(r=>setTimeout(r,0));
 w.document.querySelector('[data-view="batches"]').click();assert.match(w.document.querySelector('#view').textContent,/No active batches/);assert.equal(w.document.querySelector('[data-select-batch]'),null);
 w.document.querySelector('[data-toggle-upload-history]').click();assert.equal(w.document.querySelector('[data-select-batch]').dataset.selectBatch,'BULK_DONE');
 w.document.querySelector('[data-toggle-upload-history]').click();assert.equal(w.document.querySelector('[data-select-batch]'),null);assert.match(w.document.querySelector('#view').textContent,/No active batches/);dom.window.close();
});

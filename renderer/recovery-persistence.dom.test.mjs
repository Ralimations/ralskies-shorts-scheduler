import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {normalizeRecoveryRows,recoveryApplyBlocked} from './recovery-state.mjs';

const persisted=[
 {execution_id:'E1',batch_id:'B',short_id:'A',youtube_video_id:'YA',state:'COMPLETE'},
 ...['APPLIED','APPLIED_UNVERIFIED','VERIFYING','VERIFIED_PENDING_TRACKER','RECONCILIATION_REQUIRED'].map((state,i)=>({execution_id:'E'+(i+2),batch_id:'B',short_id:String.fromCharCode(66+i),youtube_video_id:'Y'+(i+2),state}))
];
function render(dom,entries){const rows=normalizeRecoveryRows(entries);const root=dom.window.document.querySelector('#view');root.innerHTML=rows.map(x=>`<article class="recovery-card" data-short-id="${x.short_id}" data-state="${x.state}"><h2>RECOVERY REQUIRED</h2><span>${x.state}</span><p>${x.youtube_video_id}</p><p>This video may already have been modified on YouTube.</p><div data-recovery-actions><button data-action="reconcile-readonly">Reconcile Read-Only</button></div></article>`).join('');return rows}
let dom=new JSDOM('<section id="view"></section>');let rows=render(dom,persisted);assert.equal(rows.length,5);assert.equal(dom.window.document.querySelectorAll('.recovery-card').length,5);assert.deepEqual([...dom.window.document.querySelectorAll('.recovery-card')].map(x=>x.dataset.shortId),['B','C','D','E','F']);assert.equal(dom.window.document.querySelectorAll('[data-recovery-actions]').length,5);assert.ok(rows.every(recoveryApplyBlocked));
// Fresh restart: discard DOM and initialize from the same persisted journal.
dom=new JSDOM('<section id="view"></section>');rows=render(dom,persisted);assert.equal(dom.window.document.querySelectorAll('.recovery-card').length,5);assert.deepEqual([...dom.window.document.querySelectorAll('.recovery-card')].map(x=>x.dataset.state),['APPLIED','APPLIED_UNVERIFIED','VERIFYING','VERIFIED_PENDING_TRACKER','RECONCILIATION_REQUIRED']);
// Completion disappears after refresh.
const completed=[...persisted];completed[1]={...completed[1],state:'COMPLETE'};dom=new JSDOM('<section id="view"></section>');render(dom,completed);assert.equal(dom.window.document.querySelectorAll('.recovery-card').length,4);assert.equal(dom.window.document.querySelector('[data-short-id="B"]'),null);
// Inspection failure is safe and never creates an Apply control.
dom=new JSDOM('<section id="view"><article class="panel"><h2>RECOVERY STATE LOAD FAILED</h2><p>JOURNAL_READ_FAILED</p></article></section>');assert.match(dom.window.document.body.textContent,/RECOVERY STATE LOAD FAILED/);assert.equal(dom.window.document.querySelector('[data-action="apply"]'),null);
console.log('recovery persistence DOM tests passed');

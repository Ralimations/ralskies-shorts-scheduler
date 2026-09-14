import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {JSDOM} from 'jsdom';
test('metadata audit exposes editable fixes, compares manifest values, and saves only on user action',async()=>{
 const html=await fs.readFile(new URL('./index.html',import.meta.url),'utf8'),dom=new JSDOM(html,{runScripts:'outside-only'}),w=dom.window;
 let saves=0;
 const item={shortId:'RS-1',song:'Example song',status:'BATCH_READY',editable:true,revision:'rev',values:{public_title:'x'.repeat(105),description:'Cover details',youtube_tags:'cover,music',hashtags:'#Cover',related_video_id:''},sourceValues:{public_title:'Reviewed manifest title'},differences:[{field:'public_title',tracker:'x'.repeat(105),manifest:'Reviewed manifest title'}],problems:[{code:'TITLE_TOO_LONG',message:'Title too long',solution:'Shorten it'}],manifestProblems:[],suggestedTitle:'Shorter suggestion'};
 const audit={batchId:'BULK_06',manifestPath:'fixture/manifest.xlsx',items:[item],problemCount:1,differenceCount:1};
 w.ralskies={inventory:async()=>({files:[]}),calendar:async()=>({events:[]}),batches:async()=>({batches:[{batchId:'BULK_06',detail:{readiness:[{tracker:{status:'BATCH_READY'}}]}}]}),titleReviewQueue:async()=>[],recoveryJournals:async()=>[],settings:async()=>({}),draftStatus:async()=>({settings:{},rows:[]}),bulkMetadataAudit:async()=>audit,bulkMetadataSave:async p=>{saves++;assert.equal(p.edits.public_title,'Reviewed manifest title');assert.equal(p.revision,'rev');assert.equal(p.edits.status,undefined);return {remoteWrites:0};}};
 const scripts=await Promise.all(['draft-views.js','error-guidance.js','app.js','bulk-metadata.js'].map(name=>fs.readFile(new URL(name,import.meta.url),'utf8')));w.eval(scripts.join('\n'));
 const settle=()=>new Promise(r=>setTimeout(r,0));await settle();
 w.document.querySelector('[data-view="batches"]').click();w.document.querySelector('[data-bulk-meta-audit]').click();await settle();
 w.document.querySelector('[data-bulk-meta-edit]').click();assert.equal(w.document.querySelector('[data-bulk-meta-save]').disabled,true);
 w.document.querySelector('[data-bulk-meta-source]').click();assert.equal(saves,0);assert.equal(w.document.querySelector('[data-bulk-meta-save]').disabled,false);
 w.document.querySelector('[data-bulk-meta-save]').click();await settle();assert.equal(saves,1);
 assert.match(w.ErrorGuidance.describe('OAuth invalid_grant'),/sign-in/);assert.match(w.ErrorGuidance.describe('VERIFICATION_MISMATCH'),/already have succeeded/);
 item.editable=false;item.readonlyReason='Recovery required';w.document.querySelector('[data-bulk-meta-edit]').click();assert.equal(w.document.querySelector('[data-bulk-meta-save]'),null);
 dom.window.close();
});

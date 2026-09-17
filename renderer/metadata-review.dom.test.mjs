import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await fs.readFile(new URL('./index.html',import.meta.url),'utf8'),appSource=await fs.readFile(new URL('./app.js',import.meta.url),'utf8'),views=await fs.readFile(new URL('./draft-views.js',import.meta.url),'utf8');
test('LM Studio stays idle until requested; address/port settings and review approval are explicit UI actions',async()=>{
  const dom=new JSDOM(html,{runScripts:'outside-only'}),{window}=dom;
  let generated=0,approved=0,models=0,savedConfig;
  const row={short_id:'RS-NEW',batch_id:'INTAKE-NEW',status:'AWAITING_METADATA',scheduled_date:'2035-01-01',scheduled_time:'22:00',file_name:'new.mp4',source_song:'Example Song',public_title:'Already approved title'};
  const suggestion={id:'12345678-1234-1234-1234-123456789012',shortId:row.short_id,model:'existing-qwen',missingFields:['description','youtube_tags'],context:{song:'Example Song',artist:'Original Artist'},candidates:[{title:'Model alternative',description:'Suggested cover description',tags:['cover','music']}]};
  window.ralskies={
    inventory:async()=>({files:[]}),calendar:async()=>({events:[]}),batches:async()=>({batches:[]}),titleReviewQueue:async()=>[],recoveryJournals:async()=>[],settings:async()=>({slots:['17:30','22:30']}),
    draftStatus:async()=>({settings:{enabled:false},rows:[row]}),
    metadataSettings:async()=>({baseUrl:'http://127.0.0.1:1234/v1',model:''}),
    metadataModels:async()=>{models++;return [{id:'existing-qwen'}];},
    metadataSettingsSave:async value=>{savedConfig=value;return value;},
    metadataGenerate:async value=>{generated++;assert.equal(value.context.song,'Example Song');return suggestion;},
    metadataApprove:async value=>{approved++;assert.equal(value.approved,true);assert.equal(value.edits.public_title,undefined);assert.equal(value.edits.description,'Human reviewed description');row.description=value.edits.description;row.youtube_tags=value.edits.youtube_tags;row.category='Music';row.status='BATCH_READY';return {state:'APPROVED'};}
  };
  window.eval(views);window.eval(appSource);
  const settle=()=>new Promise(resolve=>setTimeout(resolve,0));await settle();
  assert.equal(generated,0);assert.equal(models,0);
  window.document.querySelector('[data-view="drafts"]').click();
  window.document.querySelector('[data-llm-settings]').click();await settle();
  window.document.querySelector('#lm-port').value='4321';
  window.document.querySelector('[data-llm-test]').click();await settle();assert.equal(models,1);assert.equal(generated,0);
  window.document.querySelector('[data-llm-save-settings]').click();await settle();
  assert.equal(savedConfig.baseUrl,'http://127.0.0.1:4321/v1');assert.equal(savedConfig.model,'');assert.equal(savedConfig.timeoutSeconds,300);
  window.document.querySelector('[data-llm-suggest]').click();await settle();
  window.document.querySelector('[data-llm-generate]').click();await settle();
  assert.equal(generated,1);assert.equal(approved,0);assert.match(window.document.querySelector('#modal-root').textContent,/Review metadata suggestions/);
  window.document.querySelector('[data-llm-pick]').click();await settle();
  assert.equal(window.document.querySelector('#lm-review-public_title').readOnly,true);
  assert.equal(window.document.querySelector('#lm-review-public_title').value,'Already approved title');
  window.document.querySelector('#lm-review-description').value='Human reviewed description';
  assert.equal(approved,0);
  window.document.querySelector('[data-llm-approve]').click();await settle();
  assert.equal(approved,1);assert.equal(row.public_title,'Already approved title');dom.window.close();
});

test('queue generation uses filenames without typed context and applies only on review',async()=>{
 const dom=new JSDOM(html,{runScripts:'outside-only'}),{window}=dom;
 const row={short_id:'NEW',batch_id:'INTAKE-NEW',status:'AWAITING_METADATA',original_filename:'Wait For Me - Hadestown - Broadway (1).mp4'};
 let generated=0,approved=0;
 const report={id:'batch',state:'REVIEW_REQUIRED',total:1,errors:[],entries:[{shortId:'NEW',filename:row.original_filename,suggestion:{missingFields:['public_title','description','youtube_tags'],candidates:[{title:'Could I sing in Hadestown?',description:'My Wait For Me cover.',tags:['Hadestown','cover']}]}}]};
 window.ralskies={inventory:async()=>({files:[]}),calendar:async()=>({events:[]}),batches:async()=>({batches:[]}),titleReviewQueue:async()=>[],recoveryJournals:async()=>[],settings:async()=>({slots:['20:00']}),draftStatus:async()=>({settings:{enabled:false},rows:[row]}),
 metadataQueueGenerate:async()=>{generated++;return report;},metadataQueueStatus:async()=>report,
 metadataQueueApprove:async p=>{approved++;assert.equal(p.approved,true);assert.equal(p.selections[0].title,'Could I sing in Hadestown?');return {applied:1};}};
 window.eval(views);window.eval(appSource);
 const settle=()=>new Promise(resolve=>setTimeout(resolve,0));await settle();
 window.document.querySelector('[data-view="drafts"]').click();
 window.document.querySelector('[data-llm-suggest]').click();await settle();
 assert.equal(window.document.querySelector('#lm-song').value,'Wait For Me - Hadestown - Broadway');
 window.document.querySelector('[data-close-modal]').click();
 window.document.querySelector('[data-llm-queue]').click();await settle();
 assert.equal(generated,1);assert.equal(approved,0);
 assert.equal(window.document.querySelector('[data-queue-title]').value,'Could I sing in Hadestown?');
 window.document.querySelector('[data-llm-queue-apply]').click();await settle();
 assert.equal(approved,1);dom.window.close();
});

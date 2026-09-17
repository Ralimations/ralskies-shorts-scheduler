import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await fs.readFile(new URL('./draft-views.js',import.meta.url),'utf8');
test('draft view exposes missing metadata and preserves legacy batch navigation',()=>{
  const dom=new JSDOM('<body><main></main></body>',{runScripts:'outside-only'});dom.window.eval(source);
  const esc=value=>String(value??'').replaceAll('<','&lt;').replaceAll('"','&quot;');
  dom.window.document.querySelector('main').innerHTML=dom.window.DraftViews.drafts({drafts:{settings:{draftFolder:'G:/drafts',enabled:true},rows:[{short_id:'RS-NEW',original_filename:'<script>bad</script>.mp4',batch_id:'INTAKE-NEW',status:'AWAITING_METADATA'}]}},esc);
  assert.match(dom.window.document.body.textContent,/Needs title, description, tags, category/);
  assert.equal(dom.window.document.querySelectorAll('script').length,0);
  assert.equal(dom.window.document.querySelector('[data-draft-edit]').disabled,false);
  assert.equal(dom.window.document.querySelector('[data-llm-suggest]').disabled,false);
  assert.equal(dom.window.document.querySelector('[data-select-batch]').dataset.selectBatch,'INTAKE-NEW');
  assert.match(dom.window.document.body.textContent,/Watching folder/);dom.window.close();
});
test('calendar renders a whole month with reservation provenance and protected slots',()=>{
  const dom=new JSDOM('<body><main></main></body>',{runScripts:'outside-only'});dom.window.eval(source);
  const events=[{pht:'2027-09-14 17:30',title:'Reserved cover',state:'RESERVED',source:'TRACKER'},{pht:'2027-09-15 22:30',title:'Scheduled cover',state:'YOUTUBE_SCHEDULED',source:'YOUTUBE'}];
  dom.window.document.querySelector('main').innerHTML=dom.window.DraftViews.calendar({calendarMode:'month',calendarMonth:'2027-09',calendar:{events,syncedAt:'2027-09-01T00:00:00Z'}},value=>String(value??''));
  assert.equal(dom.window.document.querySelectorAll('article.calendar-day').length,30);
  assert.equal(dom.window.document.querySelectorAll('.calendar-event.local').length,1);
  assert.equal(dom.window.document.querySelectorAll('.calendar-event.remote').length,1);
  assert.match(dom.window.document.body.textContent,/20:01-21:00 manual only/);
  assert.match(dom.window.document.body.textContent,/YOUTUBE SCHEDULED/);dom.window.close();
});

test('calendar defaults to readable agenda and safely falls back from an invalid month',()=>{
 const dom=new JSDOM('<body><main></main></body>',{runScripts:'outside-only'});dom.window.eval(source);
 const html=dom.window.DraftViews.calendar({calendarMonth:'invalid',calendar:{events:[]}},v=>String(v??''));
 dom.window.document.querySelector('main').innerHTML=html;
 assert.ok(dom.window.document.querySelector('.calendar-agenda'));assert.equal(dom.window.document.querySelector('.calendar-grid'),null);
 assert.match(dom.window.document.querySelector('#calendar-month').value,/^\d{4}-\d{2}$/);dom.window.close();
});

test('calendar hides past posts by default, exposes history on demand, and flags live retirement conflicts',()=>{
 const dom=new JSDOM('<body><main></main></body>',{runScripts:'outside-only'});dom.window.eval(source);
 const calendar={events:[{pht:'2020-01-01 20:00',at:'2020-01-01T12:00:00Z',title:'Old published cover',state:'PUBLISHED'},{pht:'2099-01-02 20:00',at:'2099-01-02T12:00:00Z',title:'Still live on YouTube',state:'RETIRED_STILL_SCHEDULED',source:'YOUTUBE'}],syncedAt:'2026-09-16T13:14:22Z',syncStatus:{error:'Connection unavailable'}};
 const state={calendarMonth:'2020-01',calendar,calendarMode:'month'};
 const main=dom.window.document.querySelector('main'),esc=v=>String(v??'');
 main.innerHTML=dom.window.DraftViews.calendar(state,esc);
 assert.doesNotMatch(main.textContent,/Old published cover/);assert.match(main.textContent,/1 retired videos are still scheduled/);assert.match(main.textContent,/YouTube sync failed/);
 main.innerHTML=dom.window.DraftViews.calendar({...state,showCalendarHistory:true},esc);
 assert.match(main.textContent,/Old published cover/);assert.match(main.textContent,/Hide past posts/);
 dom.window.close();
});

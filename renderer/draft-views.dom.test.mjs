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
  assert.equal(dom.window.document.querySelector('[data-select-batch]').dataset.selectBatch,'INTAKE-NEW');
  assert.match(dom.window.document.body.textContent,/Watching folder/);dom.window.close();
});
test('calendar renders a whole month with reservation provenance and protected slots',()=>{
  const dom=new JSDOM('<body><main></main></body>',{runScripts:'outside-only'});dom.window.eval(source);
  const events=[{pht:'2027-09-14 17:30',title:'Reserved cover',state:'RESERVED',source:'TRACKER'},{pht:'2027-09-15 22:30',title:'Scheduled cover',state:'YOUTUBE_SCHEDULED',source:'YOUTUBE'}];
  dom.window.document.querySelector('main').innerHTML=dom.window.DraftViews.calendar({calendarMonth:'2027-09',calendar:{events,syncedAt:'2027-09-01T00:00:00Z'}},value=>String(value??''));
  assert.equal(dom.window.document.querySelectorAll('article.calendar-day').length,30);
  assert.equal(dom.window.document.querySelectorAll('.calendar-event.local').length,1);
  assert.equal(dom.window.document.querySelectorAll('.calendar-event.remote').length,1);
  assert.equal(dom.window.document.querySelectorAll('.calendar-protected').length,30);
  assert.match(dom.window.document.body.textContent,/YOUTUBE SCHEDULED/);dom.window.close();
});

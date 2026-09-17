import test from 'node:test';import assert from 'node:assert/strict';
import {windowSlots,planReservations} from './schedule-calendar.mjs';
import {summarizeAnalytics,weeklyRange,generateWeeklyReview} from './weekly-analytics.mjs';
test('overnight window keeps chronological order and excludes protected and optional times',()=>{
 const slots=windowSlots({windowStart:'20:00',windowEnd:'02:00',intervalMinutes:30});
 assert.equal(slots[0],'20:00');assert.ok(slots.indexOf('23:30')<slots.indexOf('00:00'));assert.equal(slots.at(-1),'02:00');assert.ok(!slots.includes('01:30'));assert.ok(!slots.includes('21:00'));
 assert.ok(windowSlots({windowStart:'23:30',windowEnd:'02:00',intervalMinutes:30,optionalSlot:true}).includes('01:30'));
});
test('nightly quotas and occupied slots place early morning on the following date, leaving older rows untouched',()=>{
 const drafts=['A','B','C'].map(short_id=>({short_id,batch_id:'INTAKE-NEW',status:'AWAITING_METADATA'})),legacy={short_id:'OLD',batch_id:'BULK_01',status:'SCHEDULED',scheduled_date:'2030-01-01',scheduled_time:'23:30'};
 const rows=[...drafts,legacy],before=JSON.stringify(rows);
 const plan=planReservations({rows,batchId:'INTAKE-NEW',startDate:'2030-01-01',windowStart:'23:30',windowEnd:'00:30',intervalMinutes:30,postsPerDay:2,now:Date.parse('2030-01-01T00:00:00Z')});
 assert.deepEqual(plan.updates.map(r=>[r.scheduled_date,r.scheduled_time]),[['2030-01-02','00:00'],['2030-01-02','00:30'],['2030-01-02','23:30']]);assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(planReservations({...plan,rows,now:Date.parse('2030-01-01T00:00:00Z')}).fingerprint,plan.fingerprint);
});
test('weekly analytics maps by headers and labels release-time evidence separately from audience activity',()=>{
 const report=summarizeAnalytics({report:{columnHeaders:[{name:'video'},{name:'views'},{name:'averageViewDuration'}],rows:[['vid',42,18]]},rows:[{youtube_video_id:'vid',public_title:'Cover',source_song:'Song'}],videos:[{id:'vid',snippet:{title:'Current cover',publishedAt:'2030-01-01T14:00:00Z'},status:{privacyStatus:'public'}}],range:{startDate:'2030-01-01',endDate:'2030-01-07'}});
 assert.equal(report.entries[0].title,'Current cover');assert.equal(report.timing[0].time,'22:00');assert.equal(report.timing[0].samples,1);assert.match(report.limitation,/exploratory/);
 assert.equal((Date.parse(weeklyRange().endDate)-Date.parse(weeklyRange().startDate))/86400000,6);
});
test('weekly LLM receives creative evidence without schedules, paths, or video identifiers',async()=>{
 let payload;
 const result=await generateWeeklyReview({report:{entries:[{title:'Cover',topic:'Song',views:5,releaseTime:'22:00',youtubeId:'secret-id',file_path:'secret-path'}]},config:{baseUrl:'http://127.0.0.1:1234',model:'qwen',timeoutSeconds:30},fetchImpl:async(url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'Try a song-specific title.'}}]})};}});
 assert.equal(result.text,'Try a song-specific title.');assert.doesNotMatch(payload.messages[1].content,/secret-id|secret-path|22:00/);
});

test('metadata IPC allows an unreserved draft to reach model configuration',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path'),{registerMetadataDesktop}=await import('./metadata-suggestions.mjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'metadata-gate-')),handlers=new Map();
 registerMetadataDesktop({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},outputDir:dir,repository:{read:async()=>[{short_id:'NEW',batch_id:'INTAKE-NEW',status:'AWAITING_METADATA'}]}});
 await fs.writeFile(path.join(dir,'lm-studio-settings.json'),JSON.stringify({baseUrl:'http://127.0.0.1:1234/v1',model:'fixture',timeoutSeconds:1}));
 await assert.rejects(handlers.get('engine:metadata-generate')(null,{shortId:'NEW',context:{song:'Test'}}),/LM_STUDIO_TIMEOUT_MUST_BE/);
});

test('native metadata generation disables reasoning and tools, and validates JSON before review',async()=>{
 const {generateMetadataSuggestions}=await import('./metadata-suggestions.mjs');let request;
 const result=await generateMetadataSuggestions({row:{short_id:'NEW',batch_id:'INTAKE-NEW',status:'AWAITING_METADATA'},context:{song:'Example'},baseUrl:'http://localhost:1234/v1',model:'qwen',apiMode:'native',fetchImpl:async(url,options)=>{request=JSON.parse(options.body);assert.equal(url,'http://localhost:1234/api/v1/chat');return {ok:true,json:async()=>({output:[{type:'message',content:JSON.stringify({suggestions:[{title:'Example cover',description:'My cover of Example.',tags:['cover']}]})}]})};}});
 assert.equal(request.reasoning,'off');assert.equal(request.store,false);assert.deepEqual(request.integrations,[]);assert.equal(result.state,'REVIEW_REQUIRED');
});
test('analytics transport requests only read-only reports with tracked video filters',async()=>{
 const {createYouTubeRealClient}=await import('./youtube-real-client.mjs');let seen;
 const client=createYouTubeRealClient({config:{},tokenProvider:async()=>'fixture',fetchImpl:async(url,options)=>{seen={url:new URL(url),options};return {ok:true,text:async()=>JSON.stringify({columnHeaders:[{name:'video'}],rows:[]})};}});
 await client.analytics.report({startDate:'2030-01-01',endDate:'2030-01-07',videoIds:['abcDEF_1234']});
 assert.equal(seen.url.hostname,'youtubeanalytics.googleapis.com');assert.equal(seen.url.searchParams.get('filters'),'video==abcDEF_1234');assert.equal(seen.options.method,undefined);
});

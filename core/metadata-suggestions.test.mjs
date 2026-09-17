import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {metadataTimeoutSeconds,localEndpoint,listLocalModels,generateMetadataSuggestions,saveSuggestion,approveMetadataSuggestion} from './metadata-suggestions.mjs';

const row=()=>({short_id:'RS-NEW',batch_id:'INTAKE-NEW',file_hash:'A'.repeat(64),status:'AWAITING_METADATA',source_song:'',artist_or_fandom:'',category:'',public_title:'',description:'',youtube_tags:'',related_video_id:'abcDEF_1234',file_path:'G:/PRIVATE/clip.mp4',scheduled_date:'2027-09-14',scheduled_time:'17:30',schedule_eligible:'YES'});
const candidate={title:'my cover of Example Song, softly',description:'My cover of Example Song. A softer final chorus.',tags:['cover','Example Song','music']};
function fakeResponse(value,status=200){return {ok:status===200,status,json:async()=>value};}
const completion=value=>fakeResponse({choices:[{message:{content:typeof value==='string'?value:JSON.stringify(value)}}]});
async function generate(target=row(),fetchImpl=async()=>completion({suggestions:[candidate]})){
  return generateMetadataSuggestions({row:target,context:{song:'Example Song',artist:'Original Artist',clipNotes:'Soft final chorus'},baseUrl:'http://127.0.0.1:4321/v1',model:'my-installed-qwen',fetchImpl});
}
test('uses the configured local port and JSON schema; prompt contains creative facts only',async()=>{
  let request,initialPayload;
  const original=row(),before=structuredClone(original);
  const suggestion=await generate(original,async(url,options)=>{request={url,options};if(!initialPayload)initialPayload=JSON.parse(options.body);return completion({suggestions:[candidate]});});
  assert.equal(request.url,'http://127.0.0.1:4321/v1/chat/completions');
  const payload=initialPayload;
  assert.equal(payload.model,'my-installed-qwen');assert.equal(payload.response_format.type,'json_schema');
  assert.equal(payload.response_format.json_schema.strict,true);
  assert.equal(request.options.redirect,'error');assert.ok(request.options.signal);
  const prompt=JSON.stringify(payload.messages);
  for(const value of [original.file_hash,original.file_path,original.short_id,original.scheduled_date,original.related_video_id])assert.equal(prompt.includes(value),false);
  assert.match(prompt,/Example Song/);assert.match(payload.messages[0].content,/PERFORMANCE CLIPS/);const input=JSON.parse(payload.messages[1].content);assert.equal(input.content.content_type,'singing cover snippet');assert.deepEqual(input.content.full_cover_available,false);assert.equal(suggestion.state,'GENERATION_REVIEW_REQUIRED');assert.deepEqual(suggestion.candidates[0].tags,['#singing','#fyp','#singer']);assert.deepEqual(original,before);
});
test('local address accepts custom ports and refuses remote destinations or embedded credentials',()=>{
  assert.equal(localEndpoint('http://localhost:4321'),'http://localhost:4321/v1');
  assert.equal(localEndpoint('http://[::1]:1234/v1/'),'http://[::1]:1234/v1');
  for(const url of ['https://example.com/v1','http://127.0.0.1.evil.test:1234/v1','http://user:secret@localhost:1234/v1','http://localhost:1234/proxy'])assert.throws(()=>localEndpoint(url),/LOCALHOST/);
});
test('listing models is read-only and does not load or download a model',async()=>{
  let calls=0;
  const models=await listLocalModels({baseUrl:'http://localhost:5555',fetchImpl:async(url,options)=>{calls++;assert.equal(url,'http://localhost:5555/v1/models');assert.equal(options.method,undefined);return fakeResponse({data:[{id:'existing-qwen'}]});}});
  assert.deepEqual(models,[{id:'existing-qwen'}]);assert.equal(calls,1);
});
test('legacy batches and complete metadata are rejected before calling the model',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw Error('should not run');};
  await assert.rejects(generate({...row(),batch_id:'BULK_03'},fetchImpl),/EDITABLE/);
  await assert.rejects(generate({...row(),public_title:'Approved',description:'Approved text',youtube_tags:'cover'},fetchImpl),/ALREADY_PRESENT/);
  assert.equal(calls,0);
});
test('invalid JSON, oversized content, unexpected fields and server failures cannot produce an approvable suggestion',async()=>{
  await assert.rejects(generate(row(),async()=>completion('not json')),/INVALID_JSON/);
  await assert.rejects(generate(row(),async()=>completion({suggestions:[{...candidate,title:'x'.repeat(101)}]})),/TITLE/);
  await assert.rejects(generate(row(),async()=>completion({suggestions:[{...candidate,publishAt:'tomorrow'}]})),/INVALID_METADATA/);
  await assert.rejects(generate(row(),async()=>fakeResponse({},500)),/HTTP_500/);
});
test('review approval fills only missing fields; existing metadata, identity and schedules stay untouched and replay is idempotent',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'metadata-review-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const draft={...row(),public_title:'Keep my approved title'},old={...row(),short_id:'OLD',batch_id:'BULK_03',status:'DUPLICATE'},rows=[draft,old],before=structuredClone(rows);
  let commits=0;const repository={read:async()=>structuredClone(rows),commit:async({updates=[]})=>{commits++;for(const update of updates)Object.assign(rows.find(item=>item.short_id===update.short_id),update);}};
  const suggestion=await generate(draft);await saveSuggestion(root,suggestion);
  assert.equal(commits,0);
  await assert.rejects(approveMetadataSuggestion({outputDir:root,repository,id:suggestion.id,candidateIndex:0}),/APPROVAL/);
  await approveMetadataSuggestion({outputDir:root,repository,id:suggestion.id,candidateIndex:0,category:'Music',edits:{public_title:'Do not overwrite',description:'My reviewed description'},approved:true});
  assert.equal(draft.public_title,'Keep my approved title');assert.equal(draft.description,'My reviewed description');assert.equal(draft.category,'Music');assert.equal(draft.status,'BATCH_READY');
  for(const key of ['short_id','file_hash','file_path','scheduled_date','scheduled_time','related_video_id'])assert.equal(draft[key],before[0][key]);
  assert.deepEqual(old,before[1]);assert.equal(commits,1);
  const replay=await approveMetadataSuggestion({outputDir:root,repository,id:suggestion.id,candidateIndex:0,approved:true});assert.equal(replay.alreadyApplied,true);assert.equal(commits,1);
});
test('a changed tracker invalidates a pending suggestion and never overwrites the newer metadata',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'metadata-stale-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const draft=row(),suggestion=await generate(draft);await saveSuggestion(root,suggestion);draft.description='Edited after generation';
  let writes=0;const repository={read:async()=>[draft],commit:async()=>{writes++;}};
  await assert.rejects(approveMetadataSuggestion({outputDir:root,repository,id:suggestion.id,candidateIndex:0,approved:true}),/STALE/);
  assert.equal(writes,0);assert.equal(draft.description,'Edited after generation');
});

test('generation timeout has a bounded configurable allowance for slower local models',async()=>{
  assert.equal(metadataTimeoutSeconds(),300);assert.equal(metadataTimeoutSeconds('600'),600);
  for(const value of [0,29,601,Infinity,'',1.5])assert.throws(()=>metadataTimeoutSeconds(value),/TIMEOUT/);
  let calls=0;
  await assert.rejects(generateMetadataSuggestions({row:row(),context:{song:'Example Song'},model:'qwen',timeoutSeconds:0,fetchImpl:async()=>{calls++;}}),/TIMEOUT/);
  assert.equal(calls,0);
});

test('generated metadata encourages punchy wording and caps hashtag output',async()=>{
  const longTitle=await generate(row(),async()=>completion({suggestions:[{title:'cover '+'x'.repeat(55),description:'Short',tags:['#ArabianNights']}]}));assert.equal(longTitle.candidates[0].title.length,61);
  const longerDescription=await generate(row(),async()=>completion({suggestions:[{title:'Arabian Nights cover please cast me',description:'x'.repeat(321),tags:['#ArabianNights']}]}));assert.equal(longerDescription.candidates[0].description.length,321);
  const suggestion=await generate(row(),async()=>completion({suggestions:[{title:'Arabian Nights cover please cast me',description:'Can I be the prince?',tags:['#ArabianNights','#Disney','#MusicalTheatre','#ExtraOne','#ExtraTwo']}]}));assert.ok(suggestion.candidates[0].tags.length<=5);assert.deepEqual(suggestion.candidates[0].tags,['#singing','#fyp','#singer']);
});

test('RAG recent titles are excluded and unsupported invented character references are filtered',async()=>{
  const result=await generateMetadataSuggestions({row:row(),context:{song:'Arabian Nights',source:'Aladdin',niche:'Musical Theatre'},ragContext:{recent_titles:['can i be the prince or what']},avoidTitles:['can i be the prince or what'],baseUrl:'http://127.0.0.1:4321/v1',model:'my-installed-qwen',fetchImpl:async()=>completion({suggestions:[
    {title:'can i be the prince or what',description:'channel my inner jafar for this one.',tags:['#Aladdin','#Cover']},
    {title:'singing Arabian Nights has no reason to be this fun',description:'A playful take on the song.',tags:['#ArabianNights','#Cover']}
  ]})});
  assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].title,'singing Arabian Nights has no reason to be this fun');
});

test('repairs only a missing angle family and marks exhausted batches for review',async()=>{
  const initial=[
    {angle_family:'PERSONALITY',title:'Arabian Nights cover got me dramatic',description:'This song is emotional damage.',tags:['#ArabianNights','#Disney']},
    {angle_family:'PERSONALITY',title:'my take on Arabian Nights got dramatic',description:'Musical theatre energy for the day.',tags:['#Aladdin','#Disney']},
    {angle_family:'CONTEXT_DISCOVERY',title:'from Aladdin, my Arabian Nights cover',description:'My cover of Arabian Nights.',tags:['#ArabianNights','#Aladdin']}
  ];
  let calls=0;const repaired={angle_family:'INTERACTION',title:'did i sing Arabian Nights justice?',description:'How was the voice on this one?',tags:['#ArabianNights','#Cover']};
  const result=await generateMetadataSuggestions({row:row(),context:{song:'Arabian Nights',source:'Aladdin',niche:'Disney'},baseUrl:'http://127.0.0.1:4321/v1',model:'bonsai',fetchImpl:async()=>{calls++;return completion({suggestions:calls===1?initial:[repaired]});}});
  assert.equal(result.validation.valid,true);assert.equal(result.candidates.length,3);assert.equal(result.candidates.find(item=>item.angle_family==='INTERACTION').title,repaired.title);assert.equal(result.validation.repairAttempts.length,1);
  let exhausted=0;const partial=await generateMetadataSuggestions({row:row(),context:{song:'Arabian Nights'},baseUrl:'http://127.0.0.1:4321/v1',model:'bonsai',fetchImpl:async()=>{exhausted++;return completion({suggestions:[initial[0]]});}});assert.equal(partial.state,'GENERATION_REVIEW_REQUIRED');assert.equal(partial.validation.valid,false);assert.ok(exhausted>=2);
});

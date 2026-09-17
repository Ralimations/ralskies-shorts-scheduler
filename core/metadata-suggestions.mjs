import crypto from 'node:crypto';
import {titleKey,assertUniqueTitle} from './title-identity.mjs';
import {titleIssue} from './youtube-title-validation.mjs';
import path from 'node:path';
import { readJson, writeJson, withPipelineLock, recordException } from './pipeline-store.mjs';
import { editableDraft, saveDraftMetadata, exportRelatedVideoActions } from './draft-intake.mjs';
import {recordGeneration,recordApproval,recordRejection,retrieveCreativeMemory,memoryStats,listMemory,setMemoryActive} from './creative-memory.mjs';

const CREATIVE_FIELDS=['public_title','description','youtube_tags'];
export const BLOCKED_GENERIC_HASHTAGS=new Set(['#fyp','#viral','#trending','#ralskies','#indie','#music','#vocal','#singing']);
export const ANGLE_FAMILIES=['PERSONALITY','INTERACTION','CONTEXT_DISCOVERY'];
const clean=value=>String(value??'').trim();
export function localEndpoint(value='http://127.0.0.1:1234/v1') {
  let url;try{url=new URL(value);}catch{throw Error('INVALID_LM_STUDIO_URL');}
  if(!['http:','https:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||!['','/','/v1','/v1/'].includes(url.pathname))throw Error('LM_STUDIO_MUST_USE_LOCALHOST');
  return url.origin+'/v1';
}
export function metadataRevision(row) {
  return crypto.createHash('sha256').update(JSON.stringify([row.short_id,row.file_hash,row.batch_id,...CREATIVE_FIELDS.map(key=>row[key]??''),row.source_song??'',row.artist_or_fandom??'',row.category??'',row.source_show??'',row.source??'',row.niche??'',row.character??'',row.full_cover_available??'',row.original_filename??'',row.file_name??''])).digest('hex');
}
export function originalFilenameLabel(row={}) {
  const name=clean(row.original_filename)||clean(row.file_name)||clean(row.original_path).split(/[\\/]/).pop()||'';
  const label=name.split(/[\\/]/).pop().replace(/\.mp4$/i,'').replace(/(?:\s*\(\d+\)|-\d+)+$/g,'').replace(/\s+/g,' ').trim();
  return /^[a-f0-9]{64}$/i.test(label)?'':label;
}
export function validateContext(input={}) {
  const context={song:clean(input.song),artist:clean(input.artist),source:clean(input.source),niche:clean(input.niche),character:clean(input.character),clipNotes:clean(input.clipNotes),style:clean(input.style),fullCoverAvailable:input.fullCoverAvailable===true||String(input.fullCoverAvailable||'').toLowerCase()==='true'||String(input.fullCoverAvailable||'').toUpperCase()==='YES'};
  if(!context.song)throw Error('SONG_NAME_REQUIRED');
  if(context.song.length>300||context.artist.length>200||context.source.length>200||context.niche.length>200||context.character.length>120||context.clipNotes.length>2000||context.style.length>500)throw Error('METADATA_CONTEXT_TOO_LONG');
  return context;
}
export function validateCandidate(value) {
  const keys=Object.keys(value||{});if(!value||!['description','tags','title'].every(key=>keys.includes(key))||keys.some(key=>!['description','tags','title','angle_family'].includes(key))||value.angle_family&&!ANGLE_FAMILIES.includes(value.angle_family))throw Error('INVALID_METADATA_SUGGESTION');
  if(titleIssue(value.title))throw Error('INVALID_SUGGESTED_TITLE');
  if(typeof value.description!=='string'||!clean(value.description)||Buffer.byteLength(value.description,'utf8')>5000||/[<>]/.test(value.description))throw Error('INVALID_SUGGESTED_DESCRIPTION');
  if(!Array.isArray(value.tags)||!value.tags.length||value.tags.length>15||value.tags.some(tag=>typeof tag!=='string'||!clean(tag)||tag.length>80||tag.includes(',')))throw Error('INVALID_SUGGESTED_TAGS');
  const tags=[...new Set(value.tags.map(clean))].filter(tag=>!BLOCKED_GENERIC_HASHTAGS.has(tag.toLowerCase())).slice(0,5);
  if(!tags.length)throw Error('INVALID_SUGGESTED_TAGS');
  if(tags.join(',').length+tags.filter(tag=>tag.includes(' ')).length*2>450)throw Error('SUGGESTED_TAGS_TOO_LONG');
  return {title:clean(value.title),description:clean(value.description),tags, ...(value.angle_family?{angle_family:value.angle_family}: {})};
}
const schema={type:'object',additionalProperties:false,required:['suggestions'],properties:{suggestions:{type:'array',minItems:1,maxItems:3,items:{type:'object',additionalProperties:false,required:['title','description','tags'],properties:{title:{type:'string',maxLength:100},description:{type:'string',maxLength:5000},tags:{type:'array',minItems:1,maxItems:15,items:{type:'string',maxLength:80}},angle_family:{type:'string',enum:['PERSONALITY','INTERACTION','CONTEXT_DISCOVERY']}}}}}};
export function metadataTimeoutSeconds(value=300) {
  const seconds=Number(value);
  if(!Number.isInteger(seconds)||seconds<30||seconds>600)throw Error('LM_STUDIO_TIMEOUT_MUST_BE_30_TO_600_SECONDS');
  return seconds;
}
async function requestJson(url,options,fetchImpl=fetch,timeoutMs=300000) {
  let response;
  try { response=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(timeoutMs)}); }
  catch(error){if(error.name==='TimeoutError'||error.name==='AbortError')throw Error('LM_STUDIO_TIMEOUT');throw Error('LM_STUDIO_UNREACHABLE: Start the server in LM Studio, then try again.');}
  if(!response.ok)throw Error('LM_STUDIO_HTTP_'+response.status);
  return response.json();
}
export async function listLocalModels({baseUrl,fetchImpl=fetch,apiKey=process.env.RALSKIES_LM_API_KEY}={}) {
  const body=await requestJson(localEndpoint(baseUrl)+'/models',{headers:apiKey?{Authorization:'Bearer '+apiKey}:{}},fetchImpl,5000);
  if(!Array.isArray(body.data))throw Error('INVALID_LM_STUDIO_MODEL_LIST');
  return body.data.filter(model=>typeof model.id==='string').map(model=>({id:model.id}));
}
function unsupportedCreativeClaim(candidate,facts){const text=(candidate.title+' '+candidate.description).toLowerCase(),supplied=JSON.stringify(facts).toLowerCase();const claims=[/\b(?:i|my|the)\s+(?:cried|almost cried|screamed|bel[t]?ed|hit (?:the )?high note|struggled with (?:the )?note)\b/i,/\b(?:the )?microphone (?:survived|struggled)\b/i,/\b(?:the )?audience (?:reacted|applauded|clapped)\b/i,/\bone[- ]take\b/i];if(!facts.character&&/\b(?:channel my )?inner\s+(?!voice\b|child\b|artist\b|singer\b|performer\b|drama\b|chaos\b)[a-z][a-z'-]*/i.test(text))return true;return claims.some(pattern=>{const match=text.match(pattern);return match&&!supplied.includes(match[0].toLowerCase());});}
function chooseDefaultCandidate(candidates,recentTitles=[]){
  const recent=recentTitles.map(titleKey),rawRecent=recentTitles.map(clean),questions=rawRecent.filter(title=>title.endsWith('?')).length,cast=recent.filter(title=>title.includes('please cast me')).length;
  return candidates.map((candidate,index)=>{const key=titleKey(candidate.title),opening=key.split(' ').slice(0,3).join(' ');let score=(index===0?4:index===1?2:1);if(recent.some(title=>title.split(' ').slice(0,3).join(' ')===opening))score-=3;if(candidate.title.includes('?')&&questions>=2)score-=2;if(key.includes('please cast me')&&cast>=2)score-=3;return {index,score};}).sort((a,b)=>b.score-a.score||a.index-b.index)[0]?.index??0;}
export async function generateMetadataSuggestions({row,context,ragContext={},baseUrl,model,timeoutSeconds=300,apiMode='openai',avoidTitles=[],fetchImpl=fetch,apiKey=process.env.RALSKIES_LM_API_KEY}) {
  if(!editableDraft(row))throw Error('NEW_EDITABLE_DRAFT_REQUIRED');
  const missing=CREATIVE_FIELDS.filter(key=>!clean(row[key]));
  if(!missing.length)throw Error('METADATA_ALREADY_PRESENT');
  if(!clean(model)||model.length>200)throw Error('SELECT_LM_STUDIO_MODEL');
  const timeoutMs=metadataTimeoutSeconds(timeoutSeconds)*1000;
  const filenameLabel=originalFilenameLabel(row);
  const facts={...validateContext({...context,song:clean(context?.song)||clean(row.source_song)||filenameLabel,artist:clean(context?.artist)||clean(row.artist_or_fandom),source:clean(context?.source)||clean(row.source_show)||clean(row.source),niche:clean(context?.niche)||clean(row.niche),character:clean(context?.character)||clean(row.character),fullCoverAvailable:context?.fullCoverAvailable??row.full_cover_available}),filenameLabel};
  // Only creative content reaches the LLM. File identities, paths, schedules,
  // OAuth credentials and tracker bookkeeping are never included in the prompt.
  const payload={model,temperature:0.6,max_tokens:4096,stream:false,response_format:{type:'json_schema',json_schema:{name:'short_metadata',strict:true,schema}},messages:[
    {role:'system',content:'Write exactly three distinct title, description, and hashtag suggestions for a music Short in the RALSKIES VOICE. Sound like a young singer posting his own performance: casual, playful, theatrical, slightly self-aware, sometimes earnest, fandom-aware, and confident enough to joke about casting or auditions. Occasional lowercase internet tone, questions, and mild exaggeration are welcome. Never sound like a record label, SEO writer, journalist, corporate account, or AI assistant. Do not explain what viewers can obviously see. Avoid generic praise and avoid repeatedly using cover, singing, or performance.\n\nGive the three candidates different creative jobs without rigid templates. Candidate 1 is PERSONALITY with the most freedom for spontaneous humor, drama, weirdness, lowercase phrasing, or emotional reaction. Candidate 2 is INTERACTION with a question, fandom recognition, casting energy, or invitation to respond. Candidate 3 is CONTEXT_DISCOVERY and may be the most searchable by naming the song, show, fandom, or artist while still sounding human. Only one candidate should usually be context-forward. Do not make every candidate begin with the song or show.\n\nPrefer titles under approximately 60 characters, but natural human wording matters more than the target. This is a preference, not a required format: do not stretch, truncate, or restructure a good title to hit a range, and very short titles are allowed. Do not force keyword front-loading. Put context later in a title, in the description, or in hashtags when that reads better. Never use angle brackets. Keep descriptions to one or two short natural sentences, not a review.\n\nThe user payload contains separate RAG sections: positive_examples are approved or manually edited style references, recent_titles are anti-repetition exclusions, and negative_examples are rejected patterns to avoid. Learn tone and compactness without copying exact wording or structures. Use only supplied structured facts, filename context, approved context, and recent-title memory. Do not invent visual or vocal events, high notes, belting, crying, screaming, microphone problems, audience reactions, one-take claims, auditions, character names, roles, relationships, lore, plot events, or quotes. A character or casting reference is allowed only when that character is explicitly supplied. Personality must come from writing style, not fabricated events. Do not claim a full cover is available unless fullCoverAvailable is explicitly true.\n\nUse recent titles to avoid repeating openings, questions, jokes, calls to action, punctuation patterns, or angle structures. If recent titles overuse a question or please-cast-me joke, choose another shape. Examples are style references only; never reuse their exact wording or turn them into templates.\n\nReturn exactly three candidates when possible, each with a distinct angle_family of PERSONALITY, INTERACTION, or CONTEXT_DISCOVERY. Titles must be unique versus avoidTitles and each other after case, punctuation, and hashtag differences are ignored. Hashtags should be restrained: use 3 to 5 meaningful song, show, fandom, or performance-niche hashtags, with no hashtag pile. Do not add generic #fyp, #viral, #trending, or #Ralskies unless explicitly supplied. Do not invent credits or keyword stuffing. Existing metadata is approved and must not be changed. Do not schedule, upload, call tools, or provide workflow instructions.'},
    {role:'user',content:JSON.stringify({facts,ragContext:{positive_examples:ragContext.positive_examples||[],recent_titles:ragContext.recent_titles||[],negative_examples:ragContext.negative_examples||[],retrieval_summary:ragContext.retrieval_summary||{}},avoidTitles:avoidTitles.slice(-120),missingFields:missing,existing:{title:clean(row.public_title),description:clean(row.description),tags:clean(row.youtube_tags)}})}
  ]};
  if(!['openai','native'].includes(apiMode))throw Error('INVALID_LM_API_MODE');
  const native=apiMode==='native',url=native?new URL(localEndpoint(baseUrl)).origin+'/api/v1/chat':localEndpoint(baseUrl)+'/chat/completions';
  const request=native?{model,system_prompt:payload.messages[0].content+' Return JSON only, no markdown. Schema: '+JSON.stringify(schema),input:payload.messages[1].content,reasoning:'off',store:false,integrations:[],temperature:0.6,max_output_tokens:1536,stream:false}:payload;
  const body=await requestJson(url,{method:'POST',headers:{'Content-Type':'application/json',...(apiKey?{Authorization:'Bearer '+apiKey}:{})},body:JSON.stringify(request)},fetchImpl,timeoutMs);
  let parsed;try{const raw=native?(body.output||[]).filter(item=>item.type==='message').map(item=>item.content).join(''):body.choices?.[0]?.message?.content;const cleaned=String(raw||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();const objectText=cleaned.match(/\{[\s\S]*\}/)?.[0]||cleaned;parsed=JSON.parse(objectText);}catch{throw Error('LM_STUDIO_INVALID_JSON');}
  if(!parsed||Object.keys(parsed).join(',')!=='suggestions'||!Array.isArray(parsed.suggestions)||parsed.suggestions.length<1||parsed.suggestions.length>3)throw Error('LM_STUDIO_INVALID_SUGGESTIONS');
  const memoryTitles=[...(ragContext.recent_titles||[]),...(ragContext.positive_examples||[])].map(item=>typeof item==='string'?item:item?.title).filter(Boolean);
  const seen=new Set([...avoidTitles,...memoryTitles].map(titleKey)),candidates=parsed.suggestions.map((candidate,index)=>{const rawTags=candidate.tags??candidate.hashtags;const normalized={...candidate,tags:Array.isArray(rawTags)?rawTags.flatMap(tag=>String(tag).trim().split(/\s+(?=#)/).filter(Boolean)):rawTags};delete normalized.hashtags;return {...validateCandidate(normalized),angle_family:ANGLE_FAMILIES[index]||'PERSONALITY'};}).filter(candidate=>!unsupportedCreativeClaim(candidate,facts)).filter(candidate=>{const key=titleKey(candidate.title);if(missing.includes('public_title')&&seen.has(key))return false;seen.add(key);return true;});
  if(!candidates.length)throw Error('NO_UNIQUE_TITLE_GENERATED');
  const defaultCandidateIndex=chooseDefaultCandidate(candidates,avoidTitles);
  return {schemaVersion:1,id:crypto.randomUUID(),shortId:row.short_id,hash:row.file_hash,batchId:row.batch_id,revision:metadataRevision(row),model,context:facts,missingFields:missing,candidates,state:'REVIEW_REQUIRED',defaultCandidateIndex,createdAt:new Date().toISOString()};
}
function suggestionPath(outputDir,id) {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('INVALID_SUGGESTION_ID');
  return path.join(outputDir,'metadata-suggestions',id+'.json');
}
export async function saveSuggestion(outputDir,suggestion) {
  await writeJson(suggestionPath(outputDir,suggestion.id),suggestion);
}
export async function approveMetadataSuggestion({outputDir,repository,id,candidateIndex,edits={},category='',approved=false}) {
  if(approved!==true)throw Error('METADATA_APPROVAL_REQUIRED');
  return withPipelineLock(outputDir,async()=>{
    const file=suggestionPath(outputDir,id),suggestion=await readJson(file);
    const rows=await repository.read(),matches=rows.filter(row=>row.short_id===suggestion.shortId);
    if(matches.length!==1||!editableDraft(matches[0])||matches[0].file_hash!==suggestion.hash||matches[0].batch_id!==suggestion.batchId)throw Error('DRAFT_NOT_EDITABLE');
    const row=matches[0];
    if(suggestion.state==='APPROVED')return {shortId:row.short_id,state:'APPROVED',alreadyApplied:true};
    if(suggestion.state==='APPROVING'&&Object.entries(suggestion.approvedValues||{}).every(([key,value])=>clean(row[key])===clean(value))) {
      await recordGeneration(outputDir,suggestion);
      const candidate=suggestion.candidates[Number.isInteger(candidateIndex)?candidateIndex:0];
      await recordApproval(outputDir,{suggestion,candidateIndex:Number.isInteger(candidateIndex)?candidateIndex:0,approvedTitle:row.public_title||suggestion.approvedValues?.public_title||candidate?.title,approvedDescription:row.description||suggestion.approvedValues?.description||candidate?.description,approvedHashtags:(row.youtube_tags||suggestion.approvedValues?.youtube_tags||candidate?.tags||[]).toString().split(',').map(clean).filter(Boolean),reason:'RECOVERED_APPROVAL'});
      suggestion.state='APPROVED';await writeJson(file,suggestion);
      return {shortId:row.short_id,state:'APPROVED',alreadyApplied:true};
    }
    if(metadataRevision(row)!==suggestion.revision)throw Error('METADATA_SUGGESTION_STALE');
    if(!Number.isInteger(candidateIndex)||!suggestion.candidates[candidateIndex])throw Error('SELECT_METADATA_SUGGESTION');
    const candidate=suggestion.candidates[candidateIndex],proposed={public_title:candidate.title,description:candidate.description,youtube_tags:candidate.tags.join(', ')};
    for(const key of Object.keys(edits))if(!CREATIVE_FIELDS.includes(key))throw Error('UNSUPPORTED_METADATA_EDIT');
    for(const [key,value] of Object.entries(edits))if(suggestion.missingFields.includes(key))proposed[key]=String(value??'');
    // Validate the reviewed values, but never overwrite any existing creative field.
    validateCandidate({title:row.public_title||proposed.public_title,description:row.description||proposed.description,tags:(row.youtube_tags||proposed.youtube_tags).split(',').map(clean).filter(Boolean)});
    assertUniqueTitle(rows,row.short_id,row.public_title||proposed.public_title);
    const metadata=Object.fromEntries(suggestion.missingFields.filter(key=>!clean(row[key])).map(key=>[key,proposed[key]]));
    if(!clean(row.category)&&category){if(category!=='Music')throw Error('UNSUPPORTED_CATEGORY');metadata.category=category;}
    if(!clean(row.source_song))metadata.source_song=suggestion.context.song;
    if(!clean(row.artist_or_fandom)&&suggestion.context.artist)metadata.artist_or_fandom=suggestion.context.artist;
    suggestion.state='APPROVING';suggestion.approvedValues=metadata;suggestion.approvedAt=new Date().toISOString();
    await writeJson(file,suggestion);
    await recordGeneration(outputDir,suggestion);
    await saveDraftMetadata({repository,shortId:row.short_id,metadata});
    await recordApproval(outputDir,{suggestion,candidateIndex,approvedTitle:row.public_title||metadata.public_title||proposed.public_title,approvedDescription:row.description||metadata.description||proposed.description,approvedHashtags:(row.youtube_tags||metadata.youtube_tags||proposed.youtube_tags).split(',').map(clean).filter(Boolean)});
    await exportRelatedVideoActions({rows:await repository.read(),outputDir});
    suggestion.state='APPROVED';await writeJson(file,suggestion);
    return {shortId:row.short_id,state:'APPROVED',fields:Object.keys(metadata)};
  });
}
export function registerMetadataDesktop({ipcMain,outputDir,repository,isProductionBusy=()=>false}) {
  const settingsPath=path.join(outputDir,'lm-studio-settings.json'),active=new Set();
  let queueJob=null;
  const settings=()=>readJson(settingsPath,{baseUrl:'http://127.0.0.1:1234/v1',model:'',timeoutSeconds:300});
  ipcMain.handle('engine:metadata-settings',settings);
  ipcMain.handle('engine:creative-memory-status',async()=>({stats:await memoryStats(outputDir),rows:await listMemory(outputDir)}));
  ipcMain.handle('engine:creative-memory-disable',async(_event,p)=>setMemoryActive(outputDir,p?.memoryId,false));
  ipcMain.handle('engine:creative-memory-enable',async(_event,p)=>setMemoryActive(outputDir,p?.memoryId,true));
  ipcMain.handle('engine:metadata-reject',async(_event,p)=>recordRejection(outputDir,{generationId:p?.id,candidateIndex:p?.candidateIndex||0,reason:p?.reason||''}));
  ipcMain.handle('engine:metadata-models',(_event,p={})=>listLocalModels({baseUrl:p.baseUrl}));
  ipcMain.handle('engine:metadata-settings-save',async(_event,p)=>{
    const config={baseUrl:localEndpoint(p.baseUrl),model:clean(p.model),timeoutSeconds:metadataTimeoutSeconds(p.timeoutSeconds),apiMode:p.apiMode||'openai'};
    if(!['native','openai'].includes(config.apiMode))throw Error('INVALID_LM_API_MODE');
    if(config.model.length>200)throw Error('INVALID_LM_STUDIO_MODEL_ID');
    await writeJson(settingsPath,config);return config;
  });
  ipcMain.handle('engine:metadata-queue-status',async()=> {
    const {latestMetadataQueue}=await import('./metadata-queue.mjs');
    const report=await latestMetadataQueue(outputDir);
    if(report?.state==='GENERATING'&&!queueJob){report.state='STOPPED';report.pending=report.total-report.entries.length-report.errors.length;await writeJson(path.join(outputDir,'metadata-queues',report.id+'.json'),report);}
    return report;
  });
  ipcMain.handle('engine:metadata-queue-stop',()=>{if(queueJob)queueJob.stop=true;return {stopping:Boolean(queueJob)};});
  ipcMain.handle('engine:metadata-queue-generate',async(event)=>{
    if(queueJob||active.size||isProductionBusy())throw Error('METADATA_GENERATION_IN_PROGRESS');
    queueJob={stop:false};
    try{
      const config=await settings();
      if(!config.model){const models=await listLocalModels({baseUrl:config.baseUrl});if(models.length!==1)throw Error('SET_MODEL_ID');config.model=models[0].id;}
      const {generateQueueMetadata}=await import('./metadata-queue.mjs');
      return await generateQueueMetadata({outputDir,repository,config,shouldStop:()=>queueJob.stop,onProgress:p=>{if(event?.sender&&!event.sender.isDestroyed())event.sender.send('engine:metadata-queue-progress',p);}});
    }finally{queueJob=null;}
  });
  ipcMain.handle('engine:metadata-queue-approve',async(_event,p)=>{
    if(queueJob||active.size||isProductionBusy())throw Error('PIPELINE_BUSY');
    const {approveQueueMetadata}=await import('./metadata-queue.mjs');
    try{return await approveQueueMetadata({...p,outputDir,repository});}
    catch(error){await recordException(outputDir,{code:'DRAFT_METADATA_QUEUE_APPROVAL_FAILED',message:error.message});throw error;}
  });
  ipcMain.handle('engine:metadata-generate',async(_event,p)=>{
    if(queueJob||active.has(p.shortId))throw Error('METADATA_GENERATION_IN_PROGRESS');
    active.add(p.shortId);
    try {
      const rows=await repository.read(),matches=rows.filter(row=>row.short_id===p.shortId);
      if(matches.length!==1)throw Error('DRAFT_NOT_FOUND');
      if(!editableDraft(matches[0]))throw Error('NEW_EDITABLE_DRAFT_REQUIRED');
      const config=await settings();
      if(!config.model){const models=await listLocalModels({baseUrl:config.baseUrl});if(models.length!==1)throw Error('SET_MODEL_ID: Enter the model ID from LM Studio when multiple models are available.');config.model=models[0].id;}
      const context=p.context||{},rag=await retrieveCreativeMemory(outputDir,{song:context.song||matches[0].source_song,source:context.source||matches[0].source_show||matches[0].source,artist:context.artist||matches[0].artist_or_fandom,niche:context.niche||matches[0].niche,contentType:matches[0].content_type});
      const avoidTitles=[...rows.filter(r=>r.short_id!==p.shortId).map(r=>r.public_title).filter(Boolean),...(rag.recent_titles||[]).map(item=>item.title).filter(Boolean)];
      const suggestion=await generateMetadataSuggestions({...config,row:matches[0],context,ragContext:rag,avoidTitles});
      await saveSuggestion(outputDir,suggestion);await recordGeneration(outputDir,suggestion);return suggestion;
    } catch(error) {await recordException(outputDir,{code:'DRAFT_METADATA_GENERATION_FAILED',shortId:p.shortId,message:error.message});throw error;}
    finally {active.delete(p.shortId);}
  });
  ipcMain.handle('engine:metadata-approve',async(_event,p)=>{
    if(isProductionBusy())throw Error('PIPELINE_BUSY');
    try{return await approveMetadataSuggestion({...p,outputDir,repository});}
    catch(error){await recordException(outputDir,{code:'DRAFT_METADATA_APPROVAL_FAILED',message:error.message});throw error;}
  });
}

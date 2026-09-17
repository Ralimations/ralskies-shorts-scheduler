import crypto from 'node:crypto';
import {titleKey,assertUniqueTitle} from './title-identity.mjs';
import {titleIssue} from './youtube-title-validation.mjs';
import path from 'node:path';
import { readJson, writeJson, withPipelineLock, recordException } from './pipeline-store.mjs';
import { editableDraft, saveDraftMetadata, exportRelatedVideoActions } from './draft-intake.mjs';
import {recordGeneration,recordApproval,recordRejection,retrieveCreativeMemory,memoryStats,listMemory,setMemoryActive} from './creative-memory.mjs';
import {normalizeModelOutput,validateGuardrailBatch,validateGroundedCandidate,buildRepairInstruction,normalizeCandidate} from './metadata-guardrails.mjs';

const CREATIVE_FIELDS=['public_title','description','youtube_tags'];
export const UNIVERSAL_HASHTAGS=Object.freeze(['#singing','#fyp','#singer']);
export const BLOCKED_GENERIC_HASHTAGS=new Set(['#viral','#trending','#ralskies','#indie','#music','#vocal']);
export const ANGLE_FAMILIES=['PERSONALITY','INTERACTION','CONTEXT_DISCOVERY'];
export const CORE_BONSAI_PROMPT="You write YouTube Shorts titles for Ralskies.\n\nRalskies is a male singer posting short singing snippets taken from his full-song covers. These are PERFORMANCE CLIPS. He is singing the song himself. The Short is a snippet, not the full cover. A full cover exists and may be mentioned naturally when useful.\n\nWrite like Ralskies actually typed it: casual, human, playful, theatrical, fandom-aware, slightly self-aware, sometimes sincere or dramatic, short and punchy. Lowercase is fine. Questions are fine. Occasional emojis are fine.\n\nDo NOT sound like SEO copy, a record label, a journalist, a music critic, a marketing agency, or an AI assistant.\n\nDo NOT invent facts about how he sang, notes he hit or missed, crying or screaming, recording attempts, microphones, audience reactions, costumes or filming, auditions, personal history, or character/lore details not provided. If a fact is not supplied, treat it as unknown.\n\nIMPORTANT TITLE RULE: Every title must make it immediately clear that Ralskies is singing a song or posting a cover. Every title must contain a clear singing/performance signal such as cover, singing, I sang, full cover, vocal cover, or my take on. Personality comes second. Do not make titles abstract merely for creativity.\n\nGenerate exactly 3 substantially different title ideas using loose directions: DIRECT clearly advertises the cover; CASUAL / PERSONAL still explicitly says cover or singing; CTA / DISCOVERY invites the viewer toward the performance or full cover. Vary wording naturally. Do not put internal labels such as Context Discovery, Personality, or Interaction in the public title.\n\nPrefer natural titles under roughly 60 characters. Very short titles are welcome. Do not repeat recent title structures. Use approved examples only as style inspiration. Never copy their wording or format mechanically. Before returning each title, ask: If I saw only this title, would I understand that Ralskies is singing a cover? If no, regenerate it.\n\nReturn JSON only.";

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
  const list=value=>Array.isArray(value)?value.map(clean).filter(Boolean):[];const fullCover=input.fullCoverAvailable??input.full_cover_available;const context={song:clean(input.song),artist:clean(input.artist||input.original_artist),source:clean(input.source),niche:clean(input.niche),content_type:clean(input.content_type||input.contentType),character:clean(input.character),clipNotes:clean(input.clipNotes),style:clean(input.style),allowed_characters:list(input.allowed_characters||input.allowedCharacters),allowed_roles:list(input.allowed_roles||input.allowedRoles),performance_facts:list(input.performance_facts||input.performanceFacts),recording_facts:list(input.recording_facts||input.recordingFacts),available_ctas:list(input.available_ctas||input.availableCtas),fullCoverAvailable:input.fullCoverAvailable===true||input.full_cover_available===true||String(fullCover||'').toLowerCase()==='true'||String(fullCover||'').toUpperCase()==='YES'};
  if(!context.song)throw Error('SONG_NAME_REQUIRED');
  if(context.song.length>300||context.artist.length>200||context.source.length>200||context.niche.length>200||context.content_type.length>80||context.character.length>120||context.clipNotes.length>2000||context.style.length>500||context.allowed_characters.join(',').length>1000||context.allowed_roles.join(',').length>1000||context.performance_facts.join(',').length>2000||context.recording_facts.join(',').length>2000||context.available_ctas.join(',').length>1000)throw Error('METADATA_CONTEXT_TOO_LONG');
  return context;
}
export function validateCandidate(value) {
  const keys=Object.keys(value||{});if(!value||!['description','tags','title'].every(key=>keys.includes(key))||keys.some(key=>!['description','tags','title','angle_family'].includes(key))||value.angle_family&&!ANGLE_FAMILIES.includes(value.angle_family))throw Error('INVALID_METADATA_SUGGESTION');
  if(titleIssue(value.title))throw Error('INVALID_SUGGESTED_TITLE');
  if(typeof value.description!=='string'||!clean(value.description)||Buffer.byteLength(value.description,'utf8')>5000||/[<>]/.test(value.description))throw Error('INVALID_SUGGESTED_DESCRIPTION');
  if(!Array.isArray(value.tags)||!value.tags.length||value.tags.length>15||value.tags.some(tag=>typeof tag!=='string'||!clean(tag)||tag.length>80||tag.includes(',')))throw Error('INVALID_SUGGESTED_TAGS');
  const tags=[...UNIVERSAL_HASHTAGS];
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
  const facts={...validateContext({...context,song:clean(context?.song)||clean(row.source_song)||filenameLabel,artist:clean(context?.artist)||clean(row.artist_or_fandom),source:clean(context?.source)||clean(row.source_show)||clean(row.source),niche:clean(context?.niche)||clean(row.niche),content_type:clean(context?.content_type||context?.contentType)||((String(row.content_type||'').toUpperCase()==='ORIGINAL')?'original song promotion':'singing cover snippet'),character:clean(context?.character)||clean(row.character),fullCoverAvailable:context?.fullCoverAvailable??context?.full_cover_available??row.full_cover_available,allowed_characters:context?.allowed_characters||context?.allowedCharacters||[],allowed_roles:context?.allowed_roles||context?.allowedRoles||[],performance_facts:context?.performance_facts||context?.performanceFacts||[],recording_facts:context?.recording_facts||context?.recordingFacts||[],available_ctas:context?.available_ctas||context?.availableCtas||[]}),filenameLabel};
  // Only creative content reaches the LLM. File identities, paths, schedules,
  // OAuth credentials and tracker bookkeeping are never included in the prompt.
  const payload={model,temperature:0.6,max_tokens:4096,stream:false,response_format:{type:'json_schema',json_schema:{name:'short_metadata',strict:true,schema}},messages:[
    {role:'system',content:CORE_BONSAI_PROMPT+'\n\nFor this engine, return exactly three suggestions in this JSON shape: {\"suggestions\":[{\"angle_family\":\"PERSONALITY|INTERACTION|CONTEXT_DISCOVERY\",\"title\":\"...\",\"description\":\"...\",\"tags\":[\"#Example\"]}]}. Map the three loose directions to PERSONALITY (CASUAL / PERSONAL), INTERACTION (CTA / DISCOVERY), and CONTEXT_DISCOVERY (DIRECT). Every title must include a clear singing or cover signal; angle_family is internal metadata and must never appear as a public-title label. Descriptions should be one or two natural sentences. Tags should be 3 to 5 meaningful song, source, fandom, or niche hashtags. Do not include markdown or commentary.'},
    {role:'user',content:JSON.stringify({content:{song:facts.song,source:facts.source,niche:facts.niche,content_type:facts.content_type,full_cover_available:facts.fullCoverAvailable,allowed_characters:facts.allowed_characters,allowed_roles:facts.allowed_roles,performance_facts:facts.performance_facts,recording_facts:facts.recording_facts,available_ctas:facts.available_ctas},approved_ralskies_style_examples:ragContext.positive_examples||[],recent_titles_to_avoid:[...(ragContext.recent_titles||[]).map(item=>typeof item==='string'?item:item?.title),...avoidTitles.slice(-120)],rejected_patterns:ragContext.negative_examples||[],existing_metadata:{title:clean(row.public_title),description:clean(row.description),tags:clean(row.youtube_tags)}})}
  ]};
  if(!['openai','native'].includes(apiMode))throw Error('INVALID_LM_API_MODE');
  const native=apiMode==='native',url=native?new URL(localEndpoint(baseUrl)).origin+'/api/v1/chat':localEndpoint(baseUrl)+'/chat/completions';
  const request=native?{model,system_prompt:payload.messages[0].content+' Return JSON only, no markdown. Schema: '+JSON.stringify(schema),input:payload.messages[1].content,reasoning:'off',store:false,integrations:[],temperature:0.6,max_output_tokens:1536,stream:false}:payload;
  const requestModel=async(systemPrompt,inputText)=>{const req= native?{model,system_prompt:systemPrompt+' Return JSON only, no markdown. Schema: '+JSON.stringify(schema),input:inputText,reasoning:'off',store:false,integrations:[],temperature:0.6,max_output_tokens:1536,stream:false}:{...payload,messages:[{role:'system',content:systemPrompt},{role:'user',content:inputText}]};return requestJson(url,{method:'POST',headers:{'Content-Type':'application/json',...(apiKey?{Authorization:'Bearer '+apiKey}:{})},body:JSON.stringify(req)},fetchImpl,timeoutMs);};
  const body=await requestModel(payload.messages[0].content,payload.messages[1].content);
  const modelCandidates=body=>{const raw=native?(body.output||[]).filter(item=>item.type==='message').map(item=>item.content).join(''):body.choices?.[0]?.message?.content;return normalizeModelOutput(raw).suggestions;};
  let parsed;try{parsed={suggestions:modelCandidates(body)};}catch(error){throw Error(error.code==='MALFORMED_JSON'?'LM_STUDIO_INVALID_JSON':'LM_STUDIO_INVALID_SUGGESTIONS');}
  const memoryTitles=[...(ragContext.recent_titles||[]),...(ragContext.positive_examples||[])].map(item=>typeof item==='string'?item:item?.title).filter(Boolean);
  const seen=new Set([...avoidTitles,...memoryTitles].map(titleKey));const parsedCandidates=[];const candidateErrors=[];
  for(let index=0;index<parsed.suggestions.length;index++){const candidate=parsed.suggestions[index];try{const normalized=normalizeCandidate(candidate);const checked={...validateCandidate(normalized),angle_family:candidate.angle_family||(parsed.suggestions.length===1?ANGLE_FAMILIES[index]:'')};const key=titleKey(checked.title);if(missing.includes('public_title')&&seen.has(key)){candidateErrors.push({candidate_index:index,errors:[{code:'RECENT_TITLE_REUSE',detail:'title is already used by tracker or creative memory'}]});continue;}seen.add(key);parsedCandidates.push(checked);}catch(error){candidateErrors.push({candidate_index:index,errors:[{code:error.code||error.message||'INVALID_SCHEMA',detail:error.message}]});}}
  const initialGuard=validateGuardrailBatch(parsedCandidates,{context:facts,recentTitles:memoryTitles,avoidTitles:[...avoidTitles,...memoryTitles]});
  const familyCandidates=new Map();for(const item of initialGuard.byIndex){if(item?.valid&&!familyCandidates.has(item.candidate.angle_family))familyCandidates.set(item.candidate.angle_family,item.candidate);}
  const validationErrors=[...candidateErrors,...initialGuard.errors,...initialGuard.byIndex.filter(item=>item&&!item.valid).map(item=>({candidate_index:item.index,errors:item.errors}))];
  const repairAttempts=[];
  for(const family of ANGLE_FAMILIES){if(familyCandidates.has(family))continue;const failed=initialGuard.byIndex.find(item=>item?.candidate?.angle_family===family&&!item.valid);const reason=failed?.errors?.map(error=>error.code).join(', ')||'missing or duplicate angle family';let repaired=null;for(let attempt=1;attempt<=2&&!repaired;attempt++){repairAttempts.push({angle_family:family,attempt,reason});try{const repairBody=await requestModel(buildRepairInstruction({angleFamily:family,reason,acceptedTitles:[...familyCandidates.values()].map(item=>item.title),recentTitles:memoryTitles,context:facts}),JSON.stringify({facts,accepted_titles:[...familyCandidates.values()].map(item=>item.title),recent_titles:memoryTitles}));for(const rawCandidate of modelCandidates(repairBody)){if(rawCandidate.angle_family!==family)continue;try{const candidate=validateCandidate(normalizeCandidate(rawCandidate));candidate.angle_family=family;const check=validateGroundedCandidate(candidate,{context:facts,recentTitles:memoryTitles,acceptedTitles:[...avoidTitles,...memoryTitles,...[...familyCandidates.values()].map(item=>item.title)]});if(check.valid){repaired=candidate;break;}validationErrors.push({angle_family:family,attempt,errors:check.errors});}catch(error){validationErrors.push({angle_family:family,attempt,errors:[{code:error.message||'INVALID_SCHEMA',detail:error.message}]});}}}catch(error){validationErrors.push({angle_family:family,attempt,errors:[{code:'REPAIR_REQUEST_FAILED',detail:error.message}]});}}if(repaired)familyCandidates.set(family,repaired);}
  let finalCandidates=ANGLE_FAMILIES.map(family=>familyCandidates.get(family)).filter(Boolean);
  if(!finalCandidates.length)finalCandidates=initialGuard.byIndex.filter(item=>item?.valid).map(item=>item.candidate);
  const validation={valid:finalCandidates.length===3&&new Set(finalCandidates.map(item=>item.angle_family)).size===3,errors:validationErrors,repairAttempts,initial:initialGuard};
  if(!finalCandidates.length){const firstError=candidateErrors[0]?.errors?.[0]?.code;if(firstError&&firstError!=='INVALID_SCHEMA')throw Error(firstError);throw Error('NO_UNIQUE_TITLE_GENERATED');}
  const defaultCandidateIndex=chooseDefaultCandidate(finalCandidates,[...avoidTitles,...memoryTitles]);
  return {schemaVersion:1,id:crypto.randomUUID(),shortId:row.short_id,hash:row.file_hash,batchId:row.batch_id,revision:metadataRevision(row),model,context:facts,missingFields:missing,candidates:finalCandidates,state:validation.valid?'REVIEW_REQUIRED':'GENERATION_REVIEW_REQUIRED',validation,defaultCandidateIndex,createdAt:new Date().toISOString()};
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
  ipcMain.handle('engine:metadata-queue-generate',async(event,p={})=>{
    if(queueJob||active.size||isProductionBusy())throw Error('METADATA_GENERATION_IN_PROGRESS');
    queueJob={stop:false};
    try{
      const config=await settings();
      if(!config.model){const models=await listLocalModels({baseUrl:config.baseUrl});if(models.length!==1)throw Error('SET_MODEL_ID');config.model=models[0].id;}
      const {generateQueueMetadata}=await import('./metadata-queue.mjs');
      return await generateQueueMetadata({outputDir,repository,config,limit:p.limit??null,shouldStop:()=>queueJob.stop,onProgress:progress=>{if(event?.sender&&!event.sender.isDestroyed())event.sender.send('engine:metadata-queue-progress',progress);}});
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
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
const ROOT=path.resolve(import.meta.dirname,'..');
async function readJson(file){return JSON.parse(await fsp.readFile(file,'utf8'));}
async function accessToken(config,fetchImpl=fetch){const token=await readJson(path.resolve(ROOT,config.oauthTokenPath));if(token.expires_at&&Date.now()<token.expires_at-60000)return token.access_token;const clientFile=await readJson(path.resolve(ROOT,config.oauthClientPath));const client=clientFile.installed||clientFile.web;const response=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:client.client_id,client_secret:client.client_secret,refresh_token:token.refresh_token,grant_type:'refresh_token'})});const body=await response.json();if(!response.ok)throw Error(`OAuth refresh failed: ${body.error||body.error_description||response.status}`);const fresh={...token,access_token:body.access_token,expires_at:Date.now()+body.expires_in*1000};await fsp.writeFile(path.resolve(ROOT,config.oauthTokenPath),JSON.stringify(fresh,null,2));return fresh.access_token;}
async function parse(response){const text=await response.text();let body={};try{body=text?JSON.parse(text):{};}catch{}if(!response.ok)throw Error(`YouTube API ${response.status}: ${body.error?.message||text.slice(0,300)}`);return body;}
async function api(config,url,options={},fetchImpl=fetch,tokenProvider=()=>accessToken(config,fetchImpl)){const headers={...(options.headers||{}),Authorization:`Bearer ${await tokenProvider()}`};if(options.body&&typeof options.body==='string'&&!headers['Content-Type'])headers['Content-Type']='application/json';return parse(await fetchImpl(url,{...options,headers}));}
export function createYouTubeRealClient({config,fetchImpl=fetch,tokenProvider}={}){if(!config)throw Error('YOUTUBE_CONFIG_REQUIRED');const token=tokenProvider||(()=>accessToken(config,fetchImpl));return {
  channels:{async mine(){const q=new URLSearchParams({part:'id,snippet,contentDetails',mine:'true'});const body=await api(config,`https://www.googleapis.com/youtube/v3/channels?${q}`,{},fetchImpl,token);return body.items?.[0]||null;}},
  videos:{
    async update(payload){return api(config,'https://www.googleapis.com/youtube/v3/videos?part=snippet%2Cstatus',{method:'PUT',body:JSON.stringify(payload)},fetchImpl,token);},
    async list(id){const q=new URLSearchParams({part:'id,snippet,status,processingDetails',id});const body=await api(config,`https://www.googleapis.com/youtube/v3/videos?${q}`,{},fetchImpl,token);return body.items?.[0]||null;},
    async insertPrivateResumable(operation){
      if(operation.privacyStatus!=='private')throw Error('UPLOAD_MUST_START_PRIVATE');
      const stat=await fsp.stat(operation.filePath),auth=`Bearer ${await token()}`;
      if(stat.size!==operation.fileSize)throw Error('UPLOAD_FILE_SIZE_CHANGED');
      const init=await fetchImpl('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet%2Cstatus',{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Length':String(stat.size),'X-Upload-Content-Type':'video/mp4'},body:JSON.stringify({snippet:{title:operation.temporaryTitle,description:'',categoryId:operation.categoryId||'10'},status:{privacyStatus:'private',selfDeclaredMadeForKids:false}})});
      if(!init.ok)await parse(init);
      const location=init.headers.get('location');if(!location)throw Error('YOUTUBE_RESUMABLE_SESSION_MISSING');
      let response;try{response=await fetchImpl(location,{method:'PUT',headers:{Authorization:auth,'Content-Type':'video/mp4','Content-Length':String(stat.size)},body:fs.createReadStream(operation.filePath),duplex:'half'});}catch(error){const wrapped=Error(`UPLOAD_REMOTE_STATE_UNKNOWN:${error.message}`);wrapped.cause=error;throw wrapped;}
      return parse(response);
    }
  }
};}
export async function loadYouTubeConfig(){const cfg=await readJson(path.join(ROOT,'phase2','config.json'));return {...cfg,oauthClientPath:path.resolve(ROOT,cfg.oauthClientPath),oauthTokenPath:path.resolve(ROOT,cfg.oauthTokenPath)};}

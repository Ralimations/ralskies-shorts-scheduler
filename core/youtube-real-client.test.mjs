import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createYouTubeRealClient} from './youtube-real-client.mjs';

function response({status=200,body={},location}={}){return {ok:status>=200&&status<300,status,headers:{get:name=>name.toLowerCase()==='location'?location||null:null},text:async()=>JSON.stringify(body)};}
test('real client uses official resumable private-first videos.insert flow',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ralskies-client-')),file=path.join(dir,'clip.mp4');await fs.writeFile(file,'video');const calls=[];
  const fetchImpl=async(url,options={})=>{calls.push({url,options});if(calls.length===1)return response({location:'https://upload.example/session'});options.body.destroy();return response({body:{id:'YT1'}});};
  const client=createYouTubeRealClient({config:{},fetchImpl,tokenProvider:async()=>'token'}),result=await client.videos.insertPrivateResumable({filePath:file,fileSize:5,temporaryTitle:'A'.repeat(64),categoryId:'10',privacyStatus:'private'});
  assert.equal(result.id,'YT1');assert.match(calls[0].url,/upload\/youtube\/v3\/videos\?uploadType=resumable/);assert.equal(calls[0].options.method,'POST');assert.equal(JSON.parse(calls[0].options.body).status.privacyStatus,'private');assert.equal(calls[1].options.method,'PUT');assert.equal(calls[1].options.headers['Content-Length'],'5');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {withPipelineLock} from './pipeline-store.mjs';
test('local recovery archives a dead lock, while default workflows retain it',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pipeline-recovery-'));
 const child=spawn(process.execPath,['-e','']);await once(child,'exit');
 const file=path.join(directory,'draft-pipeline.lock'),raw=JSON.stringify({pid:child.pid,startedAt:new Date().toISOString()});
 await fs.writeFile(file,raw);
 await assert.rejects(withPipelineLock(directory,async()=>{}),/BUSY/);
 let ran=false;await withPipelineLock(directory,async()=>{ran=true;assert.equal(JSON.parse(await fs.readFile(file)).pid,process.pid);},{recoverAbandoned:true});
 assert.equal(ran,true);
 const archived=(await fs.readdir(directory)).find(name=>name.includes('.abandoned-'));
 assert.equal(await fs.readFile(path.join(directory,archived),'utf8'),raw);
 await assert.rejects(fs.access(file),{code:'ENOENT'});
});
test('local recovery refuses active and malformed lock owners',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pipeline-owner-')),file=path.join(directory,'draft-pipeline.lock');
 for(const raw of [JSON.stringify({pid:process.pid}),'invalid',JSON.stringify({pid:0})]){
  await fs.writeFile(file,raw);let ran=false;
  await assert.rejects(withPipelineLock(directory,async()=>{ran=true;},{recoverAbandoned:true}),/BUSY|OWNER_UNKNOWN/);
  assert.equal(ran,false);assert.equal(await fs.readFile(file,'utf8'),raw);
 }
});

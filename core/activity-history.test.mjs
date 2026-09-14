import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {activityHistory,appendActivity} from './activity-history.mjs';
test('history includes old successes, snapshots, and resolved exceptions without exposing other files',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'activity-history-'));
 await fs.writeFile(path.join(dir,'production-old.log'),JSON.stringify({timestamp:'2020-01-01',event:'EXECUTION_COMPLETE',state:'COMPLETE',access_token:'secret'})+'\ninvalid');
 await fs.writeFile(path.join(dir,'old.journal.json'),JSON.stringify({created_at:'2020-01-02',batch_id:'BULK_01',rows:[{short_id:'RS-1',state:'COMPLETE'}]}));
 await fs.writeFile(path.join(dir,'exceptions.json'),JSON.stringify([{timestamp:'2020-01-03',code:'TITLE_TOO_LONG',resolved:true}]));
 await fs.writeFile(path.join(dir,'oauth.json'),JSON.stringify({access_token:'never-read'}));
 const result=await activityHistory(dir);assert.equal(result.total,4);assert.equal(result.entries[0].event,'TITLE_TOO_LONG');assert.ok(result.entries.some(e=>e.event==='EXECUTION_COMPLETE'));assert.ok(result.entries.some(e=>e.state==='COMPLETE'&&e.batchId==='BULK_01'));assert.doesNotMatch(JSON.stringify(result),/secret|never-read/);
});

test('activity stays on disk between reads and concurrent actions remain separate entries',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'activity-append-'));
 await Promise.all([appendActivity(dir,{event:'save-settings',state:'COMPLETED'}),appendActivity(dir,{event:'draft-scan',state:'FAILED'})]);
 const first=await activityHistory(dir),second=await activityHistory(dir);assert.equal(first.total,2);assert.deepEqual(second,first);assert.ok(first.entries.some(row=>row.state==='FAILED'));
});

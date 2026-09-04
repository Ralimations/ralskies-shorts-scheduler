import test from 'node:test';
import assert from 'node:assert/strict';
import {assertConfirmableDiscovery} from './match-confirmation.mjs';

test('unrelated private videos do not block exact selected-batch confirmation',()=>{
  const discovery={batchId:'BULK_03',expected:14,selectedRows:14,missing:[],counts:{MATCHED:14,UNKNOWN:28,INVALID_HASH_TITLE:7,DUPLICATE_MATCH:0}};
  assert.equal(assertConfirmableDiscovery(discovery,'BULK_03'),true);
});
test('missing or ambiguous selected-batch matches remain blocked',()=>{
  assert.throws(()=>assertConfirmableDiscovery({batchId:'BULK_03',expected:14,selectedRows:14,missing:['HASH'],counts:{MATCHED:13,DUPLICATE_MATCH:0}},'BULK_03'),/exact/);
  assert.throws(()=>assertConfirmableDiscovery({batchId:'BULK_03',expected:14,selectedRows:14,missing:[],counts:{MATCHED:14,DUPLICATE_MATCH:1}},'BULK_03'),/exact/);
});

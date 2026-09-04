import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireProductionExecution,getActiveProductionExecution,releaseProductionExecution} from './production-execution-lock.mjs';

test('one production execution per batch can be active',()=>{
  assert.equal(acquireProductionExecution({batchId:'BULK_TEST',executionId:'one'}),true);
  assert.equal(acquireProductionExecution({batchId:'BULK_TEST',executionId:'two'}),false);
  assert.equal(getActiveProductionExecution('BULK_TEST'),'one');
  assert.equal(releaseProductionExecution({batchId:'BULK_TEST',executionId:'two'}),false);
  assert.equal(getActiveProductionExecution('BULK_TEST'),'one');
  assert.equal(releaseProductionExecution({batchId:'BULK_TEST',executionId:'one'}),true);
  assert.equal(getActiveProductionExecution('BULK_TEST'),null);
});

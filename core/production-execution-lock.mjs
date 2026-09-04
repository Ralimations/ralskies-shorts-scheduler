const activeExecutions=new Map();

export function acquireProductionExecution({batchId,executionId}){
  const batch=String(batchId||'');
  const execution=String(executionId||'');
  if(!batch||!execution)throw new Error('EXECUTION_LOCK_IDENTITY_REQUIRED');
  if(activeExecutions.has(batch))return false;
  activeExecutions.set(batch,execution);
  return true;
}

export function releaseProductionExecution({batchId,executionId}){
  const batch=String(batchId||'');
  if(activeExecutions.get(batch)!==String(executionId||''))return false;
  activeExecutions.delete(batch);
  return true;
}

export function getActiveProductionExecution(batchId){
  return activeExecutions.get(String(batchId||''))||null;
}

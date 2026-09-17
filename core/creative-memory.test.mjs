import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {recordGeneration,recordApproval,recordRejection,retrieveCreativeMemory,memoryStats,listMemory,setMemoryActive,creativeMemoryDbPath} from './creative-memory.mjs';

function suggestion(id,overrides={}) {
  const candidates = [
    {title:'Disney please let me be the prince',description:'A bright little take on the chorus.',tags:['#Disney','#MusicalTheatre','#Cover'],angle_family:'PERSONALITY'},
    {title:'can i be the prince or what',description:'Would you cast me for this one?',tags:['#Aladdin','#Cover','#Singing'],angle_family:'INTERACTION'},
    {title:'Arabian Nights has no reason to be this fun',description:'My cover of Arabian Nights from Aladdin.',tags:['#ArabianNights','#Disney','#Cover'],angle_family:'CONTEXT_DISCOVERY'}
  ];
  return {id,hash:'hash-'+id,batchId:'BATCH-1',shortId:'RS-'+id,model:'test-model',contentType:'COVER',context:{song:'Arabian Nights',source:'Aladdin',artist:'Disney',niche:'Musical Theatre',content_type:'COVER'},candidates,...overrides};
}

test('creative memory stores generations, decisions, and stable deduplicated events',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'creative-memory-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const first=suggestion('GEN-1');
  const stored=await recordGeneration(root,first); assert.equal(stored.stored,3);
  await recordGeneration(root,first);
  assert.equal((await memoryStats(root)).total,3);
  assert.ok((await fs.stat(creativeMemoryDbPath(root))).isFile());
  await recordApproval(root,{suggestion:first,candidateIndex:1,approvedTitle:'can i be the prince tonight?',approvedDescription:'Would you cast me for this one?',approvedHashtags:['#Aladdin','#Cover'],reason:'USER_APPROVED'});
  await recordRejection(root,{generationId:first.id,candidateIndex:0,reason:'TOO_GENERIC'});
  const stats=await memoryStats(root); assert.equal(stats.approved,1); assert.equal(stats.edited,1); assert.equal(stats.rejected,1); assert.equal(stats.active,1);
  const edited=await listMemory(root,'EDITED'); assert.equal(edited.length,1); assert.equal(edited[0].approved_title,'can i be the prince tonight?');
  const context=await retrieveCreativeMemory(root,{song:'Arabian Nights',source:'Aladdin',artist:'Disney',niche:'Musical Theatre'});
  assert.equal(context.positive_examples.length,1); assert.equal(context.positive_examples[0].title,'can i be the prince tonight?');
  assert.equal(context.recent_titles.length,1); assert.equal(context.negative_examples.length,1); assert.equal(context.negative_examples[0].reason,'TOO_GENERIC');
  const disabled=await setMemoryActive(root,edited[0].memory_id,false); assert.equal(disabled.active_for_rag,false);
  assert.equal((await retrieveCreativeMemory(root,{source:'Aladdin'})).positive_examples.length,0);
  assert.equal((await memoryStats(root)).active,0);
});

test('retrieval uses context and deterministic diversity across approved examples',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'creative-memory-diverse-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const first=suggestion('GEN-A'); const second=suggestion('GEN-B',{shortId:'RS-GEN-B',context:{song:'Other Song',source:'Other Show',artist:'Other Artist',niche:'Musical Theatre',content_type:'COVER'}});
  await recordGeneration(root,first); await recordGeneration(root,second);
  await recordApproval(root,{suggestion:first,candidateIndex:0,approvedTitle:first.candidates[0].title,approvedDescription:first.candidates[0].description,approvedHashtags:first.candidates[0].tags});
  await recordApproval(root,{suggestion:first,candidateIndex:1,approvedTitle:first.candidates[1].title,approvedDescription:first.candidates[1].description,approvedHashtags:first.candidates[1].tags});
  await recordApproval(root,{suggestion:first,candidateIndex:2,approvedTitle:first.candidates[2].title,approvedDescription:first.candidates[2].description,approvedHashtags:first.candidates[2].tags});
  await recordApproval(root,{suggestion:second,candidateIndex:2,approvedTitle:'Other show, same little vocal chaos',approvedDescription:'A fresh musical theatre take.',approvedHashtags:['#Cover']});
  const query={song:'Arabian Nights',source:'Aladdin',niche:'Musical Theatre',positiveLimit:8};
  const a=await retrieveCreativeMemory(root,query),b=await retrieveCreativeMemory(root,query);
  assert.deepEqual(a.positive_examples,b.positive_examples);
  assert.ok(a.positive_examples.length>=3);
  assert.ok(new Set(a.positive_examples.map(x=>x.angle_family)).size>=3);
  assert.ok(a.retrieval_summary.same_source_count>=3);
});

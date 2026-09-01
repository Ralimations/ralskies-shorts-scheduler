import assert from 'node:assert/strict';import {buildProductionReview} from './production-review.mjs';
const rows=Array.from({length:14},(_,i)=>({batch_id:'BULK_02',short_id:`S${i}`,source_song:`Song ${i}`,youtube_video_id:`Y${i}`,public_title:`Title ${i}`,scheduled_date:'2026-09-01',scheduled_time:'17:30',status:i<3?'SCHEDULED':'BATCH_READY'}));
let m=buildProductionReview({rows});assert.equal(m.completedCount,3);assert.equal(m.readyCount,11);assert.equal(m.plannedOperationCount,11);assert.equal(m.rows.length,11);assert.equal(m.plan.approvedRowIds.length,11);assert.equal(m.plan.youtubeIds.length,11);assert.equal(m.rows.some(x=>['S0','S1','S2'].includes(x.shortId)),false);
m=buildProductionReview({rows:rows.map((r,i)=>i===3?{...r,status:'APPLIED_UNVERIFIED'}:r),recoveryRows:[{short_id:'S3',state:'APPLIED_UNVERIFIED'}]});assert.equal(m.recoveryRequiredCount,1);assert.equal(m.rows.length,10);
m=buildProductionReview({rows:rows.map((r,i)=>i>2?{...r,youtube_video_id:i===4?'':r.youtube_video_id,status:i===4?'BLOCKED':r.status}:r)});assert.equal(m.blockedCount,1);assert.equal(m.rows.length,10);
m=buildProductionReview({rows:rows.map((r,i)=>i>2?{...r,status:'BLOCKED'}:r)});assert.equal(m.plannedOperationCount,0);assert.equal(m.rows.length,0);
console.log('production review tests passed');


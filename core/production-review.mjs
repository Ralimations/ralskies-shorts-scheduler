import { createExecutionPlan } from './execution-plan.mjs';

const RECOVERY = new Set(['APPLIED','APPLIED_UNVERIFIED','VERIFYING','VERIFIED_PENDING_TRACKER','RECONCILIATION_REQUIRED']);
const COMPLETE = new Set(['SCHEDULED','PUBLISHED','COMPLETE']);
const BLOCKED = new Set(['BLOCKED','DUPLICATE','FAILED']);
function excelDate(v){if(!v)return '1970-01-01';if(typeof v==='number')return new Date(Date.UTC(1899,11,30)+v*86400000).toISOString().slice(0,10);const d=new Date(v);return Number.isNaN(d.getTime())?'1970-01-01':d.toISOString().slice(0,10)}
function planned(row){const status=String(row.status||'').toUpperCase();if(['NOT_APPROVED','UNAPPROVED','PENDING_APPROVAL'].includes(status))return false;const dup=String(row.duplicate_disposition||'').toUpperCase();return !COMPLETE.has(status)&&!RECOVERY.has(status)&&!BLOCKED.has(status)&&!dup.includes('DUPLICATE')&&String(row.youtube_video_id||'').trim()}
export function buildProductionReview({batchId='BULK_02',rows=[],recoveryRows=[]}={}){
 const batch=rows.filter(r=>String(r.batch_id)===String(batchId)); const recoveryIds=new Set(recoveryRows.filter(r=>RECOVERY.has(String(r.state||'').toUpperCase())).map(r=>String(r.short_id)));
 const exclusions=batch.filter(r=>!planned(r)||recoveryIds.has(String(r.short_id)));
 const executable=batch.filter(r=>planned(r)&&!recoveryIds.has(String(r.short_id)));
 const plan=createExecutionPlan({batchId,mode:'SELECTED',rowIds:executable.map(r=>String(r.short_id)),rows:executable});
 const outRows=executable.map(r=>({shortId:String(r.short_id),song:String(r.source_song||''),youtubeId:String(r.youtube_video_id),currentYoutubeTitle:String(r.current_youtube_title||r.youtube_title||r.public_title||''),finalAuthoritativeTitle:String(r.public_title||''),schedulePht:`${excelDate(r.scheduled_date)} ${String(r.scheduled_time||'')}`.trim(),publishAtUtc:r.publishAtUtc||new Date(`${excelDate(r.scheduled_date)}T${String(r.scheduled_time||'00:00')}:00+08:00`).toISOString(),currentStatus:String(r.status||'')}));
 const blockedCount=batch.filter(r=>BLOCKED.has(String(r.status||'').toUpperCase())||String(r.duplicate_disposition||'').toUpperCase().includes('DUPLICATE')||!String(r.youtube_video_id||'').trim()).length;
 return {batchId,executionId:plan.executionId,createdAt:plan.createdAt,completedCount:batch.filter(r=>COMPLETE.has(String(r.status||'').toUpperCase())).length,readyCount:outRows.length,blockedCount,recoveryRequiredCount:batch.filter(r=>recoveryIds.has(String(r.short_id))).length,plannedOperationCount:plan.operationCount,concurrency:1,failFast:true,rows:outRows,plan,exclusions:exclusions.map(r=>({shortId:String(r.short_id),status:String(r.status||''),reason:recoveryIds.has(String(r.short_id))?'RECOVERY_REQUIRED':String(r.status||r.duplicate_disposition||'BLOCKED')}))};
}





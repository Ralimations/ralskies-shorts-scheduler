export const RECOVERY_STATES = new Set([
  'APPLIED', 'APPLIED_UNVERIFIED', 'VERIFYING',
  'VERIFIED_PENDING_TRACKER', 'RECONCILIATION_REQUIRED'
]);

export function normalizeRecoveryRows(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .filter(row => row && RECOVERY_STATES.has(String(row.state || '').toUpperCase()))
    .map(row => ({
      ...row,
      state: String(row.state).toUpperCase(),
      execution_id: row.execution_id ?? row.executionId ?? '',
      batch_id: row.batch_id ?? row.batchId ?? '',
      short_id: row.short_id ?? row.shortId ?? '',
      youtube_video_id: row.youtube_video_id ?? row.youtubeVideoId ?? ''
    }));
}

export function recoveryApplyBlocked(row) {
  return RECOVERY_STATES.has(String(row?.state || '').toUpperCase());
}

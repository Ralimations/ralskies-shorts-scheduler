(function(global){
 function describe(message){
  const text=String(message||'');
  if(/invalid_grant/i.test(text))return 'Reconnect your Google account: run node phase2/youtube_phase2.mjs auth from the desktop folder, complete sign-in, then check the existing uploads again.';
  if(/REAL_PRODUCTION_EXECUTION_DISABLED/.test(text))return 'Close the app and restart with npm run start:live. This request did not start a YouTube write.';
  if(/invalid.*title|TITLE_EMPTY|TITLE_TOO_LONG|TITLE_CONTAINS/i.test(text))return 'Open Batches → Check Metadata. Edit the title to 1–100 characters, including spaces and hashtags, with no < or >. Save it and build a fresh production review.';
  if(/VERIFICATION_MISMATCH|APPLIED_UNVERIFIED|RECONCILIATION_REQUIRED/.test(text))return 'A YouTube update may already have succeeded. Check Logs / Recovery and verify the existing video before retrying. Do not upload another copy or change the pending target.';
  if(/METADATA_CHANGED|PLAN_STALE|TARGETS_STALE/.test(text))return 'Close this review and open it again. The tracker changed after the preview was created.';
  if(/DRAFT_PIPELINE_LOCK_OWNER_UNKNOWN/.test(text))return 'The saved lock has no verifiable owner. Inspect local recovery records before clearing it.';
  if(/DRAFT_PIPELINE_BUSY_OR_RECOVERY_REQUIRED/.test(text))return 'Another process still owns the pipeline lock, or recovery is being checked. Close any older app instance and reopen the metadata editor. Unfinished video executions remain protected.';
  if(/PIPELINE_BUSY|TRACKER_MUTATION|EXECUTION_IN_PROGRESS/.test(text))return 'Wait for the current operation to finish before editing or applying another plan.';
  if(/quotaExceeded|quota/i.test(text))return 'Check the Google Cloud YouTube API quota. Keep completed work and resume only after quota is available and recovery is clear.';
  return '';
 }
 global.ErrorGuidance={describe};
})(window);

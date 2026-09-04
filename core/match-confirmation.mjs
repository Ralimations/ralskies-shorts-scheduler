import fs from "node:fs/promises";
import { backupTracker, openTracker, readTracker, saveTracker, updateTrackerRows } from "./tracker-service.mjs";

export function assertConfirmableDiscovery(discovery, batchId) {
  if (!discovery || discovery.batchId !== batchId) throw new Error("Discovery result does not belong to the selected batch.");
  if (discovery.expected !== discovery.selectedRows || discovery.counts.MATCHED !== discovery.expected || discovery.missing?.length || discovery.counts.DUPLICATE_MATCH) throw new Error("Confirmation requires an exact, unambiguous match for every expected batch row.");
  return true;
}

export async function confirmMatches({ discovery, trackerPath, batchId = "BULK_02" }) {
  assertConfirmableDiscovery(discovery, batchId);
  const matched = discovery.results.filter((result) => result.status === "MATCHED"); if (matched.length !== discovery.expected) throw new Error("Confirmation result count does not match the expected batch count.");
  const tracker = await openTracker(trackerPath); const values = tracker.queue.getUsedRange().values; const extra = ["match_status", "match_verified_at"]; const missing = extra.filter((header) => !(header in tracker.index));
  if (missing.length) { const start = tracker.headers.length; tracker.queue.getRangeByIndexes(0, start, values.length, missing.length).values = [missing, ...Array.from({ length: values.length - 1 }, () => missing.map(() => ""))]; missing.forEach((header, offset) => { tracker.headers.push(header); tracker.index[header] = start + offset; }); }
  const verifiedAt = new Date().toISOString(); const updates = matched.map((result) => ({ short_id: result.row.short_id, youtube_video_id: result.videoId, batch_id: batchId, match_status: "CONFIRMED", match_verified_at: verifiedAt })); const backupPath = await backupTracker(trackerPath, `match-${Date.now()}`); await updateTrackerRows(tracker, updates); await saveTracker(tracker);
  const rows = await readTracker(trackerPath); const verification = updates.map((update) => { const row = rows.find((candidate) => String(candidate.short_id) === String(update.short_id) && String(candidate.batch_id) === batchId); return { shortId: update.short_id, youtubeVideoId: update.youtube_video_id, confirmed: Boolean(row && row.youtube_video_id === update.youtube_video_id && row.match_status === "CONFIRMED" && row.match_verified_at) }; });
  if (verification.some((item) => !item.confirmed)) throw new Error("Tracker confirmation verification failed.");
  return { batchId, state: "MATCHES_CONFIRMED", expected: updates.length, verified: verification.filter((item) => item.confirmed).length, backupPath, verification };
}

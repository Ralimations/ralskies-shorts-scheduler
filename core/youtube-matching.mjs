const HASH = /^[A-F0-9]{64}$/;

export function normalizeHashTitle(title) {
  const value = String(title ?? "").trim().replace(/\.mp4$/i, "").trim().toUpperCase();
  return HASH.test(value) ? value : null;
}

export function matchPrivateVideos(videos, batchRows) {
  const byHash = new Map();
  for (const row of batchRows) {
    const hash = String(row.file_hash || row.sha256 || "").trim().toUpperCase();
    if (!HASH.test(hash)) continue;
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(row);
  }
  const results = (videos || []).map((video) => {
    const hash = normalizeHashTitle(video.title ?? video.snippet?.title);
    if (!hash) return { videoId: video.id || video.videoId, title: video.title ?? video.snippet?.title ?? "", hash: null, status: "INVALID_HASH_TITLE" };
    const rows = byHash.get(hash) || [];
    if (!rows.length) return { videoId: video.id || video.videoId, title: video.title ?? video.snippet?.title ?? "", hash, status: "UNKNOWN" };
    if (rows.length !== 1) return { videoId: video.id || video.videoId, title: video.title ?? video.snippet?.title ?? "", hash, status: "DUPLICATE_MATCH", rows };
    const row = rows[0];
    if (String(row.youtube_video_id || "").trim() === String(video.id || video.videoId || "").trim()) return { videoId: video.id || video.videoId, title: video.title ?? video.snippet?.title ?? "", hash, status: "ALREADY_LINKED", row };
    return { videoId: video.id || video.videoId, title: video.title ?? video.snippet?.title ?? "", hash, status: "MATCHED", row };
  });
  const matchedHashes = new Set(results.filter((result) => result.status === "MATCHED").map((result) => result.hash));
  const expected = [...byHash.keys()];
  const counts = Object.fromEntries(["MATCHED", "UNKNOWN", "ALREADY_LINKED", "DUPLICATE_MATCH", "INVALID_HASH_TITLE"].map((status) => [status, results.filter((result) => result.status === status).length]));
  return { results, expected: expected.length, missing: expected.filter((hash) => !matchedHashes.has(hash)), counts, state: counts.MATCHED === 0 ? "WAITING_FOR_PRIVATE_UPLOAD" : counts.MATCHED === expected.length ? "MATCH_REVIEW" : "PRIVATE_VIDEOS_FOUND" };
}


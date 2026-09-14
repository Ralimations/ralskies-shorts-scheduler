import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { URL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONFIG_PATH = path.join(import.meta.dirname, "config.json");
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

async function readJson(filePath, optional = false) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (optional && error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tempPath, filePath);
}

function resolveFromRoot(relativeOrAbsolute) {
  return path.isAbsolute(relativeOrAbsolute) ? relativeOrAbsolute : path.join(ROOT, relativeOrAbsolute);
}

async function loadConfig() {
  const config = await readJson(CONFIG_PATH, true);
  if (!config) fail(`Missing ${CONFIG_PATH}. Copy config.example.json to config.json first.`);
  for (const key of ["expectedChannelTitle", "expectedChannelId", "oauthClientPath", "oauthTokenPath", "testBatchPath", "statePath"]) {
    if (!config[key]) fail(`Missing config key: ${key}`);
  }
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [
    key,
    key.endsWith("Path") ? resolveFromRoot(value) : value,
  ]));
}

function base64url(buffer) {
  return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function safeError(error) {
  const message = String(error?.message || error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(/(access_token|refresh_token|client_secret)\s*[=:]\s*[^\s,&]+/gi, "$1=[REDACTED]");
}

async function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  const handle = await fs.open(filePath, "r");
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk);
  } finally {
    await handle.close();
  }
  return hash.digest("hex").toUpperCase();
}

async function loadClient(clientPath) {
  const raw = await readJson(clientPath);
  const client = raw.installed || raw.web;
  if (!client?.client_id || !client?.client_secret) {
    fail("OAuth client JSON must contain an installed or web client with client_id and client_secret.");
  }
  return client;
}

async function oauth(config) {
  const token = await readJson(config.oauthTokenPath, true);
  if (!token) fail("OAuth token is missing. Run: node phase2/youtube_phase2.mjs auth");
  if (token.expires_at && Date.now() < token.expires_at - 60_000 && token.access_token) return token.access_token;
  if (!token.refresh_token) fail("OAuth token has no refresh_token. Re-run auth.");
  const client = await loadClient(config.oauthClientPath);
  const body = new URLSearchParams({
    client_id: client.client_id,
    client_secret: client.client_secret,
    refresh_token: token.refresh_token,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  const result = await response.json();
  if (!response.ok) fail(`OAuth refresh failed (${response.status}): ${result.error || "unknown error"}`);
  await writeJsonAtomic(config.oauthTokenPath, {
    ...token,
    access_token: result.access_token,
    expires_at: Date.now() + result.expires_in * 1000,
    scope: result.scope || token.scope,
    token_type: result.token_type || token.token_type,
  });
  return result.access_token;
}

async function api(config, endpoint, options = {}) {
  const accessToken = await oauth(config);
  const response = await fetch(endpoint, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  if (!response.ok) {
    const reason = body?.error?.errors?.[0]?.reason || body?.error?.status || "unknown";
    const message = body?.error?.message || `HTTP ${response.status}`;
    fail(`YouTube API ${response.status} ${reason}: ${message}`);
  }
  return body;
}

async function authenticate(config) {
  const client = await loadClient(config.oauthClientPath);
  const state = base64url(crypto.randomBytes(24));
  const verifier = base64url(crypto.randomBytes(64));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());

  let resolveCode;
  let rejectCode;
  const codePromise = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
  const server = http.createServer((request, response) => {
    const callback = new URL(request.url, "http://127.0.0.1");
    if (callback.pathname !== "/oauth2callback") {
      response.writeHead(404).end("Not found");
      return;
    }
    if (callback.searchParams.get("state") !== state) {
      response.writeHead(400).end("OAuth state mismatch. Close this tab.");
      rejectCode(new Error("OAuth state mismatch"));
      return;
    }
    const error = callback.searchParams.get("error");
    const code = callback.searchParams.get("code");
    if (error || !code) {
      response.writeHead(400).end("Authorization was not completed. Close this tab.");
      rejectCode(new Error(`OAuth authorization failed: ${error || "missing code"}`));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Authorization received. You can return to Codex.");
    resolveCode(code);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  console.log(`AUTH_URL=${authUrl}`);
  console.log("Waiting for OAuth callback; no credentials will be printed.");

  const timeout = setTimeout(() => rejectCode(new Error("OAuth authorization timed out after 10 minutes")), 10 * 60_000);
  try {
    const code = await codePromise;
    const body = new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
    const token = await response.json();
    if (!response.ok) fail(`OAuth token exchange failed (${response.status}): ${token.error || "unknown error"}`);
    await writeJsonAtomic(config.oauthTokenPath, {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: Date.now() + token.expires_in * 1000,
      scope: token.scope,
      token_type: token.token_type,
    });
    console.log("OAuth token stored securely outside source control.");
  } finally {
    clearTimeout(timeout);
    server.close();
  }
}

async function getAuthenticatedChannel(config) {
  const result = await api(config, "https://www.googleapis.com/youtube/v3/channels?part=id%2Csnippet&mine=true");
  if (!result.items?.length) fail("Authenticated account has no YouTube channel.");
  if (result.items.length !== 1) fail(`Authenticated account returned ${result.items.length} channels; channel identity is uncertain.`);
  const channel = result.items[0];
  if (channel.id !== config.expectedChannelId || channel.snippet?.title !== config.expectedChannelTitle) {
    fail(`CHANNEL MISMATCH: expected ${config.expectedChannelTitle} (${config.expectedChannelId}), got ${channel.snippet?.title || "unknown"} (${channel.id || "unknown"}).`);
  }
  return { channelId: channel.id, channelTitle: channel.snippet.title };
}

async function loadBatch(config) {
  const batch = await readJson(config.testBatchPath);
  if (batch.mode !== "PRIVATE_TEST_ONLY") fail("Test batch mode is not PRIVATE_TEST_ONLY.");
  if (!Array.isArray(batch.items) || batch.items.length < 1 || batch.items.length > 3) fail("Test batch must contain 1–3 items.");
  return batch;
}

async function prepare(config) {
  const batch = await loadBatch(config);
  const state = await loadState(config);
  const results = [];
  for (const item of batch.items) {
    if (item.duplicateDisposition !== "CLEARED BY CLIP-LEVEL AUDIT") fail(`${item.shortId} is not cleared.`);
    const localPath = resolveFromRoot(item.localPath);
    const actualHash = await sha256(localPath);
    if (actualHash !== item.sha256) fail(`${item.shortId} hash mismatch; refusing upload.`);
    const stat = await fs.stat(localPath);
    results.push({ shortId: item.shortId, localPath: item.localPath, sha256: actualHash, bytes: stat.size, ready: true });
    state.items[item.shortId] = {
      ...(state.items[item.shortId] || {}),
      shortId: item.shortId,
      localPath: item.localPath,
      sha256: item.sha256,
      title: item.title,
      description: item.description,
      hashtags: item.hashtags,
      tags: normalizedTags(item.tags),
      relatedVideoId: item.relatedVideoId,
      relatedVideoDisposition: "MANUAL STUDIO STEP",
      finalStatus: state.items[item.shortId]?.finalStatus || "READY_FOR_PRIVATE_TEST",
    };
  }
  state.oauthStatus = state.oauthStatus || "AWAITING_OAUTH_CLIENT";
  await saveState(config, state);
  console.log(JSON.stringify({ mode: batch.mode, items: results }, null, 2));
}

async function loadState(config) {
  return (await readJson(config.statePath, true)) || { version: 1, expectedChannelId: config.expectedChannelId, items: {}, attempts: [] };
}

async function saveState(config, state) {
  state.updatedAt = new Date().toISOString();
  await writeJsonAtomic(config.statePath, state);
}

async function recordChannel(config) {
  const channel = await getAuthenticatedChannel(config);
  const state = await loadState(config);
  state.oauthStatus = "AUTHENTICATED_CHANNEL_VERIFIED";
  state.authenticatedChannel = channel;
  state.channelVerifiedAt = new Date().toISOString();
  await saveState(config, state);
  return channel;
}

function getItem(batch, shortId) {
  const item = batch.items.find((candidate) => candidate.shortId === shortId);
  if (!item) fail(`Short ${shortId} is not in the approved Phase 2 test batch.`);
  return item;
}

function normalizedTags(tags) {
  return [...new Set((tags || []).map((tag) => tag.trim()).filter(Boolean))];
}

function comparableTags(tags) {
  // YouTube may return backend tags in a different order; tag order has no
  // semantic meaning, so verification compares the normalized set.
  return normalizedTags(tags).sort((a, b) => a.localeCompare(b));
}

async function getVideo(config, videoId) {
  const parts = encodeURIComponent("id,snippet,status,processingDetails");
  const result = await api(config, `https://www.googleapis.com/youtube/v3/videos?part=${parts}&id=${encodeURIComponent(videoId)}`);
  if (!result.items?.length) fail(`Uploaded video ${videoId} could not be retrieved.`);
  return result.items[0];
}

function verifyVideo(video, item, config, expectedPrivacy = "private", expectedPublishAt = null) {
  const issues = [];
  if (video.id == null) issues.push("video ID missing");
  if (video.snippet?.channelId !== config.expectedChannelId) issues.push(`channel ID ${video.snippet?.channelId || "missing"}`);
  if (video.snippet?.title !== item.title) issues.push("title mismatch");
  if (video.snippet?.description !== item.description) issues.push("description mismatch");
  if (JSON.stringify(comparableTags(video.snippet?.tags)) !== JSON.stringify(comparableTags(item.tags))) issues.push("backend tags mismatch");
  if (video.snippet?.categoryId !== item.categoryId) issues.push(`category ID ${video.snippet?.categoryId || "missing"}`);
  if (video.status?.privacyStatus !== expectedPrivacy) issues.push(`privacy ${video.status?.privacyStatus || "missing"}`);
  if (expectedPublishAt && Date.parse(video.status?.publishAt || "") !== Date.parse(expectedPublishAt)) {
    issues.push(`publishAt ${video.status?.publishAt || "missing"}`);
  }
  return {
    verified: issues.length === 0,
    issues,
    videoId: video.id,
    processingStatus: video.processingDetails?.processingStatus || "unknown",
    uploadStatus: video.status?.uploadStatus || "unknown",
    privacyStatus: video.status?.privacyStatus || "unknown",
    publishAt: video.status?.publishAt || null,
  };
}

async function startResumable(config, item, stateItem) {
  const accessToken = await oauth(config);
  const localPath = resolveFromRoot(item.localPath);
  const stat = await fs.stat(localPath);
  const metadata = {
    snippet: {
      title: item.title,
      description: item.description,
      tags: normalizedTags(item.tags),
      categoryId: item.categoryId,
    },
    status: {
      privacyStatus: "private",
      selfDeclaredMadeForKids: false,
    },
  };
  const endpoint = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet%2Cstatus&notifySubscribers=false";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(stat.size),
      "X-Upload-Content-Type": "video/mp4",
    },
    body: JSON.stringify(metadata),
  });
  if (!response.ok) {
    const body = await response.text();
    fail(`Resumable upload initiation failed (${response.status}): ${body.slice(0, 300)}`);
  }
  const sessionUrl = response.headers.get("location");
  if (!sessionUrl) fail("YouTube did not return a resumable upload session URL.");
  stateItem.sessionUrl = sessionUrl;
  stateItem.fileBytes = stat.size;
  return sessionUrl;
}

async function uploadSession(config, item, stateItem) {
  const accessToken = await oauth(config);
  const localPath = resolveFromRoot(item.localPath);
  const data = await fs.readFile(localPath);
  const response = await fetch(stateItem.sessionUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "video/mp4",
      "Content-Length": String(data.length),
      "Content-Range": `bytes 0-${data.length - 1}/${data.length}`,
    },
    body: data,
  });
  if (response.status === 308) fail("Upload session is incomplete; rerun recovery before any new insert.");
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) fail(`Media upload failed (${response.status}): ${body?.error?.message || text.slice(0, 300)}`);
  if (!body?.id) fail("Upload response did not contain a video ID; automatic retry is blocked.");
  return body.id;
}

async function uploadPrivate(config, shortId) {
  const channel = await getAuthenticatedChannel(config);
  const batch = await loadBatch(config);
  const item = getItem(batch, shortId);
  const localPath = resolveFromRoot(item.localPath);
  const actualHash = await sha256(localPath);
  if (actualHash !== item.sha256) fail("File hash changed; refusing upload.");
  const state = await loadState(config);
  const existingByHash = Object.values(state.items).find((candidate) => candidate.sha256 === item.sha256 && candidate.youtubeVideoId);
  if (existingByHash) {
    console.log(JSON.stringify({ action: "NO_INSERT", reason: "hash already has YouTube video ID", shortId, youtubeVideoId: existingByHash.youtubeVideoId }, null, 2));
    return;
  }
  const stateItem = state.items[shortId] || {
    shortId,
    localPath: item.localPath,
    sha256: item.sha256,
    title: item.title,
    description: item.description,
    hashtags: item.hashtags,
    tags: normalizedTags(item.tags),
    relatedVideoId: item.relatedVideoId,
    relatedVideoDisposition: "MANUAL STUDIO STEP",
  };
  state.items[shortId] = stateItem;
  const attempt = {
    attemptId: crypto.randomUUID(),
    shortId,
    sha256: item.sha256,
    attemptTime: new Date().toISOString(),
    intendedPrivacy: "private",
    channelId: channel.channelId,
    channelTitle: channel.channelTitle,
    finalStatus: "UPLOADING",
  };
  state.attempts.push(attempt);
  stateItem.finalStatus = "UPLOADING";
  await saveState(config, state);
  try {
    if (!stateItem.sessionUrl) {
      await startResumable(config, item, stateItem);
      await saveState(config, state);
    }
    const videoId = await uploadSession(config, item, stateItem);
    stateItem.youtubeVideoId = videoId;
    stateItem.uploadedAt = new Date().toISOString();
    stateItem.finalStatus = "UPLOADED_PRIVATE_AWAITING_PROCESSING";
    delete stateItem.sessionUrl;
    attempt.youtubeVideoId = videoId;
    attempt.finalStatus = stateItem.finalStatus;
    await saveState(config, state);
    console.log(JSON.stringify({ shortId, youtubeVideoId: videoId, privacy: "private", next: `verify --short-id ${shortId}` }, null, 2));
  } catch (error) {
    attempt.failureMessage = safeError(error);
    attempt.finalStatus = stateItem.youtubeVideoId ? "FAILED_AFTER_ID_ASSIGNED" : "RECOVERY_REQUIRED_NO_BLIND_RETRY";
    stateItem.failureMessage = attempt.failureMessage;
    stateItem.finalStatus = attempt.finalStatus;
    await saveState(config, state);
    throw error;
  }
}

async function verify(config, shortId) {
  await getAuthenticatedChannel(config);
  const batch = await loadBatch(config);
  const item = getItem(batch, shortId);
  const state = await loadState(config);
  const stateItem = state.items[shortId];
  if (!stateItem?.youtubeVideoId) fail(`${shortId} has no recorded YouTube video ID.`);
  const video = await getVideo(config, stateItem.youtubeVideoId);
  const result = verifyVideo(video, item, config, "private");
  stateItem.processingState = result.processingStatus;
  stateItem.verificationState = result.verified ? "METADATA_VERIFIED" : "VERIFICATION_FAILED";
  stateItem.verificationIssues = result.issues;
  stateItem.lastVerifiedAt = new Date().toISOString();
  stateItem.finalStatus = result.verified && result.processingStatus === "succeeded"
    ? "PRIVATE_TEST_VERIFIED"
    : result.verified ? "PRIVATE_METADATA_VERIFIED_PROCESSING" : "VERIFICATION_FAILED";
  const latestAttempt = [...(state.attempts || [])].reverse().find((attempt) => attempt.shortId === shortId);
  if (latestAttempt) {
    latestAttempt.processingState = result.processingStatus;
    latestAttempt.verificationState = stateItem.verificationState;
    latestAttempt.finalStatus = stateItem.finalStatus;
  }
  await saveState(config, state);
  console.log(JSON.stringify({ shortId, ...result, finalStatus: stateItem.finalStatus }, null, 2));
}

function writableStatus(status, publishAt) {
  const next = { privacyStatus: "private" };
  for (const key of ["embeddable", "license", "publicStatsViewable", "selfDeclaredMadeForKids", "containsSyntheticMedia"]) {
    if (status?.[key] !== undefined) next[key] = status[key];
  }
  if (publishAt !== undefined) next.publishAt = publishAt;
  return next;
}

async function writeProbe(config, shortId) {
  await getAuthenticatedChannel(config);
  const batch = await loadBatch(config);
  getItem(batch, shortId);
  const state = await loadState(config);
  const stateItem = state.items[shortId];
  if (stateItem?.finalStatus !== "PRIVATE_TEST_VERIFIED") fail("Write probe requires a verified private test upload.");
  const before = await getVideo(config, stateItem.youtubeVideoId);
  if (before.status?.privacyStatus !== "private" || before.status?.publishAt) fail("Write probe requires an unscheduled private video.");
  await api(config, "https://www.googleapis.com/youtube/v3/videos?part=status", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: stateItem.youtubeVideoId, status: writableStatus(before.status, null) }),
  });
  const after = await getVideo(config, stateItem.youtubeVideoId);
  const verified = after.status?.privacyStatus === "private" && !after.status?.publishAt;
  state.writeScopeProbe = { shortId, testedAt: new Date().toISOString(), verified, videoRemainsPrivate: verified };
  await saveState(config, state);
  if (!verified) fail("Write-scope probe did not preserve unscheduled private status.");
  console.log(JSON.stringify({ shortId, writeScopeVerified: true, privacyStatus: "private", publishAt: null }, null, 2));
}

async function unschedulePrivate(config, shortId) {
  await getAuthenticatedChannel(config);
  const batch = await loadBatch(config);
  getItem(batch, shortId);
  const state = await loadState(config);
  const stateItem = state.items[shortId];
  if (!stateItem?.youtubeVideoId) fail(`${shortId} has no uploaded test video.`);
  const before = await getVideo(config, stateItem.youtubeVideoId);
  await api(config, "https://www.googleapis.com/youtube/v3/videos?part=status", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: stateItem.youtubeVideoId, status: writableStatus(before.status, undefined) }),
  });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 3000));
    const readback = await getVideo(config, stateItem.youtubeVideoId);
    if (readback.status?.privacyStatus === "private" && !readback.status?.publishAt) {
      stateItem.finalStatus = "PRIVATE_TEST_VERIFIED";
      stateItem.schedulingProbe = { ...(stateItem.schedulingProbe || {}), revertedToPrivate: true, revertedAt: new Date().toISOString() };
      await saveState(config, state);
      console.log(JSON.stringify({ shortId, privacyStatus: "private", publishAt: null, unscheduled: true }, null, 2));
      return;
    }
  }
  fail("Could not confirm removal of publishAt while preserving private status.");
}

async function scheduleProbe(config, shortId, publishAt, revertPrivate) {
  if (!publishAt || Number.isNaN(Date.parse(publishAt))) fail("--publish-at must be a future RFC 3339 timestamp with offset or Z.");
  if (Date.parse(publishAt) < Date.now() + 24 * 60 * 60 * 1000) fail("Schedule probe must be at least 24 hours in the future.");
  await getAuthenticatedChannel(config);
  const batch = await loadBatch(config);
  const item = getItem(batch, shortId);
  const state = await loadState(config);
  const stateItem = state.items[shortId];
  if (stateItem?.finalStatus !== "PRIVATE_TEST_VERIFIED") fail("Schedule probe requires a successfully processed and verified private test upload.");
  const before = await getVideo(config, stateItem.youtubeVideoId);
  const scheduled = await api(config, "https://www.googleapis.com/youtube/v3/videos?part=status", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: stateItem.youtubeVideoId, status: writableStatus(before.status, publishAt) }),
  });
  const scheduledReadback = await getVideo(config, stateItem.youtubeVideoId);
  const scheduledResult = verifyVideo(scheduledReadback, item, config, "private", publishAt);
  stateItem.schedulingProbe = {
    requestedPublishAt: publishAt,
    verifiedAt: new Date().toISOString(),
    verified: scheduledResult.verified,
    issues: scheduledResult.issues,
    revertedToPrivate: false,
  };
  await saveState(config, state);
  if (!scheduledResult.verified) fail(`Scheduling verification failed: ${scheduledResult.issues.join("; ")}`);
  if (revertPrivate) {
    const reverted = await api(config, "https://www.googleapis.com/youtube/v3/videos?part=status", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: stateItem.youtubeVideoId, status: writableStatus(scheduled.status, null) }),
    });
    const finalReadback = await getVideo(config, stateItem.youtubeVideoId);
    if (finalReadback.status?.privacyStatus !== "private" || finalReadback.status?.publishAt) {
      fail("Schedule probe was verified, but automatic reversion to unscheduled private state could not be confirmed.");
    }
    stateItem.schedulingProbe.revertedToPrivate = true;
    stateItem.schedulingProbe.revertedAt = new Date().toISOString();
    stateItem.finalStatus = "PRIVATE_TEST_VERIFIED";
    await saveState(config, state);
  }
  console.log(JSON.stringify({ shortId, scheduleVerified: true, publishAt, revertedToPrivate: Boolean(revertPrivate) }, null, 2));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const config = await loadConfig();
  const arg = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : null;
  };
  if (command === "auth") return authenticate(config);
  if (command === "channel") return console.log(JSON.stringify(await recordChannel(config), null, 2));
  if (command === "prepare") return prepare(config);
  if (command === "upload-private") return uploadPrivate(config, arg("--short-id"));
  if (command === "verify") return verify(config, arg("--short-id"));
  if (command === "write-probe") return writeProbe(config, arg("--short-id"));
  if (command === "unschedule-private") return unschedulePrivate(config, arg("--short-id"));
  if (command === "schedule-probe") return scheduleProbe(config, arg("--short-id"), arg("--publish-at"), args.includes("--revert-private"));
  fail("Commands: auth | channel | prepare | upload-private --short-id ID | verify --short-id ID | write-probe --short-id ID | unschedule-private --short-id ID | schedule-probe --short-id ID --publish-at RFC3339 --revert-private");
}

main().catch((error) => {
  console.error(`ERROR: ${safeError(error)}`);
  process.exitCode = error.exitCode || 1;
});

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJson, writeJson, withPipelineLock, recordException } from './pipeline-store.mjs';
import { openTracker, readTracker, backupTracker, saveTracker, updateTrackerRows, appendTrackerRows, ensureTrackerHeaders } from './tracker-service.mjs';

const clean = value => String(value ?? '').trim();
function savedValueMatches(key, actual, expected) {
  if (typeof actual === 'number' && ['scheduled_date','intake_at','verification_timestamp'].includes(key) && /^\d{4}-\d{2}-\d{2}/.test(String(expected))) return Math.abs(Date.UTC(1899,11,30) + actual * 86400000 - Date.parse(expected)) < 2;
  if (typeof actual === 'number' && key === 'scheduled_time' && /^\d{2}:\d{2}$/.test(String(expected))) return Math.round(actual * 1440) === Number(expected.slice(0,2))*60 + Number(expected.slice(3));
  return String(actual ?? '') === String(expected ?? '');
}
export const isIntake = row => /^INTAKE-/.test(clean(row.batch_id));
export const metadataMissing = row => ['public_title','description','youtube_tags','category'].filter(key => !clean(row[key]));
export const editableDraft = row => isIntake(row) && ['AWAITING_METADATA','BATCH_READY','PRIVATE_UPLOADED'].includes(clean(row.status).toUpperCase()) && !/DUPLICATE|UNRESOLVED/i.test(clean(row.duplicate_disposition));
export async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fsSync.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex').toUpperCase();
}
export function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}
async function mediaFiles(directory, excludedDirectory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink() || path.relative(excludedDirectory, file) === '') continue;
    if (entry.isDirectory()) files.push(...await mediaFiles(file, excludedDirectory));
    else if (entry.isFile() && /\.mp4$/i.test(entry.name)) files.push(file);
  }
  return files.sort();
}
export async function trackerRepository(trackerPath) {
  return {
    read: () => readTracker(trackerPath),
    async commit({ additions = [], updates = [], transactionId = crypto.randomUUID() }) {
      const tracker = await openTracker(trackerPath);
      // The production tracker is the only authority; no JSON queue replaces it.
      await backupTracker(trackerPath, 'intake-' + transactionId);
      ensureTrackerHeaders(tracker, ['batch_id','original_path','original_filename','current_path','current_filename','metadata_state','intake_at','verification_state','verification_timestamp','content_type','schedule_policy']);
      appendTrackerRows(tracker, additions);
      await updateTrackerRows(tracker, updates);
      await saveTracker(tracker);
      const saved = await readTracker(trackerPath);
      for (const change of [...additions, ...updates]) {
        const matches = saved.filter(row => row.short_id === change.short_id);
        if(matches.length !== 1 || Object.entries(change).some(([key,value]) => key in tracker.index && !savedValueMatches(key,matches[0][key],value))) throw Error('TRACKER_READBACK_FAILED:' + change.short_id);
      }
    }
  };
}
export async function validateDraftFolders(draftFolder,hashedFolder) {
    const draftRoot = await fs.realpath(draftFolder);
    // A nested staging folder is safe when the scanner excludes its entire subtree.
    const parent = await fs.realpath(path.dirname(hashedFolder));
    const hashRoot = path.join(parent, path.basename(hashedFolder));
    if (path.relative(draftRoot, hashRoot) === '' || inside(hashRoot, draftRoot)) throw Error('DRAFT_AND_HASH_FOLDERS_MUST_BE_SEPARATE');
    try { if ((await fs.lstat(hashRoot)).isSymbolicLink() || await fs.realpath(hashRoot) !== hashRoot) throw Error('HASH_FOLDER_MUST_NOT_BE_A_LINK'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return {draftRoot,hashRoot};
}
export async function scanDrafts({ draftFolder, hashedFolder, outputDir, repository, dryRun = true, now = Date.now(), stableMs = 10000 }) {
  const scan = async () => {
    const {draftRoot,hashRoot}=await validateDraftFolders(draftFolder,hashedFolder);
    const rows = await repository.read(), known = new Set(rows.map(row => clean(row.file_hash).toUpperCase()));
    const shortIds = new Set(rows.map(row => clean(row.short_id)));
    const batchId = 'INTAKE-' + new Date(now).toISOString().replace(/[-:.TZ]/g,'') + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const result = { dryRun, batchId, added: [], skipped: [], waiting: [], exceptions: [] };
    for (const source of await mediaFiles(draftRoot, hashRoot)) {
      try {
        const resolved = await fs.realpath(source);
        if (!inside(draftRoot, resolved) || (await fs.lstat(source)).isSymbolicLink()) throw Error('SOURCE_OUTSIDE_DRAFT_FOLDER');
        const before = await fs.stat(source);
        if (!before.size || now - before.mtimeMs < stableMs) { result.waiting.push({ file: source, reason: 'FILE_STILL_COPYING' }); continue; }
        const hash = await hashFile(source), after = await fs.stat(source);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) { result.waiting.push({ file: source, reason: 'FILE_CHANGED_DURING_HASH' }); continue; }
        if (known.has(hash)) { result.skipped.push({ file: source, hash, reason: 'HASH_ALREADY_TRACKED' }); continue; }
        const shortId = 'RS-' + hash.slice(0,12);
        if (shortIds.has(shortId)) throw Error('SHORT_ID_COLLISION');
        const destination = path.join(hashRoot, hash + '.mp4');
        if (!inside(hashRoot, destination)) throw Error('DESTINATION_OUTSIDE_HASH_FOLDER');
        const row = { short_id: shortId, file_name: path.basename(source), file_path: source, file_hash: hash, original_path: source, original_filename: path.basename(source), current_path: destination, current_filename: path.basename(destination), batch_id: batchId, status: 'AWAITING_METADATA', metadata_state: 'AWAITING_METADATA', timezone: 'Asia/Manila', schedule_eligible: 'YES', intake_at: new Date(now).toISOString(), public_title: '', description: '', youtube_tags: '', category: '', related_video_id: '', youtube_video_id: '', scheduled_date: '', scheduled_time: '' };
        if (!dryRun) {
          await fs.mkdir(hashRoot, { recursive: true });
          const journalPath = path.join(outputDir, 'intake-journals', hash + '.json');
          const prior = await readJson(journalPath, null);
          const journal = { source, destination, hash, row, state: 'PREPARED' };
          let existing = false;
          try { await fs.lstat(destination); existing = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
          if (existing) {
            if (!prior || prior.source !== source || prior.destination !== destination || prior.hash !== hash || (await fs.lstat(destination)).isSymbolicLink() || await hashFile(destination) !== hash) throw Error('HASH_DESTINATION_COLLISION');
          } else {
            await writeJson(journalPath, journal);
            await fs.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
          }
          if (await hashFile(destination) !== hash || await hashFile(source) !== hash) throw Error('INTAKE_HASH_VERIFICATION_FAILED');
          journal.state = 'COPIED_VERIFIED'; await writeJson(journalPath, journal);
          await repository.commit({ additions: [row] });
          journal.state = 'TRACKED'; await writeJson(journalPath, journal);
          // Originals stay in Drafts. Only the verified staging copy is used downstream.
          journal.state = 'COMPLETE'; await writeJson(journalPath, journal);
        }
        known.add(hash); shortIds.add(shortId); result.added.push(row);
      } catch (error) {
        const entry = { code: 'DRAFT_INTAKE_FAILED', file: source, message: error.message };
        result.exceptions.push(entry);
        if (!dryRun) { await recordException(outputDir, entry); break; }
      }
    }
    return result;
  };
  return dryRun ? scan() : withPipelineLock(outputDir, scan);
}
export async function saveDraftMetadata({ repository, shortId, metadata }) {
  const rows = await repository.read(), matches = rows.filter(row => row.short_id === shortId);
  if (matches.length !== 1 || !editableDraft(matches[0])) throw Error('DRAFT_NOT_EDITABLE');
  const allowed = ['content_type','public_title','description','youtube_tags','category','source_song','artist_or_fandom','related_video_id'];
  const fields = Object.fromEntries(allowed.filter(key => key in metadata).map(key => [key, String(metadata[key] ?? '')]));
  if (fields.content_type && !['COVER','ORIGINAL'].includes(fields.content_type)) throw Error('INVALID_CONTENT_TYPE');
  if ((fields.public_title || '').length > 100 || (fields.description || '').length > 5000) throw Error('METADATA_TOO_LONG');
  if (fields.related_video_id && !/^[A-Za-z0-9_-]{11}$/.test(fields.related_video_id)) throw Error('INVALID_RELATED_VIDEO_ID');
  const row = { ...matches[0], ...fields }, missing = metadataMissing(row);
  const update = { short_id: shortId, ...fields, metadata_state: missing.length ? 'AWAITING_METADATA' : 'METADATA_READY', status: row.youtube_video_id ? 'PRIVATE_UPLOADED' : missing.length ? 'AWAITING_METADATA' : 'BATCH_READY' };
  if (matches[0].schedule_policy === 'four-per-week' && fields.source_song !== undefined && fields.source_song !== matches[0].source_song) Object.assign(update, { scheduled_date: '', scheduled_time: '', posting_slot: '', schedule_order: '', schedule_policy: '' });
  await repository.commit({ updates: [update] });
  return { ...row, ...update };
}
export async function exportRelatedVideoActions({ rows, outputDir }) {
  const quote = value => '"' + String(value ?? '').replaceAll('"','""') + '"';
  const lines = [['short_id','youtube_video_id','related_video_id','action'], ...rows.filter(row => clean(row.related_video_id)).map(row => [row.short_id,row.youtube_video_id,row.related_video_id,'MANUAL STUDIO STEP'])];
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'RELATED_VIDEO_MANUAL.csv'), lines.map(row => row.map(quote).join(',')).join('\r\n') + '\r\n');
}

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}
export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(value, null, 2));
  await fs.rename(temporary, file);
}
// Remote workflows retain crashed-writer locks. Local metadata edits may explicitly recover a dead owner.
export async function recoverAbandonedPipelineLock(directory) {
  const file = path.join(directory, 'draft-pipeline.lock'), guard = file + '.recovery';
  let handle;
  try { handle = await fs.open(guard, 'wx'); }
  catch (error) { if(error.code === 'EEXIST') throw Error('DRAFT_PIPELINE_BUSY_OR_RECOVERY_REQUIRED'); throw error; }
  try {
    let raw; try { raw = await fs.readFile(file, 'utf8'); } catch(error) { if(error.code === 'ENOENT') return; throw error; }
    let owner; try { owner = JSON.parse(raw); } catch { throw Error('DRAFT_PIPELINE_LOCK_OWNER_UNKNOWN'); }
    if(!Number.isInteger(owner.pid) || owner.pid <= 0) throw Error('DRAFT_PIPELINE_LOCK_OWNER_UNKNOWN');
    try { process.kill(owner.pid, 0); throw Error('DRAFT_PIPELINE_BUSY_OR_RECOVERY_REQUIRED'); }
    catch(error) { if(error.code !== 'ESRCH') throw error; }
    if(await fs.readFile(file, 'utf8') !== raw) throw Error('DRAFT_PIPELINE_BUSY_OR_RECOVERY_REQUIRED');
    await fs.rename(file, file + '.abandoned-' + crypto.randomUUID() + '.json');
  } finally { await handle.close(); await fs.unlink(guard); }
}
export async function withPipelineLock(directory, action, { recoverAbandoned = false } = {}) {
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, 'draft-pipeline.lock');
  let handle;
  try { handle = await fs.open(file, 'wx'); }
  catch (error) {
    if(error.code !== 'EEXIST') throw error;
    if(!recoverAbandoned) throw Error('DRAFT_PIPELINE_BUSY_OR_RECOVERY_REQUIRED');
    await recoverAbandonedPipelineLock(directory);
    try { handle = await fs.open(file, 'wx'); } catch(error) { if(error.code === 'EEXIST') throw Error('DRAFT_PIPELINE_BUSY_OR_RECOVERY_REQUIRED'); throw error; }
  }
  try { await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); return await action(); }
  finally { await handle.close(); await fs.unlink(file); }
}
export async function recordException(directory, entry) {
  const file = path.join(directory, 'exceptions.json'), existing = await readJson(file, []);
  const rows = Array.isArray(existing) ? existing : existing.exceptions;
  if (!Array.isArray(rows)) throw Error('EXCEPTIONS_FORMAT_UNSUPPORTED');
  const key = JSON.stringify([entry.code, entry.file, entry.shortId, entry.batchId]);
  if (!rows.some(row => row.pipelineKey === key && !row.resolved)) rows.push({ timestamp: new Date().toISOString(), ...entry, pipelineKey: key });
  await writeJson(file, Array.isArray(existing) ? rows : { ...existing, exceptions: rows });
}

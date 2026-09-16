import fs from 'node:fs/promises';
import path from 'node:path';
import { trackerRepository } from '../core/draft-intake.mjs';
import { excelDate } from '../core/existing-batch-service.mjs';
import { withPipelineLock, writeJson } from '../core/pipeline-store.mjs';
export function retirementUpdates(rows, afterDate, timestamp) {
  return rows.filter(row => String(row.status).toUpperCase() === 'SCHEDULED' && excelDate(row.scheduled_date) > afterDate && !/DUPLICATE|UNRESOLVED/i.test(row.duplicate_disposition || '')).map(row => ({
    short_id: row.short_id, status: 'RETIRED', schedule_eligible: 'NO',
    verification_state: 'USER_CONFIRMED_DELETED', verification_timestamp: timestamp,
    notes: [row.notes, 'User confirmed future scheduled uploads deleted; retired on ' + timestamp + '. Preserve media identity and YouTube ID; do not reupload.'].filter(Boolean).join('\n')
  }));
}
if (process.argv.includes('--apply-user-confirmed')) {
  const afterDate = process.argv.find(arg => arg.startsWith('--after='))?.slice(8);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(afterDate || '')) throw Error('EXPLICIT_AFTER_DATE_REQUIRED');
  const outputDir = path.resolve('outputs/ralskies-content-engine');
  await withPipelineLock(outputDir, async () => {
    const repo = await trackerRepository(path.join(outputDir, 'Ralskies_Upload_Tracker.xlsx'));
    const rows = await repo.read(), updates = retirementUpdates(rows, afterDate, new Date().toISOString());
    const report = { afterDate, basis: 'User confirmation; no remote writes or inferred API deletion', updates, previous: rows.filter(row => updates.some(update => update.short_id === row.short_id)) };
    await writeJson(path.join(outputDir, 'retired-schedules-' + afterDate + '.json'), report);
    if (updates.length) await repo.commit({ updates });
    console.log(JSON.stringify({ retired: updates.length, afterDate }));
  });
}

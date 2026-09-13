import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_TOOL = process.env.RALSKIES_ARTIFACT_TOOL_PATH || path.resolve(import.meta.dirname, "../outputs/ralskies-content-engine/work/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs");
async function artifactTool() { try { return await import("@oai/artifact-tool"); } catch { return await import(pathToFileURL(DEFAULT_TOOL).href); } }
export const TRACKER_HEADERS = ["short_id","file_name","file_path","file_hash","source_song","artist_or_fandom","category","public_title","description","hashtags","youtube_tags","related_video_id","status","scheduled_date","scheduled_time","timezone","youtube_video_id","posting_slot","schedule_order","duplicate_disposition","schedule_eligible","notes","duplicate_risk","title_hook_family"];
export async function openTracker(trackerPath) {
  const { FileBlob, SpreadsheetFile } = await artifactTool(); const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(trackerPath)); const queue = workbook.worksheets.getItem("Queue");
  if (!queue) throw new Error("Authoritative tracker is missing the Queue sheet."); const values = queue.getUsedRange().values || []; if (!values.length) throw new Error("Authoritative tracker Queue sheet is empty.");
  const headers = values[0].map((value) => String(value ?? "").trim()); for (const header of TRACKER_HEADERS) if (!headers.includes(header)) throw new Error(`Tracker Queue is missing required column: ${header}`);
  const index = Object.fromEntries(headers.map((header, column) => [header, column])); const records = values.slice(1).map((row, offset) => ({ rowNumber: offset + 2, values: row, data: Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ""])) }));
  return { workbook, queue, headers, index, records, trackerPath };
}
export async function readTracker(trackerPath) { const tracker = await openTracker(trackerPath); return tracker.records.map(({ rowNumber, data }) => ({ rowNumber, ...data })); }
export async function backupTracker(trackerPath, transactionId) { const backupPath = `${trackerPath}.backup-${transactionId}.xlsx`; await fs.copyFile(trackerPath, backupPath, fs.constants.COPYFILE_EXCL); return backupPath; }
export async function updateTrackerRows(tracker, updates) { for (const update of updates) { const record = tracker.records.find((candidate) => String(candidate.data.short_id) === String(update.short_id)); if (!record) throw new Error(`Tracker row not found for ${update.short_id}.`); for (const [header, value] of Object.entries(update)) { if (header === "short_id" || !(header in tracker.index)) continue; tracker.queue.getCell(record.rowNumber - 1, tracker.index[header]).values = [[value]]; } } }
export function ensureTrackerHeaders(tracker, headers) {
  for (const header of headers) {
    if (header in tracker.index) continue;
    const column = tracker.headers.length;
    if(column) tracker.queue.getCell(0, column).copyFrom(tracker.queue.getCell(0, column - 1), 'all');
    tracker.queue.getCell(0, column).values = [[header]];
    tracker.headers.push(header); tracker.index[header] = column;
  }
}
export function appendTrackerRows(tracker, additions) {
  for (const data of additions) {
    if (tracker.records.some(record => String(record.data.short_id) === String(data.short_id) || String(record.data.file_hash).toUpperCase() === String(data.file_hash).toUpperCase())) throw Error('INTAKE_IDENTITY_ALREADY_TRACKED');
    const rowNumber = Math.max(1, ...tracker.records.map(record => record.rowNumber)) + 1;
    const values = tracker.headers.map(header => data[header] ?? '');
    const table = tracker.queue.tables.items.find(item => item.name === 'QueueTable');
    if(table) table.rows.add(null, [values.slice(0, table.getHeaderRowRange().values[0].length)]);
    tracker.queue.getRangeByIndexes(rowNumber - 1, 0, 1, values.length).values = [values];
    tracker.records.push({ rowNumber, values, data });
  }
}
export async function saveTracker(tracker) { const { SpreadsheetFile } = await artifactTool(); const output = await SpreadsheetFile.exportXlsx(tracker.workbook); const temporary = `${tracker.trackerPath}.${process.pid}-${Date.now()}.tmp.xlsx`; await output.save(temporary); await fs.rename(temporary, tracker.trackerPath); }

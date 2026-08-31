import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "../../outputs/ralskies-content-engine/work/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const root = path.resolve(import.meta.dirname);
const production = path.resolve(root, "../../outputs/ralskies-content-engine/Ralskies_Upload_Tracker.xlsx");
const output = path.join(root, "TEST_TRACKER.xlsx");
const preview = path.join(root, "tracker-before.png");
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(production));
const queue = workbook.worksheets.getItem("Queue");
const before = await workbook.render({ sheetName: "Queue", range: "A1:AZ12", scale: 1, format: "png" });
await fs.writeFile(preview, new Uint8Array(await before.arrayBuffer()));
const values = queue.getUsedRange().values;
const headers = values[0].map((value) => String(value ?? "").trim());
const index = Object.fromEntries(headers.map((header, column) => [header, column]));
const fixture = [
  { id: "RS-522FC2B09FE2", file: "source-one.mp4", date: "2026-12-01", time: "17:30" },
  { id: "RS-0AA3EEF2F234", file: "source-two.mp4", date: "2026-12-02", time: "22:30" },
];
for (const item of fixture) {
  const rowIndex = values.findIndex((row) => String(row[index.short_id] ?? "") === item.id);
  if (rowIndex < 1) throw new Error(`Fixture source row not found: ${item.id}`);
  const set = (header, value) => { if (header in index) queue.getCell(rowIndex, index[header]).values = [[value]]; };
  set("file_name", item.file); set("file_path", path.join(root, "TEST_SOURCE", item.file)); set("status", "APPROVED"); set("schedule_eligible", "YES"); set("duplicate_disposition", "CLEARED BY FIXTURE TEST"); set("youtube_video_id", ""); set("scheduled_date", item.date); set("scheduled_time", item.time); set("posting_slot", item.time === "17:30" ? "Slot A" : "Slot B"); set("batch_id", ""); set("original_filename", ""); set("original_path", ""); set("current_filename", ""); set("current_path", "");
}
const exported = await SpreadsheetFile.exportXlsx(workbook);
await exported.save(output);
console.log(JSON.stringify({ output, preview, rows: fixture.map((x) => x.id) }, null, 2));

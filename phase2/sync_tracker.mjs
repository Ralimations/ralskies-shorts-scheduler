import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "outputs", "ralskies-content-engine");
const PHASE1_PATH = path.join(OUTPUT_DIR, "Ralskies_Upload_Tracker_Phase1_Clip_Audit.xlsx");
const PHASE2_PATH = path.join(OUTPUT_DIR, "Ralskies_Upload_Tracker_Phase2.xlsx");
const MASTER_PATH = path.join(OUTPUT_DIR, "Ralskies_Upload_Tracker.xlsx");
const STATE_PATH = path.join(OUTPUT_DIR, "phase2_upload_state.json");

const state = JSON.parse(await fs.readFile(STATE_PATH, "utf8"));
// Rebuild from the approved Phase 1 audit plus the append-only Phase 2 state.
// This avoids stale formatting or duplicate notes across repeated synchronization.
const inputPath = MASTER_PATH;
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const sheets = workbook.worksheets.items;

function getOrAddSheet(name) {
  const existing = sheets.find((sheet) => sheet.name === name);
  if (existing) {
    existing.getUsedRange()?.clear({ applyTo: "all" });
    existing.deleteAllDrawings();
    return existing;
  }
  return workbook.worksheets.add(name);
}

const navy = "#14243C";
const cyan = "#43B8DE";
const pale = "#D9F1FA";
const amber = "#F7E8B2";
const green = "#DDF2E3";
const red = "#F7D9D9";
const gray = "#E8EDF3";
const white = "#FFFFFF";

function styleTitle(sheet, range, title) {
  range.merge();
  range.values = [[title]];
  range.format = { fill: navy, font: { bold: true, color: white, fontSize: 18 }, rowHeight: 34, verticalAlignment: "center" };
}

function styleHeader(range) {
  range.format = { fill: navy, font: { bold: true, color: white }, wrapText: true, verticalAlignment: "center" };
  range.format.rowHeight = 30;
}

const control = getOrAddSheet("Phase 2 Control");
control.showGridLines = false;
styleTitle(control, control.getRange("A1:H1"), "Phase 2 — YouTube API Safety Test");
control.getRange("A3:B10").values = [
  ["Control", "Current value"],
  ["Mode", "PRIVATE TEST ONLY"],
  ["OAuth/API status", state.oauthStatus || "AWAITING_OAUTH_CLIENT"],
  ["Expected channel", "Ralskies"],
  ["Expected channel ID", state.expectedChannelId || "UCIt8eA8uvrDVbpta0pgIc5Q"],
  ["Authenticated channel", state.authenticatedChannel?.channelTitle || state.authenticatedChannelMismatch?.returnedChannelTitle || "Not authenticated"],
  ["Authenticated channel ID", state.authenticatedChannel?.channelId || state.authenticatedChannelMismatch?.returnedChannelId || "Not authenticated"],
  ["Bulk scheduling", "BLOCKED — PHASE 2 TEST ONLY"],
];
styleHeader(control.getRange("A3:B3"));
control.getRange("A4:A10").format = { fill: gray, font: { bold: true } };
control.getRange("B4:B10").format.wrapText = true;
control.getRange("B4:B10").conditionalFormats.add("containsText", { text: "BLOCKED", format: { fill: red, font: { bold: true, color: "#8B1E1E" } } });

const itemHeaders = ["Short ID", "Local path", "SHA-256", "Public title", "Final state", "YouTube video ID", "Processing", "Verification"];
const itemRows = Object.values(state.items || {}).map((item) => [
  item.shortId,
  item.localPath,
  item.sha256,
  item.title,
  item.finalStatus || "READY_FOR_PRIVATE_TEST",
  item.youtubeVideoId || "",
  item.processingState || "NOT STARTED",
  item.verificationState || "NOT STARTED",
]);
control.getRangeByIndexes(12, 0, 1, itemHeaders.length).values = [itemHeaders];
styleHeader(control.getRangeByIndexes(12, 0, 1, itemHeaders.length));
if (itemRows.length) control.getRangeByIndexes(13, 0, itemRows.length, itemHeaders.length).values = itemRows;
control.getRange("A13:H20").format.wrapText = true;
control.getRange("A13:H20").conditionalFormats.add("containsText", { text: "VERIFIED", format: { fill: green } });
control.getRange("A13:H20").conditionalFormats.add("containsText", { text: "FAILED", format: { fill: red } });
control.getRange("A13:H20").conditionalFormats.add("containsText", { text: "AWAITING", format: { fill: amber } });
control.freezePanes.freezeRows(3);
control.getRange("A:H").format.font = { name: "Carlito", fontSize: 10 };
control.getRange("A:A").format.columnWidth = 20;
control.getRange("B:B").format.columnWidth = 48;
control.getRange("C:C").format.columnWidth = 68;
control.getRange("D:D").format.columnWidth = 62;
control.getRange("E:H").format.columnWidth = 24;

const attemptsSheet = getOrAddSheet("API Attempts");
attemptsSheet.showGridLines = false;
styleTitle(attemptsSheet, attemptsSheet.getRange("A1:Q1"), "YouTube API Upload Attempts");
const attemptHeaders = [
  "Attempt ID", "Short ID", "Local path", "SHA-256", "Public title", "Description", "Hashtags", "Backend tags",
  "Scheduled time", "Upload attempt time", "YouTube video ID", "Processing state", "Verification state",
  "Failure message", "Final status", "Channel ID", "Related video",
];
attemptsSheet.getRangeByIndexes(2, 0, 1, attemptHeaders.length).values = [attemptHeaders];
styleHeader(attemptsSheet.getRangeByIndexes(2, 0, 1, attemptHeaders.length));
const attemptRows = (state.attempts || []).map((attempt) => {
  const item = state.items?.[attempt.shortId] || {};
  return [
    attempt.attemptId || "", attempt.shortId || "", item.localPath || "", attempt.sha256 || item.sha256 || "",
    item.title || "", item.description || "", (item.hashtags || []).join(" "), (item.tags || []).join(", "),
    item.schedulingProbe?.requestedPublishAt || "", attempt.attemptTime || "", attempt.youtubeVideoId || item.youtubeVideoId || "",
    item.processingState || "", item.verificationState || "", attempt.failureMessage || item.failureMessage || "",
    attempt.finalStatus || item.finalStatus || "", attempt.channelId || "", item.relatedVideoId ? `${item.relatedVideoId} — MANUAL STUDIO STEP` : "",
  ];
});
if (attemptRows.length) {
  attemptsSheet.getRangeByIndexes(3, 0, attemptRows.length, attemptHeaders.length).values = attemptRows;
} else {
  attemptsSheet.getRange("A4:Q4").merge();
  attemptsSheet.getRange("A4:Q4").values = [["No API upload attempts have been made."]];
  attemptsSheet.getRange("A4:Q4").format = { fill: amber, font: { italic: true }, horizontalAlignment: "center" };
}
attemptsSheet.freezePanes.freezeRows(3);
attemptsSheet.getRange(`A1:Q${Math.max(4, attemptRows.length + 3)}`).format.font = { name: "Carlito", fontSize: 9 };
attemptsSheet.getRange("A:A").format.columnWidth = 38;
attemptsSheet.getRange("B:B").format.columnWidth = 20;
attemptsSheet.getRange("C:C").format.columnWidth = 48;
attemptsSheet.getRange("D:D").format.columnWidth = 68;
attemptsSheet.getRange("E:H").format.columnWidth = 48;
attemptsSheet.getRange("I:Q").format.columnWidth = 24;
attemptsSheet.getRange(`A3:Q${Math.max(4, attemptRows.length + 3)}`).format.wrapText = true;

const queue = sheets.find((sheet) => sheet.name === "Queue");
if (!queue) throw new Error("Queue sheet not found");
const used = queue.getUsedRange();
const values = used.values;
const headers = values[0];
const index = Object.fromEntries(headers.map((header, i) => [header, i]));
for (let row = 1; row < values.length; row += 1) {
  const item = state.items?.[values[row][index.short_id]];
  if (!item?.youtubeVideoId) continue;
  values[row][index.youtube_video_id] = item.youtubeVideoId;
  values[row][index.status] = "REVIEW";
  values[row][index.schedule_eligible] = "NO";
  const phase2Note = `Phase 2 private test: ${item.finalStatus}; existing video ID must be scheduled/updated, never re-uploaded. Related video: MANUAL STUDIO STEP.`;
  values[row][index.notes] = values[row][index.notes] ? `${values[row][index.notes]} ${phase2Note}` : phase2Note;
}
used.values = values;

const controlInspect = await workbook.inspect({ kind: "table", sheetId: "Phase 2 Control", range: "A1:H18", include: "values,formulas", maxChars: 5000 });
console.log(controlInspect.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "Phase 2 tracker formula scan" });
console.log(errors.ndjson);

await fs.mkdir(OUTPUT_DIR, { recursive: true });
const previewControl = await workbook.render({ sheetName: "Phase 2 Control", autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(path.join(OUTPUT_DIR, "Phase2_Control_preview.png"), new Uint8Array(await previewControl.arrayBuffer()));
const previewAttempts = await workbook.render({ sheetName: "API Attempts", autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(path.join(OUTPUT_DIR, "API_Attempts_preview.png"), new Uint8Array(await previewAttempts.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(MASTER_PATH);
console.log(JSON.stringify({ output: MASTER_PATH, items: itemRows.length, attempts: attemptRows.length }));

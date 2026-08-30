# Ralskies Content Engine CLI

Routine work is deterministic and local; Codex/LLM is not required. The source of truth is `Ralskies_Upload_Tracker.xlsx` (export it to CSV, or set `RALSKIES_TRACKER` to a CSV export until the spreadsheet adapter is enabled).

Commands:

```text
node ralskies.mjs scan
node ralskies.mjs prepare --dry-run
node ralskies.mjs prepare
node ralskies.mjs upload
node ralskies.mjs verify
node ralskies.mjs report
```

`scan` hashes MP4s and writes `outputs/ralskies-content-engine/exceptions.json`. `prepare` selects APPROVED/UPLOAD_READY rows, assigns 17:30 and 22:30 PHT slots, and never uses the protected 20:00–21:00 window. Upload/verify are intentionally gated until OAuth is linked and the queue is approved; no upload occurs during implementation.

See `AGENTS.md` for permanent operating rules.

## Desktop application (Phase A)

The new local desktop control layer lives in `desktop/` and keeps the CLI as the shared deterministic backend. Phase A is read-only/dry-run: it indexes local MP4s, reads the tracker inspection snapshot, and displays inventory, channel/API state, and persisted draft calendar data. It never uploads, publishes, schedules, renames, moves, or edits production media.

Install the desktop dependency once, then launch:

```text
npm install
npm start
```

The renderer receives data only through the isolated preload bridge; OAuth credentials and tokens remain in `phase2/secrets` and are never exposed to the UI.

# Phase A desktop architecture

`desktop/main.cjs` is the Electron main process and local service boundary. It owns filesystem scanning, SHA-256 calculation, tracker-inspection/state reads, folder selection, and persisted desktop settings. `desktop/preload.cjs` exposes a small allow-listed IPC API with context isolation enabled. `desktop/renderer/` contains the dashboard UI and navigation; it does not access Node, credentials, or construct shell commands.

The CLI (`ralskies.mjs`) and Phase 2 YouTube client remain intact and are not reimplemented in the renderer. Phase A is intentionally read-only: the dry-run bridge reports intended actions without modifying media, tracker data, or YouTube.

Implemented screens/control surfaces: Dashboard, Videos, Calendar (persisted generated queue view), Upload Queue, Batches, YouTube, Analytics, Duplicates/Review, Settings, and Logs navigation. Dashboard and Video Library are data-backed; the remaining pages are safe scaffolds for later phases.

Storage: existing XLSX tracker and inspection snapshot remain authoritative. Desktop preferences are stored separately at `outputs/ralskies-content-engine/desktop_settings.json`; no OAuth material is stored there. SQLite is deferred until a later phase so the workbook is not silently replaced.

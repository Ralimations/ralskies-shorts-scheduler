# Ralskies automation rules

- Never call an LLM for hashing, matching, scheduling, metadata copying, retries, or status updates.
- Never upload during development or dry runs.
- Use the tracker as source of truth; preserve `DUPLICATE` and unresolved rows.
- Baseline automated slots are 17:30 and 22:30 Asia/Manila; 20:00–21:00 is permanently manual-protected; 01:30 is optional.
- Uploads must use official YouTube Data API OAuth, resumable transfer, private-first verification, and idempotent retry state.
- Related-video IDs remain in the tracker and are emitted to `RELATED_VIDEO_MANUAL.csv` when API support is unavailable.
- Investigate only entries written to `exceptions.json`/`exceptions.csv`.

# Ralskies automation rules

- Never call an LLM for hashing, matching, scheduling, metadata copying, retries, or status updates.
- Never upload during development or dry runs.
- Use the tracker as source of truth; preserve `DUPLICATE` and unresolved rows.
- Current user-approved automated schedule: four posts per week at 20:00 Asia/Manila, at most one per day. The explicit 20:00 permission supersedes the old protected-window rule for that exact time; 20:01–21:00 remains manual-protected. Leave 22:00 available for recent/latest covers; do not automatically add a second post. 01:30 remains optional.
- Uploads must use official YouTube Data API OAuth, resumable transfer, private-first verification, and idempotent retry state.
- Related-video IDs remain in the tracker and are emitted to `RELATED_VIDEO_MANUAL.csv` when API support is unavailable.
- Investigate only entries written to `exceptions.json`/`exceptions.csv`.

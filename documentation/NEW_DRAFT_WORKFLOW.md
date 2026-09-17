# New draft workflow

Restart the desktop app after this update.

1. Put finished MP4 files in G:\RS_DRAFTS. Change this folder in Settings if needed. Use Intake Now or enable Watch Folder while the app is open.
2. Open Drafts > Validate Release Window. The saved default is 20:00 to 02:00 Asia/Manila, starting tonight, one Short per night, with 30-minute candidate intervals. Early-morning slots are assigned to the following calendar date.
3. Check Calendar & Validate refreshes YouTube observations and skips occupied or past slots. The 20:00-21:00 manual window remains protected; 01:30 requires its optional checkbox.
4. Review the proposed dates and choose Greenlight Schedule & Save Reservations. This writes local reservations only. Existing schedules and already-reserved drafts stay unchanged.
5. Generate Metadata is available after a future reservation exists. Enter the song, artist and clip facts. Review the LLM suggestions and approve the missing metadata.
6. Use Upload / Schedule to open the existing private upload and final metadata/schedule review. Publishing remains a separate user action, with verification and recovery safeguards.

## LM Studio

Configured server: http://127.0.0.1:1234/v1
Configured model: prism-ml/bonsai-27b
Configured mode: LM Studio native, reasoning off, 300-second timeout.

The older OpenAI-compatible structured generation request timed out. Native generation was tested successfully with synthetic facts and produced three validated suggestions. Both modes remain selectable in LM Studio Connection. Native mode requires a model supporting reasoning off. All suggestions require human review; the LLM does not hash, match, choose dates, upload, or update workflow statuses.

## Weekly analytics

Open Weekly Analytics from Drafts or Settings. Reports are on-demand, covering seven reporting days with a two-day delay allowance. Snapshots and reviews are saved under outputs/ralskies-content-engine/analytics-history.

The current Google token does not include Analytics consent. From the desktop folder, run:

    node phase2/youtube_phase2.mjs auth

Grant read-only YouTube Analytics access. If Google says the API is disabled, enable YouTube Analytics API in the same Cloud project. Then choose Sync Weekly Analytics. Ask LLM to Review Titles / Topics produces suggestions only; it does not change existing metadata.

Reports include tracked, published videos; title/topic metrics reflect views earned during the reporting period. Release-time comparisons are exploratory, affected by video age, topic and sample size. They are not first-week comparisons or proof that an upload time caused performance. The public Analytics API does not expose Studio's audience-online heatmap. No automatic weekly background job is enabled.

References:
- [YouTube Analytics channel reports and OAuth scope](https://developers.google.com/youtube/analytics/channel_reports)
- [LM Studio native chat API](https://lmstudio.ai/docs/developer/rest/chat)


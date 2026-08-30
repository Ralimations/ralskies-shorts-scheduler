# Phase 2 — YouTube API safety test

This integration uses the official YouTube Data API v3 and OAuth 2.0. It is limited to the two cleared candidates in `test_batch.json` and uploads them as private videos only.

## Credential setup

1. In Google Cloud, enable **YouTube Data API v3** for the intended project.
2. Configure the OAuth consent screen.
3. Create an OAuth client of type **Desktop app**.
4. Download the client JSON to `phase2/secrets/client_secret.json`.
5. Copy `config.example.json` to `config.json`.

The `phase2/secrets/` directory, OAuth client JSON, token JSON, and `.env` files are excluded by `.gitignore`.

## Commands

```text
node phase2/youtube_phase2.mjs prepare
node phase2/youtube_phase2.mjs auth
node phase2/youtube_phase2.mjs channel
node phase2/youtube_phase2.mjs upload-private --short-id RS-393176E70BE5
node phase2/youtube_phase2.mjs verify --short-id RS-393176E70BE5
```

The uploader checks the expected channel title and ID before every upload. A resumable session is stored before media transfer; uncertain failures are marked for recovery and never trigger a blind second `videos.insert` call.

The Shorts Related Video field is retained in the tracker as **MANUAL STUDIO STEP** because the supported Data API video resource does not expose that Shorts Studio field.

Future scheduling is tested only after a private upload has processed and verified. The probe uses a far-future RFC 3339 timestamp, verifies `status.publishAt`, and can immediately return the video to an unscheduled private state:

```text
node phase2/youtube_phase2.mjs schedule-probe --short-id RS-393176E70BE5 --publish-at 2027-08-30T17:30:00+08:00 --revert-private
```

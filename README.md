# Ralskies Content Engine

A local-first workflow for preparing, uploading, scheduling, and verifying Ralskies Shorts. The tracker is the source of truth; routine hashing, matching, scheduling, metadata copying, and status updates are deterministic and do not require an LLM.

## Operating rules

- Never upload, publish, schedule, rename, move, or overwrite production media during a dry run.
- Preserve `DUPLICATE`, `BLOCKED`, and unresolved rows. Do not force them through the workflow.
- Keep the 20:01–21:00 Asia/Manila window reserved for manual uploads.
- Use the official YouTube account and confirm the Ralskies channel before every upload.
- A possible remote write is never retried automatically. Reconcile the existing video instead.
- Do not use the automated production Apply button for a manual batch.

## Source of truth

The authoritative tracker is:

`outputs/ralskies-content-engine/Ralskies_Upload_Tracker.xlsx`

Important fields:

- `file_hash`: immutable media identity
- `file_path` / `original_path`: source media location
- `public_title`, `description`, `youtube_tags`, `category`: approved metadata
- `scheduled_date`, `scheduled_time`, `timezone`: publication target
- `youtube_video_id`: the uploaded YouTube relationship
- `related_video_id`: manual Related Video action
- `status`, `verification_state`, `verification_timestamp`: workflow state

Make a local tracker backup before a batch changes state. Never change the hash or original-file fields to make a row fit.

## Standard workflow

### 1. Inspect and reconcile

1. Open the tracker and select one batch.
2. Confirm the date range, row count, eligible count, exclusions, and current statuses.
3. Verify source files exist and their SHA-256 values match `file_hash`.
4. Check for existing YouTube IDs before uploading anything.
5. Treat historical states as valid: `PREPARED`, `STAGED`, `PRIVATE_UPLOADED`, `BATCH_READY`, `SCHEDULED`, and `PUBLISHED`.

Do not restage or re-upload a row that already has a valid YouTube relationship.

### 2. Review titles and metadata

Use the tracker’s approved values exactly. Title Intelligence recommendations are review candidates only; a human must choose and approve any title change. Do not regenerate metadata during upload.

### 3. Stage an untouched batch

For a genuinely fresh batch, use the desktop workflow:

`PREVIEW → explicit approval → APPLY (COPY mode) → VERIFY`

The staging Apply must copy media, preserve originals, create the manifest, back up the tracker, verify hashes, and leave the row in `BATCH_READY` (or the project’s equivalent). Never stage BULK_01 or completed BULK_02 rows again.

### 4. Upload privately

For manual operation, process one row at a time. Match the source file to the tracker using the Short ID and hash, not the song name alone.

1. Sign in to YouTube Studio on the Ralskies channel.
2. Select **Create → Upload videos** and choose the tracker’s source file.
3. Enter `public_title`, `description`, `youtube_tags`, and `category` exactly.
4. Set audience, age restrictions, altered-content, and paid-promotion declarations truthfully for the actual video.
5. Wait for processing and review any blocking Checks result.
6. Keep the video **Private** while entering and checking details.

If an upload succeeds but a later step fails, keep and inspect that same private video. Do not create a second copy.

### 5. Schedule in YouTube Studio

1. Open the upload’s **Visibility** step and select **Schedule**.
2. Set the timezone to **Asia/Manila / UTC+08:00**.
3. Enter the tracker’s PHT date and time.
4. Leave Premiere disabled unless separately approved.
5. Confirm the scheduled time and click **Schedule**. A scheduled video remains private until its publish time. See the [YouTube scheduling guide](https://support.google.com/youtube/answer/1270709).

Always verify the displayed timezone before saving. The UTC value is a cross-check, not a replacement for the tracker’s PHT target.

### 6. Record the YouTube relationship

After the upload is saved, copy the video ID from the YouTube URL and update only the matching tracker row:

1. Set `youtube_video_id`.
2. Optionally record `PRIVATE_UPLOADED` while the upload is still being completed.
3. After the schedule is visible and verified, set `status = SCHEDULED`.
4. Set `verification_state = VERIFIED` and record `verification_timestamp`.
5. Preserve `file_hash`, original paths, batch ID, schedule, match evidence, and Related Video ID.

### 7. Verify each row

Before moving to the next row, check the YouTube Content page and the tracker:

- video ID matches exactly
- title and description match the tracker
- complete tag set and category match
- channel is Ralskies
- visibility is Scheduled/private, not Public
- PHT date/time and UTC conversion match
- processing has no blocking error

The desktop **Reconcile Read-Only** action may be used as an additional read-only check. Never use it to trigger a corrective write.

### 8. Finish the batch audit

When all rows are processed, confirm the tracker and YouTube Content page agree. Count scheduled rows, check for missing IDs or duplicate IDs, confirm no row became public early, and confirm no other batch changed.

## BULK_03 manual schedule sheet

Read-only inspection found 14 eligible `BATCH_READY` rows, 14 source files present, and 14 matching hashes. Use this order to reduce scheduling mistakes:

| # | Short ID | Song | PHT | UTC publishAt | Related Video |
|---:|---|---|---|---|---|
| 1 | RS-1D0317049693 | Just a Man | 2026-09-14 07:00 | 2026-09-13 23:00Z | TteKHjCsF-0 |
| 2 | RS-25B975F9CF0A | Dynasty | 2026-09-14 22:30 | 2026-09-14 14:30Z | — |
| 3 | RS-EB5E9D3B75A3 | Arabian Nights | 2026-09-15 17:30 | 2026-09-15 09:30Z | epLfwcKg_f8 |
| 4 | RS-3FFC27925ABE | Glimpse of Us | 2026-09-15 22:30 | 2026-09-15 14:30Z | — |
| 5 | RS-0983F637FD15 | No Longer You | 2026-09-16 07:00 | 2026-09-15 23:00Z | — |
| 6 | RS-C7746CC99AA7 | Your Idol | 2026-09-16 22:30 | 2026-09-16 14:30Z | XQ-Oof8K8lU |
| 7 | RS-508FB2B4B278 | The Challenge | 2026-09-17 17:30 | 2026-09-17 09:30Z | — |
| 8 | RS-7F842A2BE05E | Hallelujah | 2026-09-17 22:30 | 2026-09-17 14:30Z | — |
| 9 | RS-8320BA345953 | Meant to Be Yours | 2026-09-18 07:00 | 2026-09-17 23:00Z | hxyZJGGWK0Y |
| 10 | RS-050A31DAFEF7 | Chest Pain (I Love) | 2026-09-18 22:30 | 2026-09-18 14:30Z | — |
| 11 | RS-9C2006EFA40B | Golden (Disney Version) | 2026-09-19 17:30 | 2026-09-19 09:30Z | PN_n7FYq0nA |
| 12 | RS-ACD5B62F734C | Eternity | 2026-09-19 22:30 | 2026-09-19 14:30Z | YnBhTyGArv8 |
| 13 | RS-46FCA02D41C5 | Soda Pop | 2026-09-20 07:00 | 2026-09-19 23:00Z | h91QdzIXDBY |
| 14 | RS-B3BFBDF8B8AA | Don’t You Dare | 2026-09-20 22:30 | 2026-09-20 14:30Z | L_z9hTRKTO4 |

Related Video IDs are manual actions. If YouTube Studio cannot select the intended video, leave the existing tracker ID unchanged and record the action for later; do not block the scheduling state or invent a replacement ID.

## Recovery and exceptions

If the remote result is uncertain, stop that row. Do not retry an upload or metadata write. Use read-only reconciliation to determine whether the existing video already has the intended state. Finalize the tracker only after the remote state is verified.

Investigate only entries written to `exceptions.json` or `exceptions.csv`. Keep unresolved and duplicate rows out of the upload queue.

## Desktop and CLI

Install and launch the desktop application:

```text
npm install
npm start
```

Useful read-only desktop actions are Scan Folder, Preview Schedule, Verify YouTube, and Reconcile Read-Only. The renderer receives data through the isolated preload bridge; OAuth credentials remain local under `phase2/secrets`.

CLI commands remain available for deterministic preparation and reporting:

```text
node ralskies.mjs scan
node ralskies.mjs prepare --dry-run
node ralskies.mjs report
```

Upload and production-apply commands are gated. Use them only when an exact immutable plan has been explicitly approved. For the current manual workflow, perform the YouTube steps above instead.

See `AGENTS.md` for permanent operating rules and `PRD_Ralskies_Content_Engine.md` for the full product specification.

## New Shorts: draft intake and calendar

The **Drafts** screen adds a separate intake route for new videos. Existing BULK batches
continue to use their original tracker metadata and manifests.

1. Choose a dedicated folder containing finished MP4 Shorts.
2. Use **Preview Intake** to see the proposed additions without changing files, or
   **Intake Now** to register them. **Watch Folder** repeats local intake every
   15 seconds while the app is open; it starts disabled.
3. Files must be unchanged for at least 10 seconds. Intake calculates SHA-256,
   copies to `<Drafts>/hashed/<SHA256>.mp4`, verifies both copies, backs up and
   saves the tracker, and verifies the saved row. Originals retain their filenames,
   contents and locations in Drafts. The scanner excludes the entire hashed
   subfolder, including files not yet tracked. A hash already in the tracker is
   skipped and its row is untouched. Existing tracked staging paths remain valid;
   choosing another draft folder sets its new-copy destination to `<Drafts>/hashed`.
4. New rows enter an `INTAKE-...` batch with `AWAITING_METADATA`. Their title,
   description, tags, and category are blank. Use **Metadata** to enter these
   manually, or use the optional reviewed LM Studio suggestions described below.
5. Open the batch and use **Upload Missing Videos via API**, or manually upload
   the hashed files and finish saving them as **Private**. Metadata-free intake
   rows are eligible for private upload, but cannot enter publication.
6. For manual uploads, use **Find & Match Private Videos**, or **Link Private
   Upload** on a draft row. Matching requires the complete hash in the original
   filename or temporary title and an unambiguous YouTube video ID. A YouTube
   resource etag is never treated as a file hash.
7. In **Calendar**, use **Sync YouTube** to include existing scheduled and
   published channel uploads. **Reserve Posting Times** lets you choose a start
   date, times, and daily or every-other-day posting. Existing reservations,
   including old batch schedules, are not reassigned. The 20:01–21:00 Manila
   window is protected; 01:30 needs the optional-slot checkbox.
8. Once metadata, a private upload, and a future reservation are present, use the
   batch's **Review Metadata & Schedule** flow. New intake publication checks
   freshly read YouTube processing status and slot conflicts before applying.
   YouTube handles release after the schedule is confirmed.

**The watcher performs local intake only.** API uploads and publication retain
the existing explicit batch review, live-mode and configuration gates. No scans,
previews, or development tests upload or publish videos. The app must remain
open for folder watching; YouTube itself handles already confirmed releases.

The calendar distinguishes local reservations, tracker-only historical states,
and YouTube schedules/publications observed at the displayed last-sync time.
Untracked channel uploads also occupy slots because the Data API does not expose
a definitive Shorts flag. Sync again to see changes made outside this app.

Intake journals and exceptions are stored under the existing output directory.
A failed move keeps the source when possible; uncertain uploads retain their
YouTube relationship or resumable-session URL and require reconciliation before
a retry. The watcher stops on intake exceptions, which appear in **Drafts**.
After a process crash, a remaining `draft-pipeline.lock` requires checking the
logged exception and journal before removing the stale lock. Never bypass it
while another writer is active.

Related-video IDs stay in the tracker and are exported to
`RELATED_VIDEO_MANUAL.csv` for the manual Studio step. API-project audit/private
restrictions still apply to live uploads.

Development validation uses fixture MP4 bytes, mocked YouTube clients, and
temporary copies of the tracker. Run `npm test`; the workbook integration test
skips when no local tracker is available. `RALSKIES_ARTIFACT_TOOL_PATH` can point
the tracker service to an installed Artifact Tool runtime for validation.

## Optional LM Studio metadata suggestions

LM Studio is optional and is never contacted by folder watching, hashing,
matching, scheduling, retries, or status updates. The pipeline works while
LM Studio is off. No model is installed, downloaded, or started by this feature.

When you want to use your existing model:

1. Open **Drafts → LM Studio Connection** and enter the local address, port,
   protocol, and generation timeout used by your LM Studio server. The default is
   `http://127.0.0.1:1234/v1`, with a five-minute generation timeout (adjustable from 30 to 600 seconds).
2. Leave Model ID blank if the server exposes one model, or enter the ID of
   the existing model you want to use. **Test Connection** only reads the model
   list. Saving the connection does not run a model.
3. Select **Suggest Metadata** on a new draft, supply its song/artist and
   optional clip notes, then explicitly choose **Generate Suggestions**.
4. Review a suggestion, edit its missing fields if needed, and choose
   **Approve & Save to Tracker**. Filled metadata remains read-only and is not
   replaced. Music category selection is a normal program field.
5. Continue through the existing private upload and schedule review flow.

Only creative text context is sent to the configured local endpoint. Video
files, file hashes/paths, scheduling fields, and YouTube credentials are excluded
from the model prompt. Suggestions are schema-validated and saved separately
from the tracker; stale reviews cannot overwrite newer tracker edits. Model
failures leave tracker metadata unchanged and are logged to `exceptions.json`.

If local LM Studio authentication is enabled, set `RALSKIES_LM_API_KEY` in the
app's environment; it is not stored in the connection settings or model prompt.
The connection is limited to localhost, 127.0.0.1, or ::1, with your chosen port.

The integration uses LM Studio's [structured output endpoint](https://lmstudio.ai/docs/developer/openai-compat/structured-output)
and [model listing endpoint](https://lmstudio.ai/docs/developer/openai-compat/models).

YouTube metadata verification polls with reads only for about five minutes after
a successful update, allowing delayed tag readback to settle. It does not repeat
the update. If verification still fails, reconcile the persisted execution before
creating a new plan for the remaining rows.

### Title requirements for existing batches and local suggestions

Every production plan validates all titles before any remote write: titles must
be nonempty, at most 100 characters including spaces and hashtags, and contain
no angle brackets. Invalid titles appear as review blockers. Titles are checked
again on the final API payload. No automatic truncation changes approved text.

The local model is instructed to aim for roughly 40–60 characters when natural, use natural wording
about the supplied song or cover moment, avoid unsupported claims and generic
clickbait, and use at most two optional title hashtags. Extra hashtags belong
in the description. Generated text must still pass validation and human review.

## Growth publishing policy (September 16, 2026)

New drafts use four posts per Monday–Sunday week, at most one per day, on Monday,
Wednesday, Friday and Sunday. The default time is 20:00 (8 PM) Asia/Manila. The user explicitly authorized this
time; 22:00 (10 PM) stays available for recent/latest covers and is not added
as a second automatic post. The protected
20:01–21:00 manual window remains unchanged. Clips of the same song must be at least
seven full days apart, including reservations in other intake batches.

Add finished MP4s to the configured draft folder each week. Preview Intake / Intake
Now and the existing opt-in watcher accept incremental additions and skip known hashes.
Set the song identity in Metadata before planning; use the same song name for all its
clips. Mark original songs as ORIGINAL in Performance type. Originals take priority
among eligible clips when filling open dates; existing reservations are preserved.

Plan Next Two Weeks defaults to all intake batches and reserves at most 14 days ahead.
Rows outside that window or missing a song identity remain waiting. Repeat the preview
when new clips arrive. The calendar includes manual uploads when checking daily and
weekly capacity. Unknown remote song identities cannot contribute to a song cooldown.
No LLM is involved in intake identity, scheduling, copying, retries or status changes.

The user confirmed that scheduled uploads after September 16 were deleted. Those
102 tracker rows were backed up and marked RETIRED / schedule_eligible=NO; their
original schedules, hashes and YouTube IDs remain historical records. This is a
user-confirmed deletion, not an API verification. RETIRED rows are excluded from
calendar reservations, private-upload eligibility, production reviews and stale
execution plans. Unresolved and DUPLICATE rows were preserved. Never retry a retired
upload automatically. No YouTube writes were performed during this change.

Calendar and batch history: retired and completed batches are hidden from Active Batches. History is read-only. Calendar opens on upcoming posts; Show past posts reveals publication history. Fresh YouTube schedules for retired records are flagged as conflicts and still occupy dates. A failed sync preserves the previous snapshot with an explicit error; it does not confirm current remote state.

Metadata generation does not require a calendar reservation or YouTube sync. After intake, use Generate Metadata, review and approve the suggestions, then reserve publication dates. Publication still requires validated scheduling and approved metadata.

Draft metadata: original filenames automatically supply song/show/niche context. In Drafts, Generate All Metadata fills missing creative fields across editable drafts, then Apply All saves the reviewed suggestions in one tracker commit. Review Last Metadata Batch reopens saved progress; Stop After Current Video preserves completed suggestions. Approved metadata stays intact. Titles are checked against tracker titles and each other (case, punctuation and hashtag-only differences do not count); duplicate model results are flagged. Descriptions and tags may repeat. New growth reservations alternate recognized filename niches (Broadway, Disney, fandom, rock, pop), falling back to artist/song context; if no alternative is eligible, the slot remains empty. Song cooldown and four weekly 20:00 posts remain enforced.

Generated titles use the RALSKIES VOICE: prefer titles around 60 characters while allowing shorter natural wording, avoid forced keyword front-loading, keep descriptions to one or two sentences, and retain three candidate options with the best-scoring option marked as the bulk default. Hashtags are capped at five meaningful song, show, fandom, or niche tags; generic #fyp, #viral, #trending, and #Ralskies are not added automatically.

### Local creative memory (RAG)

Metadata generation keeps a local SQLite creative memory at `outputs/ralskies-content-engine/creative-memory.sqlite`. Each generation stores its candidates and model/prompt versions; approvals, edits, and rejections append decision events. The same generation ID plus candidate index is idempotent, so retries do not duplicate history.

Before a new generation, the engine retrieves a small structured set from approved active memories. Positive examples favor matching song/show/artist/niche context and manually edited approvals. Recent approved titles are supplied separately as do-not-repeat exclusions, and a small matching set of rejected candidates is supplied as patterns to avoid. Retrieval is deterministic and uses diversity across angle, source, title opening, and sentence shape. It does not use hashes as semantic similarity and it never schedules, uploads, deletes, or edits tracker rows.

The Drafts queue has a **Creative Memory** inspection control. It shows counts and recent records, and lets you disable an individual memory from future retrieval without deleting its history. Rejecting a candidate keeps it for audit and adds it to the negative memory. Old, retired, duplicate, or unresolved tracker rows are not ingested automatically; only new local generation and explicit review actions create memory records.

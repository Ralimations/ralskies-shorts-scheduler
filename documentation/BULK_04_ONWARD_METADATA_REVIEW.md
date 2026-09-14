# BULK_04 to BULK_10 metadata review

Seven folder manifests and 94 videos checked against the authoritative tracker. Original workbooks were not changed during this audit. No further YouTube updates were performed.

## Five overlong titles

Review these suggestions before saving. Each removes a redundant hashtag while preserving the wording.

### BULK_06 - Can't Help Falling in Love

Source: G:/RS_BULK/BULK_06_2026-10-05_to_2026-10-11/BULK_MANIFEST.xlsx / Manifest!M4; RS-7C36BD289C24

Current: Can't Help Falling in Love from Elvis Presley — cover excerpt #CantHelpFallingInLove #ElvisPresley #Cover

Suggested: Can't Help Falling in Love from Elvis Presley — cover excerpt #CantHelpFallingInLove #Cover

### BULK_07 - Can't Help Falling in Love

Source: G:/RS_BULK/BULK_07_2026-10-12_to_2026-10-18/BULK_MANIFEST.xlsx / Manifest!M11; RS-1FE31531FECC

Current: Elvis Presley fans, this Can't Help Falling in Love moment is for you #CantHelpFallingInLove #ElvisPresley #Cover

Suggested: Elvis Presley fans, this Can't Help Falling in Love moment is for you #CantHelpFallingInLove #Cover

### BULK_08 - Meant to Be Yours

Source: G:/RS_BULK/BULK_08_2026-10-19_to_2026-10-25/BULK_MANIFEST.xlsx / Manifest!M2; RS-81BC290BEFD0

Current: the moment this Meant to Be Yours arrangement opens up #MeantToBeYours #HeathersMusical #MusicalTheatre

Suggested: the moment this Meant to Be Yours arrangement opens up #MeantToBeYours #HeathersMusical

### BULK_09 - Can't Help Falling in Love

Source: G:/RS_BULK/BULK_09_2026-10-26_to_2026-11-01/BULK_MANIFEST.xlsx / Manifest!M2; RS-FF293C685C10

Current: me making Can't Help Falling in Love everyone else's emotional problem #CantHelpFallingInLove #ElvisPresley #Cover

Suggested: me making Can't Help Falling in Love everyone else's emotional problem #CantHelpFallingInLove #Cover

### BULK_10 - Can't Help Falling in Love

Source: G:/RS_BULK/BULK_10_2026-11-02_to_2026-11-06/BULK_MANIFEST.xlsx / Manifest!M3; RS-84D1A758E198

Current: this is where Can't Help Falling in Love stops being polite #CantHelpFallingInLove #ElvisPresley #Cover

Suggested: this is where Can't Help Falling in Love stops being polite #CantHelpFallingInLove #Cover

## Five title differences in BULK_05

These are choices to review, not automatic corrections. The app uses tracker metadata. A folder-manifest edit alone does not change the next API update.

### Hallelujah - Manifest!M3

RS-DED9B721EC52

Folder: I love this cover of Hallelujah

Tracker: Leonard Cohen fans know exactly what happens here #Hallelujah #LeonardCohen #Cover

### Meant to Be Yours - Manifest!M4

RS-A733CFED6C10

Folder: Dear Veronica #Heathers #MusicalTheatre

Tracker: me making Meant to Be Yours everyone else's emotional problem #MeantToBeYours #HeathersMusical

### Golden (Disney Version) - Manifest!M6

RS-E709DC19C55A

Folder: Watch this Golden Cover! #Golden #KPopDemonHunters #Cover

Tracker: POV: Golden (Disney Version) becomes your entire personality #Golden #KPopDemonHunters #Cover

### Out of My League - Manifest!M12

RS-91146360CD9D

Folder: Stephen Speaks fans, this Out of My League moment is for you #VocalCover

Tracker: Stephen Speaks fans, this Out of My League moment is for you #OutOfMyLeague #StephenSpeaks #Cover

### The Night We Met - Manifest!M14

RS-9267B652C500

Folder: the last line changes this The Night We Met clip #TheNightWeMet #VocalCover

Tracker: the last line changes this The Night We Met clip #TheNightWeMet #LordHuron #VocalCover

## Using the editor

Restart the desktop app. Open Batches, select a bulk, then Check Metadata > Review / Edit. Type corrections or use the manifest value in the editor, then Save to Tracker. Saving backs up the tracker and verifies saved values. It does not update YouTube or overwrite folder manifests. Open a fresh production review afterward. Pending recovery rows, duplicates, unresolved rows, and scheduled/published rows are read-only. Manage existing live metadata in YouTube Studio.

## Common errors and solutions

| Error | Solution |
|---|---|
| Invalid title | Use 1-100 characters including spaces and hashtags, without angle brackets. LLM suggestions should target 90 characters, use supplied facts, and be reviewed before saving. |
| Description too long | Stay within 5,000 UTF-8 bytes; remove angle brackets. |
| Tags too long | Stay within 500 characters including commas and quote allowance for tags with spaces. |
| Invalid related-video ID | Use the 11-character ID. Set Related Video manually in Studio. |
| invalid_grant | Reconnect Google OAuth with node phase2/youtube_phase2.mjs auth, then rediscover existing uploads. |
| REAL_PRODUCTION_EXECUTION_DISABLED | Restart with npm run start:live when ready to apply your reviewed update. The rejected request made no remote write. |
| VERIFICATION_MISMATCH | The update may already exist remotely. Check Logs / Recovery and the existing video before retrying. Do not upload another copy. |
| Stale review | Reopen the review after tracker changes. |

Limits: [YouTube video resource documentation](https://developers.google.com/youtube/v3/docs/videos). Authentication: [Google OAuth documentation](https://developers.google.com/identity/protocols/oauth2).

## Other checks

No additional issues found in checked descriptions, tag limits, related-video IDs, hashes, tracker identity links, duplicate hashes, referenced video paths, timezones, or protected-window slots. Existing legacy 07:00 slots were preserved. Metadata validation does not guarantee successful API execution.

## Production handoff

Last recorded BULK_05 state: nine verified completions, Lost Stars (RS-51C5474ADA66 / Sil23GTC3y0) applied and pending verification, four unattempted rows. Check that pending video in Logs / Recovery before retrying. This is the last recorded state, not a fresh remote check.

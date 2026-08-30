# Ralskies YouTube Shorts Growth & Upload Automation
## Product Requirements Document (PRD)

**Project:** Ralskies Content Engine  
**Owner:** Ralskies  
**Primary Platform:** YouTube  
**Supporting Analytics:** vidIQ / YouTube Analytics  
**Default Timezone:** Asia/Manila (PHT, UTC+8)  
**Primary Business Goal:** Grow legitimate YouTube revenue toward **$100 USD+ consistently**, while increasing views, subscribers, returning viewers, and discovery of Ralskies as an artist.

---

# 1. Executive Summary

The Ralskies Content Engine is a local Codex-managed workflow that takes **finished, manually edited Shorts** from designated work folders and prepares them for YouTube publication.

Codex is **not** responsible for editing the Shorts unless explicitly asked later.

Its responsibilities are to:

1. Inspect and understand the finished Shorts folders.
2. Identify each Short's song, fandom, source video, topic, and likely audience.
3. Rewrite internal filenames into **actual YouTube-ready titles**.
4. Generate optimized descriptions, hashtags, and backend YouTube tags.
5. Use legitimate growth tactics such as relevant keywords, fandom terminology, emotional hooks, buzzwords, searchable phrases, safe clickbait, hashtags, and tags.
6. Build a publishing queue.
7. Avoid duplicate uploads.
8. Respect manual upload windows.
9. Schedule finished Shorts as far into the future as inventory reasonably allows.
10. Maintain a persistent spreadsheet/workbook in the work folder that records analyzed, scheduled, uploaded, published, failed, skipped, archived, and duplicate items.
11. Use vidIQ and YouTube analytics, when available, to improve scheduling and metadata.
12. Support the long-term transition from cover discovery to original-artist recognition.

The system must optimize for **legitimate growth**, not fake views, artificial engagement, spam, irrelevant keywords, or policy-violating manipulation.

---

# 2. Strategic Objective

The primary business objective is:

> **Reach and sustain $100 USD+ in YouTube revenue as consistently as possible.**

Supporting objectives:

- increase total channel views
- increase subscriber growth
- increase returning viewers
- increase long-form watch time
- increase Shorts discovery
- increase Shorts-to-long-form traffic
- increase recognition of Ralskies as an artist
- increase audience exposure to original music
- maintain consistent channel activity without overwhelming the audience

The system must understand that **not all views are equally valuable**.

A Short with 5,000 views that creates subscribers, channel visits, and long-form traffic may be more valuable than a Short with 50,000 views and no meaningful downstream behavior.

---

# 3. Artist Strategy

The long-term positioning of Ralskies is:

> **COVERS = DISCOVERY**  
> **ORIGINAL MUSIC = CORE ARTIST IDENTITY**  
> **PERSONALITY + PERFORMANCE = THE BRIDGE**

Current/likely categories include:

- Broadway / Musical Theatre
- Hazbin Hotel / Hellaverse
- Alien Stage
- EPIC: The Musical
- The Amazing Digital Circus
- My Little Pony
- KPop Demon Hunters
- Disney
- Pop
- Acoustic / Piano
- Collaborations
- Original Ralskies Music
- Other fandoms

The developing Ralskies sound is increasingly:

- theatrical
- emotional
- piano-driven
- string-heavy
- cinematic
- intimate
- expressive
- storytelling-focused

The system should gradually help viewers care about **Ralskies**, not only the fandom or song being covered.

---

# 4. Scope

## In Scope

Codex may:

- inspect finished Shorts folders
- inspect filenames and folder names
- inspect limited video content when needed to understand the clip
- identify song/fandom/topic
- classify content
- generate upload metadata
- rewrite filenames into public-facing titles
- generate descriptions
- generate hashtags
- generate backend YouTube tags
- generate safe clickbait titles
- generate keyword-rich but natural titles
- build and maintain an upload queue
- schedule uploads
- upload through an authorized YouTube integration/API
- consult vidIQ analytics
- track published content
- maintain a spreadsheet/workbook
- detect duplicates
- recommend changes to posting times
- produce weekly growth reports
- reschedule future queue items when new high-priority content appears

## Out of Scope Unless Explicitly Requested

Codex should NOT:

- edit the Shorts themselves
- crop or reframe them
- alter audio
- delete source video files
- overwrite source media
- rename or reorganize large parts of the original Singing folder
- buy views or subscribers
- generate artificial engagement
- use unrelated trending tags
- spam metadata
- automatically publish uncertain content
- bypass copyright systems
- upload duplicates intentionally without permission

---

# 5. Folder Workflow

Codex should first inspect the existing Singing/work folders and adapt to the real folder structure.

If a dedicated automation area does not already exist, Codex may propose:

```text
YouTube_Automation/
├── READY/
├── SCHEDULED/
├── PUBLISHED/
├── FAILED/
├── ARCHIVED/
├── logs/
├── reports/
└── Ralskies_Upload_Tracker.xlsx
```

Do not move existing files until approval is given.

---

# 6. File Interpretation

Many filenames are **internal working names**, not intended to become YouTube titles.

Examples:

```text
santa_fe_chorus_take2_FINAL.mp4
gravity_oldclip_03.mp4
black sorrow part 2.mp4
tadc_new_1_FINALFINAL.mp4
loststars_short_c.mp4
```

Codex must NOT blindly use these filenames as titles.

For each file:

1. Inspect the filename.
2. Inspect its parent folder.
3. Inspect available metadata.
4. If needed, inspect enough of the video to determine what it is.
5. Determine:
   - song
   - artist/show/fandom
   - clip type
   - emotional tone
   - likely audience
6. Generate a **new public-facing YouTube title**.

The original filename should remain unchanged unless explicitly authorized.

---

# 7. Title Generation Strategy

Codex should create titles designed for legitimate click-through and discovery.

Titles may use:

- fandom buzzwords
- recognizable song terms
- emotional hooks
- curiosity
- humor
- character references
- recognizable lyrical concepts
- performance descriptors
- "male cover"
- "Broadway"
- "musical theatre"
- "English cover"
- "piano cover"
- "cinematic cover"
- artist/show names
- trending fandom terminology
- safe clickbait

## Safe Clickbait

Safe clickbait means a compelling title that creates curiosity or emotion **without lying about the content**.

Good examples:

```text
professional yearner 101 | Black Sorrow - Alien Stage
musical theatre guy desperately wants to go to Santa Fe
this harmony still goes HARD | Gravity - Hazbin Hotel
I forgot how good this MLP song was
singing this like my life depends on it
this part deserved WAY more attention
probably my favorite note in the entire song
```

Bad examples unless factually true:

```text
YOU WON'T BELIEVE WHAT HAPPENED
THIS CHANGED MY LIFE
I GOT CAST IN HADESTOWN
JEREMY JORDAN REACTED TO THIS
```

## Title Modes

Codex may choose between:

**Searchable**
```text
Black Sorrow | Alien Stage English Cover
```

**Personality-led**
```text
professional yearner 101
```

**Hybrid**
```text
professional yearner 101 | Black Sorrow - Alien Stage
```

**Performance-led**
```text
this harmony still goes HARD
```

**Fandom-led**
```text
Alien Stage fans know why this hurts
```

Do not force the same format on every upload.

---

# 8. Keywords, Buzzwords, Tags, and Discoverability Tactics

Codex should actively use **legitimate discoverability tactics**.

This includes:

- exact song title
- original artist
- musical/show/fandom name
- character names
- current fandom terminology
- relevant trend phrases
- emotional descriptors
- performance descriptors
- "cover"
- "male cover"
- "English cover"
- "Broadway cover"
- "musical theatre"
- "singing"
- "vocal cover"
- "piano cover"
- "cinematic cover"
- "Ralskies"

Metadata must remain relevant to the actual content.

Do NOT:

- use unrelated buzzwords because they are popular
- stuff titles with keywords
- attach unrelated fandom names
- use misleading keywords
- pretend metadata can force the algorithm

The objective is to help YouTube correctly understand **who is likely to enjoy the Short** and give real viewers stronger reasons to click.

---

# 9. Hashtag Strategy

Each Short should receive a small set of highly relevant hashtags.

Default:

> **3-5 hashtags**

Examples:

```text
#SantaFe #Newsies #MusicalTheatre #Cover #Ralskies
```

```text
#BlackSorrow #AlienStage #EnglishCover #Singing #Ralskies
```

```text
#HazbinHotel #Gravity #Cover #Ralskies
```

Hashtags may include:

- song
- fandom
- show
- artist
- character
- genre
- cover type
- Ralskies

Avoid:

- dozens of hashtags
- irrelevant trending hashtags
- generic spam tags
- hashtag stuffing

---

# 10. Backend YouTube Tags

Codex must prepare backend YouTube tags for every upload.

Example:

```text
Santa Fe
Santa Fe Newsies
Newsies Santa Fe
Santa Fe cover
Santa Fe male cover
Newsies cover
Jeremy Jordan Santa Fe
Broadway cover
musical theatre cover
male musical theatre cover
singing cover
Ralskies
Ralskies cover
```

Tags should include useful variations:

- exact title
- title + fandom/show
- title + cover
- title + male cover
- relevant performer
- fandom/show name
- character
- common spelling variants
- Ralskies
- relevant genre terms

Do not include unrelated terms.

Tags are supporting metadata, not a magic ranking mechanism.

---

# 11. Descriptions

Descriptions should be concise, useful, and natural.

Example:

```text
My cover of "Santa Fe" from Newsies.

Full performances and more musical theatre/fandom covers on the Ralskies channel.

#SantaFe #Newsies #MusicalTheatre #Ralskies
```

For Shorts derived from a full cover:

```text
A clip from my full cover of "Black Sorrow" from Alien Stage.

Watch the full performance on the Ralskies channel.

#BlackSorrow #AlienStage #Cover #Ralskies
```

Descriptions may include:

- full song name
- source show/fandom
- original artist
- Ralskies attribution
- related full video
- credits
- natural CTA

Avoid giant SEO paragraphs.

---

# 12. Related Long-Form Video

When a Short comes from an existing full cover, Codex should identify and attach the related long-form video whenever YouTube's tools support it.

Desired funnel:

```text
SHORT
↓
CHANNEL VISIT
↓
FULL COVER
↓
LONG-FORM WATCH TIME
↓
SUBSCRIBER
↓
RETURNING VIEWER
↓
ORIGINAL MUSIC
```

This matters to the $100+ revenue goal because long-form viewing may be more financially valuable than raw Shorts views.

---

# 13. Upload Schedule

## Target Frequency

Default:

> **2-3 TOTAL Shorts per day**

This includes:

- Codex-scheduled Shorts
- manually uploaded Shorts

Do NOT interpret this as 2-3 automated Shorts plus manual uploads.

If Ralskies manually uploads 1 Short:
- Codex normally schedules 1-2 more.

If Ralskies manually uploads 2 Shorts:
- Codex normally schedules 0-1 more.

---

# 14. Protected Manual Upload Window

The following window is reserved for Ralskies:

> **8:00 PM - 9:00 PM PHT**  
> **Asia/Manila (UTC+8)**

Codex must NOT automatically schedule content during this window unless explicitly authorized.

This window may be used for:

- long-form covers
- original songs
- premieres
- special releases
- collaborations
- manually selected Shorts
- trending/timely uploads

Analytics recommendations do NOT override this protected window.

---

# 15. Default Automated Posting Windows

Until enough data exists to improve them:

## Slot A
> approximately **5:30 PM PHT**  
Preferred range: **5:00 PM - 7:00 PM**

## Protected Manual Window
> **8:00 PM - 9:00 PM**

## Slot B
> approximately **10:30 PM PHT**  
Preferred range: **10:00 PM - 12:00 AM**

## Slot C
> approximately **1:30 AM PHT**  
Preferred range: **1:00 AM - 2:00 AM**

These are starting points, not permanent rules.

vidIQ / YouTube analytics may move Slots A, B, or C based on current audience activity.

The protected 8-9 PM slot remains reserved.

---

# 16. Manual Upload Awareness

Manual uploads and automation must share **one schedule**.

When a manual upload is known:

1. Add it to the tracker.
2. Mark the time as occupied.
3. Count it toward the day's upload volume.
4. Recalculate nearby automated uploads.
5. Avoid crowding important long-form releases.
6. Check duplicate risk.

Example:

```text
5:30 PM  AUTO     Gravity Short
8:30 PM  MANUAL   Lost Stars Full Cover
10:30 PM AUTO     Alien Stage Short
1:30 AM  AUTO     MLP Short
```

---

# 17. Long-Form Protection

Ralskies currently aims for approximately:

> **1 major long-form upload per week**

Saturday is the normal major-release day.

Typical manual long-form window:

> **8:00 PM - 9:00 PM PHT**

For major long-form releases, try to provide approximately two hours of breathing room when practical.

Good:

```text
5:30 PM  Short
8:00 PM  Long-form
10:30 PM Short
1:30 AM  Optional Short
```

Avoid:

```text
7:55 PM Short
8:00 PM Long-form
8:15 PM Short
```

unless specifically requested.

---

# 18. Optional Wednesday Long-Form Releases

Wednesday may occasionally receive another full upload when:

- a fandom/topic is trending
- a Short significantly overperforms
- a timely opportunity appears
- a completed bonus cover is ready
- a collaboration requires it
- production burden is low

Known Wednesday releases should receive the same schedule protection as Saturday releases.

---

# 19. Scheduling Horizon

Codex should schedule content:

> **As far into the future as approved inventory reasonably permits.**

Do not stop at one week merely because the first week is filled.

Examples:

- 60 Shorts at 3/day = about 20 days
- 120 Shorts at 3/day = about 40 days

However:

- keep future schedules editable
- leave room for trends
- leave room for new releases
- allow higher-priority content to replace lower-priority future slots

Do not permanently lock months of uploads into a rigid order.

---

# 20. Content Rotation

Avoid flooding one fandom or song.

Bad:

```text
5:30 PM  Black Sorrow
10:30 PM Black Sorrow
1:30 AM  Black Sorrow
```

Preferred:

```text
5:30 PM  Hazbin Hotel
10:30 PM Broadway
1:30 AM  Alien Stage
```

or:

```text
5:30 PM  Current release
10:30 PM Proven old catalog
1:30 AM  Experimental/original
```

Guidelines:

- avoid consecutive Shorts from the same song
- avoid repeated near-identical clips
- mix old and new content
- include proven fandoms
- support current releases
- gradually introduce originals
- allow breakout topics to receive temporarily increased frequency

---

# 21. Scheduling Priority

When choosing what to post first:

1. Important manual long-form/original release
2. Important manual Short
3. Promotional Short for newest release
4. Trending/time-sensitive fandom content
5. Proven high-performing fandom
6. Proven older catalog
7. Other finished covers
8. Experimental/archive content

Current analytics should override old assumptions when enough evidence exists.

---

# 22. Spreadsheet / Upload Tracker

Codex must maintain a persistent spreadsheet/workbook inside the project's work folder.

Preferred file:

```text
Ralskies_Upload_Tracker.xlsx
```

If XLSX handling is impractical during initial implementation, Codex may temporarily use:

```text
Ralskies_Upload_Tracker.csv
```

The tracker exists to:

- prevent duplicates
- show the content queue
- track scheduling
- track publishing
- track metadata
- track performance
- preserve history between Codex sessions

The tracker must NOT be deleted or recreated from scratch every run.

---

# 23. Required Tracker Columns

Minimum fields:

```text
short_id
file_name
file_path
file_hash
source_song
source_longform
artist_or_fandom
category
clip_type
public_title
description
hashtags
youtube_tags
related_video_id
status
scheduled_date
scheduled_time
timezone
youtube_video_id
published_time
views_24h
views_7d
views_30d
likes
comments
subscribers_gained
average_percentage_viewed
viewed_vs_swiped
manual_or_auto
notes
```

Optional future fields:

```text
estimated_revenue
longform_clicks
channel_visits
title_style
posting_slot
vidiq_title_score
performance_grade
```

---

# 24. Tracker Status Values

Use:

```text
READY
ANALYZED
REVIEW
APPROVED
UPLOADING
SCHEDULED
PUBLISHED
FAILED
SKIPPED
ARCHIVED
DUPLICATE
```

---

# 25. Duplicate Prevention

Before upload, Codex must check:

1. Exact filename.
2. Exact file path.
3. File hash where practical.
4. Previous tracker history.
5. Scheduled uploads.
6. Published uploads.
7. Source song.
8. Clip identity.
9. Near-identical titles.
10. Near-identical video exports where practical.

Codex must not blindly upload the same Short twice.

If a possible duplicate is detected:

- mark it `DUPLICATE` or `REVIEW`
- explain why
- do not upload without approval

Intentional reposts may be allowed later, but only through explicit strategy.

---

# 26. Existing YouTube History

Where API access allows, Codex should compare the READY folder against:

- already published Shorts
- scheduled Shorts
- existing long-form uploads

The spreadsheet is the local source of truth, while YouTube data is used for verification.

---

# 27. vidIQ Integration

When available, Codex should use vidIQ for:

- subscriber activity windows
- audience overlap
- title scoring
- topic research
- keyword research
- similar videos
- trend discovery
- recent performance analysis
- breakout comparisons
- competitor packaging research

vidIQ is advisory.

Do not treat a single AI score or recommendation as absolute truth.

---

# 28. Algorithm-Growth Tactics

Codex should deliberately optimize every upload for discoverability.

Allowed:

- compelling title hooks
- relevant buzzwords
- exact fandom terms
- searchable song titles
- recognizable character names
- relevant performer names
- relevant trending phrases
- emotionally loaded but accurate wording
- curiosity
- humor
- searchable metadata
- relevant tags
- relevant hashtags
- related-video linking
- posting near audience-active periods
- content rotation
- leveraging proven fandoms
- supporting videos with strong historical performance

Not allowed:

- fake views
- bots
- bought subscribers
- misleading clickbait
- unrelated keywords
- irrelevant hashtags
- impersonation
- deceptive claims
- spam
- artificial engagement

The goal is:

> **Help YouTube understand the content and give real viewers stronger reasons to click and watch.**

---

# 29. Approval Mode

Initial operation must be:

```text
SCAN
↓
ANALYZE
↓
GENERATE METADATA
↓
BUILD QUEUE
↓
SHOW RALSKIES
↓
WAIT FOR APPROVAL
↓
UPLOAD/SCHEDULE
```

Before scheduling, Codex should show:

| Field | Required |
|---|---|
| File | Yes |
| Identified song | Yes |
| Category | Yes |
| Proposed title | Yes |
| Description | Yes |
| Hashtags | Yes |
| Backend tags | Yes |
| Related long-form | When available |
| Date | Yes |
| Time | Yes |
| Manual/Auto | Yes |

Do not upload the first batch until approved.

---

# 30. Autonomous Scheduling Mode

After the workflow has been tested successfully, Ralskies may explicitly authorize:

> **AUTO-SCHEDULE MODE**

In auto mode, Codex may:

1. scan new READY files
2. classify them
3. generate metadata
4. select posting slots
5. schedule them
6. upload them
7. update the tracker
8. verify success

It must still stop for:

- duplicates
- unclear song identification
- copyright/rights uncertainty
- failed API calls
- schedule conflicts
- ambiguous content
- risky metadata
- missing required information

The 8-9 PM protected window remains reserved.

---

# 31. Publishing Verification

After every upload/schedule operation, verify:

- correct file uploaded
- correct title
- correct description
- correct hashtags
- correct tags
- correct privacy status
- correct date
- correct time
- correct timezone
- correct related video where supported
- correct YouTube video ID

Never assume success from one API response.

Update the spreadsheet only after the actual status is known.

---

# 32. Failure Handling

If upload fails:

1. mark `FAILED`
2. record the error
3. do not blindly retry if duplicate risk exists
4. retry safely if the failure is transient
5. notify Ralskies if human action is required

If a scheduled upload disappears or changes unexpectedly:

- flag it
- compare YouTube state against tracker
- do not silently recreate it

---

# 33. Analytics Feedback Loop

After publishing, Codex should periodically gather:

## Shorts

- views after 24h
- views after 7d
- views after 30d
- likes
- comments
- subscribers gained
- subscribers per 1,000 views
- average percentage viewed
- viewed vs swiped away
- VPH when available

## Long-form

- views
- impressions
- CTR
- average view duration
- average percentage viewed
- subscribers gained
- Browse traffic
- Suggested traffic
- Search traffic
- Shorts referrals
- returning viewers
- revenue when available

---

# 34. Learning Objectives

As the tracker grows, Codex should identify patterns such as:

```text
Alien Stage produces strong subscriber conversion.
MLP produces higher reach.
Hazbin creates better long-form follow-through.
25-35 second clips outperform 50-second clips.
High-note clips outperform intro verses.
10:30 PM performs better than 5:30 PM.
Personality-led titles outperform plain song titles.
Hybrid song + personality titles perform best.
```

These are examples only.

Real recommendations must come from actual Ralskies data.

---

# 35. Weekly Growth Report

Generate a weekly report containing:

## Channel Growth

- total Shorts views
- total long-form views
- subscribers gained
- subscribers lost
- returning viewers
- watch time
- estimated revenue where available

## Best Content

- best Short
- best long-form
- best subscriber converter
- best retention
- best title style
- best category
- strongest posting window

## Weak Content

- weakest Short
- poor-retention clips
- low-conversion content
- repetitive categories
- underperforming title styles

## Recommendations

- what to post more
- what to reduce
- which old videos deserve more Shorts
- which new videos deserve support
- title/buzzword opportunities
- fandom opportunities
- scheduling changes

---

# 36. Revenue Progress

Where legitimate revenue analytics are available, track progress toward:

> **$100 USD+**

Example:

```text
MONTHLY TARGET: $100.00
CURRENT ESTIMATED REVENUE: $61.50
REMAINING: $38.50
PROJECTED MONTH-END: $93.20
```

Clearly distinguish:

- actual revenue
- estimated revenue
- projected revenue

Do not fabricate missing values.

---

# 37. Current Known Long-Form Strategy

Default:

> approximately **1 major long-form upload per week**

Saturday is the primary long-form day.

Known/planned Saturday content has included:

- Wedding Song
- Wait For Me
- For Forever
- One Day More
- Sail on Santa Maria
- The Violet Hour

The live/current content calendar is authoritative if this list changes.

Optional Wednesday full uploads may be added when strategically useful.

---

# 38. Security and Credentials

YouTube authentication should use a proper authorized integration/API.

Never:

- hardcode credentials
- commit access tokens
- expose API keys
- print secrets in logs

Use appropriate local secret storage such as `.env` and ensure secrets are ignored by version control.

---

# 39. Persistent Project Memory

Codex should create/update a concise persistent project instruction file such as:

```text
AGENTS.md
```

or the appropriate project-level Codex instruction file.

It should preserve:

- primary $100+ revenue goal
- Shorts growth objective
- protected 8-9 PM window
- 2-3 TOTAL Shorts/day
- manual + auto uploads share one schedule
- safe clickbait
- tags/hashtags/buzzword optimization
- spreadsheet tracking
- duplicate prevention
- source-media safety
- artist strategy
- approval-first behavior

Do not stuff the persistent file with the entire PRD.

The PRD remains the detailed source of truth.

---

# 40. Initial Implementation Plan

Codex must begin conservatively.

## Phase 1: Inventory

1. Inspect the Singing/work folders.
2. Identify the sorted Shorts.
3. Do not move or rename them.
4. Determine likely song/fandom/category.
5. Hash files where practical.
6. Locate or create the tracker.
7. Check already-published history.
8. Find likely duplicates.

## Phase 2: Metadata

For each READY Short:

1. identify content
2. generate a real public title
3. generate description
4. generate hashtags
5. generate backend tags
6. identify related long-form video
7. classify title style

## Phase 3: Draft Schedule

1. calculate available inventory
2. build 2-3 total Shorts/day schedule
3. protect 8-9 PM
4. account for manual uploads
5. protect long-form days
6. rotate categories
7. use vidIQ activity insights when available
8. schedule as far into the future as inventory reasonably allows

## Phase 4: Approval

Return a full proposed upload plan.

Do not upload yet.

## Phase 5: Upload Test

After approval:

1. upload a small test batch
2. schedule it
3. verify metadata
4. verify timing
5. verify tracker updates
6. verify duplicate protection

## Phase 6: Broader Scheduling

Once the test batch works:

- schedule approved inventory
- maintain tracker
- monitor analytics
- adapt the future queue

---

# 41. First Command to Codex

```text
Read PRD_Ralskies_Content_Engine.md as the source of truth.

I have already sorted my finished Shorts into the work folders.

Your first job is to inspect the folder structure and understand the content inventory.

Some filenames are internal working names and MUST NOT automatically become YouTube titles.

For every Short, determine what the content is and prepare:
- a real public-facing title
- a safe clickbait or searchable variant when useful
- a concise description
- 3-5 relevant hashtags
- backend YouTube tags
- category/fandom
- related long-form video where available

Use legitimate growth tactics such as relevant keywords, fandom terminology, emotional hooks, buzzwords, search phrases, tags, hashtags, and safe clickbait.

Do not use misleading or irrelevant metadata.

Maintain Ralskies_Upload_Tracker.xlsx (or CSV fallback) in the work folder as the persistent source of truth for what has been analyzed, scheduled, uploaded, published, failed, archived, or detected as duplicate.

Use the tracker plus YouTube history to prevent duplicate uploads.

The main business goal is legitimate channel growth and reaching $100+ USD in YouTube revenue consistently.

Target approximately 2-3 TOTAL Shorts per day, including Shorts I manually upload.

Always keep 8:00 PM-9:00 PM PHT reserved for my manual uploads unless I explicitly release the slot.

Preferred automation windows currently begin around:
- 5:30 PM PHT
- 10:30 PM PHT
- 1:30 AM PHT

These may be optimized using current vidIQ/YouTube analytics, but the 8-9 PM manual window stays protected.

Saturday is normally the main weekly long-form release day and should receive breathing room.

Schedule approved Shorts as far into the future as available inventory reasonably permits, while keeping the future queue flexible for trends and new releases.

Do not edit, rename, move, delete, upload, or schedule anything yet.

First:
1. inspect the folders
2. inventory the Shorts
3. identify likely duplicates
4. inspect available YouTube/vidIQ integrations
5. locate or propose the upload tracker
6. prepare metadata for the inventory
7. create the full proposed schedule
8. report the implementation plan

Wait for my approval before consequential changes.
```

---

# 42. Definition of Success

The product is successful when this becomes the normal workflow:

```text
RALSKIES
edits Shorts manually
↓
places finished files in work folder
↓
CODEX
identifies content
↓
creates strong title/metadata
↓
checks duplicate tracker
↓
uses analytics to choose schedule
↓
respects manual upload window
↓
uploads/schedules
↓
updates spreadsheet
↓
collects performance
↓
learns what works
↓
improves future uploads
```

The system should reduce administrative effort while increasing the probability of legitimate:

- views
- subscribers
- returning viewers
- long-form traffic
- watch time
- revenue
- original-music audience growth

The ultimate business outcome is:

> **A consistent, sustainable Ralskies YouTube publishing engine capable of helping the channel reach and maintain $100 USD+ revenue while building a genuine artist audience.**

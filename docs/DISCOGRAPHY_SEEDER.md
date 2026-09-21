# The discography seeder

A **temporary** feature. It exists to fill an empty DISCOGRAPHY from the
platforms the music is already on, is run once on the operator's machine, and
is deleted afterwards. §7 says how to remove it.

Typing a back catalogue in by hand is an evening's work and produces a
catalogue that disagrees with the stores in a dozen small ways — a date here,
a spelling there, an ISRC nobody copied. Everything needed is already public
and already keyed by identifiers built for exactly this.

---

## 1 · The pipeline

```
                          ┌──────────────────────────┐
                          │  SPOTIFY  (the spine)    │
                          │  artist id → releases    │
                          │  → UPC, ISRC, dates,     │
                          │    artwork, durations    │
                          └───────────┬──────────────┘
                                      │  57 ISRCs · 18 UPCs
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
   EXACT MATCH                   EXACT MATCH                   EXACT MATCH
        │                             │                             │
┌───────▼────────┐          ┌─────────▼────────┐          ┌─────────▼────────┐
│ APPLE MUSIC    │          │ DEEZER           │          │ TIDAL            │
│ lookup?upc=    │          │ track/isrc:      │          │ filter[isrc]=    │
│ keyless        │          │ keyless          │          │ client creds     │
└───────┬────────┘          └─────────┬────────┘          └─────────┬────────┘
        └─────────────────────────────┼─────────────────────────────┘
                                      │
                          ┌───────────▼──────────────┐
                          │   one record, many       │
                          │   distribution rows      │
                          └───────────┬──────────────┘
                                      │
        ┌─────────────────────────────┴─────────────────────────────┐
        │                                                           │
   FUZZY — no identifier exists                              (nothing else
        │                                                     is uncertain)
┌───────▼────────┐          ┌──────────────────┐
│ SOUNDCLOUD     │          │ YOUTUBE          │
│ oEmbed, keyless│          │ Data API v3      │
│ title only     │          │ title only       │
└───────┬────────┘          └─────────┬────────┘
        └─────────────┬───────────────┘
                      │  titles that matched nothing exactly
            ┌─────────▼───────────┐
            │  JEV  (TypeSafe)    │   choice + noul, with probabilities
            │  1 · which record?  │
            │  2 · same master?   │
            └─────────┬───────────┘
                      │
         ┌────────────┼────────────┐
      ≥ 0.85       0.15–0.85     ≤ 0.15
      merge        OPERATOR       separate
                   REVIEWS
                      │
            ┌─────────▼───────────┐
            │  WRITE — additive   │   matched on ISRC / UPC / platform URL
            │  never destructive  │   existing records are updated, not
            └─────────────────────┘   replaced, and nothing is deleted
```

---

## 2 · Why identifiers, and where they run out

**ISRC identifies a recording. UPC identifies a product.** They are the whole
reason this is tractable, and the distinction is load-bearing: a single and the
album carrying it share an ISRC and have different UPCs, so matching on ISRC
alone would fold one into the other and destroy a record. See
`ReleaseTrackSchema.releaseId` — album membership exists precisely so the two
can be related without being merged.

Four of the six platforms carry one of those identifiers, so their links are
exact and need no judgement. **SoundCloud and YouTube carry neither.** That is
the entire reason a model is involved: not to do the matching, but to answer
the handful of questions that identifiers cannot.

| Platform     | Joined by      | Key                | Certainty           |
| ------------ | -------------- | ------------------ | ------------------- |
| Spotify      | — (the source) | client credentials | —                   |
| Apple Music  | UPC            | none               | exact               |
| Deezer       | ISRC           | none               | exact               |
| TIDAL        | ISRC           | client credentials | exact               |
| YouTube      | title          | API key            | adjudicated         |
| SoundCloud   | title          | none (oEmbed)      | adjudicated         |
| Amazon Music | —              | —                  | **no route exists** |

---

## 3 · What was measured, not remembered

Every one of these differs from the documentation the plan was first written
against. They are recorded here so the next person does not rediscover them.

- **Spotify `/artists/{id}/albums` caps `limit` at 10.** Above that it answers
  `400 Invalid limit`. The documented maximum was 50.
- **Spotify's batch endpoints are gone for new apps.** `/albums?ids=` and
  `/tracks?ids=` answer `403 Forbidden`. Only the singular endpoints are open,
  so the harvest reads one record at a time.
- **Odesli is no longer keyless.** Every request answers
  `401 PUBLIC_API_ACCESS_DEPRECATED`. It was the plan's route to Apple and
  Amazon; UPC and ISRC lookups replaced it and are strictly better, being exact
  rather than an aggregator's guess from a URL.
- **SoundCloud API applications require Artist Pro.** The account is on Artist,
  so there is no key. The public oEmbed endpoint covers title and artwork.
- **TIDAL rate-limits aggressively** and answers 429 in bursts; the shared
  `request` helper backs off and the harvest completes.

## 4 · Two traps worth keeping in mind

**A name is not an artist.** Searching Spotify for "Candy Heist" returns a
second, unrelated act with the same name, and a release of theirs appeared on
_his_ YouTube channel's Releases tab. The harvest is keyed off his **artist
id**, never a name, and YouTube is allowed to contribute links but never to
mint a record.

**Two channels are not one.** `<Artist> - Topic` is auto-generated and holds an
Art Track per released recording; the channel he posts to holds promos and
Shorts. Putting the same id in both fields reads the same uploads twice and
finds no music at all — the harvester now refuses a duplicate channel.

---

## 4a · What counts as a record

Two rules the operator supplied, both of which the first pass got wrong.

**A promo is not a record.** Most of what a musician puts on YouTube is
_about_ the music rather than the music: teasers, studio clips, pre-save
announcements, festival footage, vlogs. The first pass filed all of it as
"not in the catalogue" and would therefore have minted a release for
`PRE-SAVE THIS TRACK AND MY EP "4x4"`. Anything the catalogue does not
contain is now asked what it _is_ — recording, promo, mix or other — and only
a recording becomes a record.

**An anime music video is the official video for its track.** `Candy Heist -
Over The Moon (Anime Music Video)` is not a separate work and not a promo; it
is the video for `Over The Moon`, which is a SoundCloud exclusive. Exclusives
are grouped across sources by title with the artist prefix and the format
words stripped, so that upload and the SoundCloud one become **one record
with two links** rather than two records. Four recordings in the first harvest
are exactly this shape.

## 5 · How it runs, for the operator

The seeder runs **on his machine, inside Candy Haven**. He is given the keys
and profile links, pastes them into the seeder page, and presses one button.

1. **Paste the credentials.** Held in memory for the run only. They are never
   written to settings, never sent to the renderer, and are gone when the
   window closes.
2. **Harvest.** Reads all six sources and caches every raw response, so a
   second press costs nothing and re-running the matcher never re-hits an API.
3. **Review.** A list of what will be written: each record, its platform links,
   its tracks, and the handful of adjudicated calls with their probabilities.
   Anything between the bands is flagged for a yes or no.
4. **Write.** One press. **Additive and idempotent** — see §6.

## 6 · The write is additive

The catalogue on his machine is not empty and must not be trampled.

- Matched on **ISRC**, then **UPC**, then a **platform URL**. A record that is
  already there is _updated_ — links added, missing ISRCs filled — never
  replaced.
- Nothing is ever deleted. A record the harvest does not know about is left
  exactly as it is.
- Running the seeder twice produces the same catalogue as running it once.
  "Run once" is always run twice in practice.
- Artists met along the way are resolved against the roster by name and created
  only when missing; the service already returns an existing record on a name
  collision, which is the behaviour a seeder wants.
- Compilations he is one track of seed **his track only** — not the other
  twenty-four, and not their artists.
- A remix of somebody else's song is billed to the original artist with Candy
  Heist credited as remixer (`REMIX_BILLING=original`).

## 7 · Removing it

By design this is one folder, one route and one button:

1. Delete `src/main/services/seed/` and its IPC handlers.
2. Delete the `seed:*` channels from `src/shared/ipc/contract.ts` and the
   preload bridge.
3. Delete the `/discography/seed` route and the button that reaches it.
4. Delete `scripts/seed/` and `.seed-cache/`.
5. Delete `.env.seed` and `info/soundcloud-tracks.txt`.

Nothing else in the application depends on any of it. The records it wrote are
ordinary DISCOGRAPHY records and stay behind.

---

## 8 · What the first harvest found

Run 21 Sep 2026 against the real catalogue, for scale:

```
Spotify      18 records · 57 recordings · 57 ISRCs · 18 UPCs
Apple        18/18 records
TIDAL        57/57 recordings
Deezer       50/57 recordings      (the 7 are inside a foreign compilation)
YouTube      10 art tracks + 23 uploads on the main channel
SoundCloud   19 tracks
Amazon       no route
```

What the proposal came to:

```
17  released records, 32 recordings
 1  compilation appearance, his track only
13  exclusive records, folded from 17 uploads
 8  links added to records that already exist
12  uploads dropped as promo, mix or other
21  decisions flagged for review before anything is written
```

The case that justifies the adjudicator: `YKWIL (Candy Heist Remix)` on Spotify
and `You Know What I Like (Candy Heist Remix)` on SoundCloud are one recording
under two names, and no string comparison will ever say so.

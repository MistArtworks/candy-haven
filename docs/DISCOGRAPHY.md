# ARTISTS and DISCOGRAPHY — design capture

> **Status: building.** Dictated 2026-09-16. Four structural questions were put
> to the operator and answered; those answers are D1–D4 below and are not open.
>
> This is the re-specification D21 of [`ARCHIVE_REDESIGN.md`](ARCHIVE_REDESIGN.md)
> left the door open for — "RELEASES is turned off, not deleted… the mechanism
> is still there when releasing is respecified". It is also the discography
> described in [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) §14 as planned but not
> yet being built. Both of those notes are now superseded by this file.

---

## 1. What was asked for

Two things, in the operator's words:

> "An artists page where we can add all the artist candy heist collabed with…
> do any CRUD operation to it, like editing their name, picture, socials. This
> artist can be added to what project they belong to in the archive projects."

> "A discography page where candy heist can upload and update all singles, eps,
> albums, remixes. This should be an item that can be created and where they are
> distributed, who was the label that was published/distributed by, cover arts,
> canvas, etc. And IF these songs/singles exist in the archives we can link the
> project with the discography. Basically make sure everything in the project
> are interlinked with each other."

## 2. Decisions

- **D1 — Two departments, not lenses.** ARTISTS and DISCOGRAPHY each get a rail
  entry, a chapter and a quick guide. Chosen over folding them into one
  department or into ARCHIVE. See §6 for the shortcut problem this creates and
  how it is closed.

- **D2 — DISCOGRAPHY absorbs VOLUMES and the stood-down RELEASES.** One record
  is the album / EP / single / remix: its tracks, its date, its label, its
  artwork, its distribution metadata. ARCHIVE's VOLUMES lens retires,
  `project.volumeId` and `project.trackNumber` are dropped, and the existing
  `archive_volumes` and `releases` documents are carried across by a migration.
  Three collections claiming to describe "what shipped" would eventually
  disagree, and the operator would have no way to tell which was lying.

- **D3 — Artist records and the ARTIST folder kind stay separate.** The folder
  kind is a shelf: where a project's files sit on disk. An artist record is who
  made it. A project may credit several artists while sitting on one shelf, and
  moving it between shelves must not rewrite its credits. `FOLDER_KINDS` is
  untouched.

- **D4 — A label is a field, not a record.** `label` and `labelUrl` on the
  release, with the field autocompleting from labels already used. Revisit if a
  label ever needs a logo or a roster page — and note the cost when doing so,
  because it is the `tags` → `tagIds` migration again (schema v3), which could
  not be converted and had to be wiped.

## 3. The tracklist reverses a VOLUMES decision, deliberately

`volumes.constants.ts` records that membership lives on the **project**
(`volumeId` + `trackNumber`) and never as a list on the volume, so there is one
source of truth. That was right for a volume and is wrong for a release.

A volume is made **only** of projects. A discography entry is not: the whole
point, per PROJECT_CONTEXT §14, is that an entry "links to an ARCHIVE project
when one exists and otherwise stands alone". A track with no project cannot be
stored on a project.

So the tracklist lives on the release, as an ordered array, and each track
carries an optional `projectId`. The link is **one-directional**: the release
knows its tracks, a project does not know its release. The reverse lookup is
built by the discography service and handed to the projects service as a
resolver — the same arrangement `setTagResolver` already uses, and for the same
reason: two stored directions would drift.

## 4. The records

### Artist — `archive_artists`

| Field                                          | Notes                                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `name` / `nameKey`                             | Case-folded key is uniquely indexed, as tags are                                         |
| `realName`                                     | Optional, for credits and splits                                                         |
| `roles`                                        | `producer`, `vocalist`, `dj`, `instrumentalist`, `writer`, `engineer`, `visual`, `other` |
| `picturePath`                                  | Managed copy — see §5                                                                    |
| `colour`                                       | Operator-picked, stored verbatim. The ARCHIVE's licence, same rule                       |
| `links[]`                                      | `{ platform, url, label }`, ordered. Platform from a closed set plus `other`             |
| `notes`, `favourite`, `createdAt`, `updatedAt` |                                                                                          |

### Release — `discography`

| Field                                      | Notes                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `kind`                                     | `single` · `ep` · `album` · `compilation` · `remix`                           |
| `title`, `subtitle`                        | Subtitle carries `— Nasko Remix` and the like                                 |
| `artistIds`, `featuredArtistIds`           | Credits at release level                                                      |
| `label`, `labelUrl`, `catalogueNumber`     | D4                                                                            |
| `status`                                   | `idea` · `planned` · `scheduled` · `released` · `shelved`                     |
| `releaseDate`                              | `YYYY-MM-DD`, as everywhere else in this project                              |
| `upc`, `copyrightLine`, `phonographicLine` | Distribution metadata, finally modelled                                       |
| `artwork`, `canvas`                        | Managed copies — see §5                                                       |
| `links[]`                                  | Spotify, Apple, Beatport, Bandcamp, SoundCloud, YouTube, …                    |
| `tracks[]`                                 | Ordered. `{ position, title, projectId, artistIds, isrc, durationMs, notes }` |
| `colour`, `notes`, `favourite`             |                                                                               |

`isrc` sits on the **track**, not the release, because that is what an ISRC
identifies. `upc` sits on the release, because that is what a UPC identifies.

## 5. Pictures and artwork are copied, never referenced

A managed directory under the wrapper, alongside `Projects` and
`Release Mastered Tracks`:

```
Candy Haven\
  Media\
    artists\   <artistId>.<ext>
    releases\  <releaseId>-artwork.<ext>  <releaseId>-canvas.<ext>
```

Copied in on set, as release deliverables already are, and for the same reason:
a referenced path breaks the first time the operator tidies their Downloads
folder, and a discography that loses its covers is not a record of anything.
`Media` joins `RESERVED_WRAPPER_DIRECTORIES`.

Drawing them reuses `projects:thumbnail`, which already decodes and downscales
in the main process because the renderer's CSP forbids `file:` images. It was
never project-specific; only its name is.

## 6. Two more departments breaks the numbered chords, and that is now fixed

`ConsoleLayout` binds `Ctrl`+`1`…`9`,`0` across the first ten departments and
its own comment says the rest "get no chord at all rather than a fictional one.
If the rail ever grows that far the numbering has stopped being the right
affordance anyway."

The rail grew that far at eleven — CATECHISM already had no chord — and this
takes it to thirteen, which would silently cost **DISPATCH** its `Ctrl`+`9`.

Rather than renumber, the three departments past the tenth get named chords, as
REGULATION and CATECHISM already had:

| Department | Chord                      |
| ---------- | -------------------------- |
| DISPATCH   | `Ctrl`+`Shift`+`D` _(new)_ |
| REGULATION | `Ctrl`+`,`                 |
| CATECHISM  | `Ctrl`+`Shift`+`K`         |

`docs/shortcuts.md` is corrected at the same time; it has been claiming
`Ctrl`+`0` opens CATECHISM since DARKROOM shipped.

## 7. What changes in ARCHIVE

- **VOLUMES lens retires.** It joins `releases` in `HIDDEN_ARCHIVE_LENSES`…
  no — it is removed outright, because unlike RELEASES nothing is left behind:
  the records move.
- `project.volumeId` / `project.trackNumber` are dropped by the migration.
- `project.artistIds` is **added**, so a project credits its collaborators
  independently of the shelf it sits on (D3).
- `PROJECT_CATEGORIES` gains `remix`.
- `reconcileCategory`'s volume invariant goes with volumes. Category becomes
  what it always read as — the operator's own label on the work — and nothing
  enforces it against a release, because the link now lives on the release.
- The dossier's OVERVIEW gains **CREDITS** beside TAGS and NOTES: both are the
  operator's own mark on the record, which is the rule that tab already follows.
- The dossier's RECORD tab reports which release a project is a track on, read
  through the resolver in §3.

---

# The pipeline meets the catalogue — 2026-09-17

> **Status: built.** Dictated 2026-09-17. Four more structural questions were
> put to the operator and answered; those answers are D5–D8 and are not open.
>
> The department shipped on 2026-09-16 as *structure without a workflow*: a
> release could be raised at any time, any filed project could be linked to any
> track, and the file that ships was still chosen in the ARCHIVE. Three records
> described the same work and none of them agreed about when it was finished.

## 8. The one contradiction this had to resolve first

`ready` carried `requiresMaster: true`, and `evaluateReadiness` gated it on
`masters.final !== null`. Gating linkability on TRACK READY while moving the
master pick into DISCOGRAPHY deadlocks: the gate needs a file that can only be
chosen from the far side of the gate.

**So the master requirement came off TRACK READY.** The stage is now what every
other stage in this application already is — the operator's own statement about
the work, which is the altitude rule the dossier follows for tags and notes.

`requiresMaster` stays on `ProjectStageDefinition` with no stage setting it. Two
main-process readers use it and are the seam a respecified workflow re-arms.

## 9. Decisions

- **D5 — The release master is referenced in place.** The track stores the path
  to the file where it already sits in the project folder. Nothing moves and
  nothing is copied.

  Chosen over copying it into `Release Mastered Tracks` and over moving it as
  the old `masters.final` did. The operator's stated reason for wanting the link
  at all was "it's easy to navigate and find the source files better", and
  moving the bounce away from the session that made it is the opposite of that.
  Copying would leave two files and no way to tell which one the record means.

  `Release Mastered Tracks` therefore goes quiet. It is not removed — it is
  still in `RESERVED_WRAPPER_DIRECTORIES`, and whatever replaces the master
  workflow may want it.

- **D6 — The link sets the stage.** Flipping a release to RELEASED moves every
  project behind its tracks to a new `released` stage, with a history note
  naming the release; moving it back, unlinking a track, or dropping the entry
  returns them to `ready`. Still settable by hand, for back catalogue with no
  entry to be moved by.

  Chosen over reporting only. The alternative left a project that shipped a year
  ago sitting at TRACK READY forever if the operator forgot, which is exactly
  the drift the one-directional link was supposed to prevent.

  **Only those two stages are ever touched**, and that constraint is
  load-bearing rather than polite. A catalogue edit that could drag work
  backwards through the pipeline, or wake something deliberately shelved, would
  be a consequence nobody would predict from changing a release's status.
  `reconcileLinkedStages` guards both directions.

- **D7 — Credits are release level only.** One list of `role → artists` rows,
  reusing `ARTIST_ROLES` through a second label table, `ARTIST_ROLE_CREDIT`,
  that says the same set in a credit's voice: `PRODUCED BY` rather than
  `PRODUCER`.

  A row per role, not per person, because that is how a credit reads — one
  PRODUCED BY line naming three people rather than three lines saying PRODUCED
  BY. Per-track overrides were offered and declined; revisit if an album ever
  needs credits that differ track by track.

  Reusing the closed role set rather than opening a free-text field is the
  `tags` lesson again: a free-text role produces `Vocals`, `vocalist`, `Vocal`
  and `VOX` inside a month.

- **D8 — The release sheet is five tabs.** `RELEASE` · `CREDITS` · `TRACKS` ·
  `TRADE` · `ARTWORK`, ordered by when the operator learns each thing, and
  mirroring `ProjectDossier`'s horizontal strip rather than inventing a second
  way to navigate a record.

  It was one scroll carrying twelve fields, a credit picker, a tracklist, six
  identifiers and two artwork wells at one altitude — the same failure the
  dossier was split to fix, arrived at independently.

## 10. Only finished work is linkable

`LINKABLE_PROJECT_STAGES` is `['ready', 'released']`, and the ARCHIVE's pipeline
is now the gate into the catalogue.

`released` is in the set because a linked project is *moved* there the moment
its release goes out (D6). Leaving it off would mean shipping a track
disqualified it from the catalogue it had just entered.

Enforced in `DiscographyService.requireLinkable`, not only in the picker. The
renderer hides what it cannot offer, which is the courtesy; the refusal is what
makes the rule true of a stale window as well as of the list on screen.

## 11. What was removed, and what was deliberately kept

**Removed** — `MixAndMaster`, `FinalMasterDialog` and `FinalMasterMenu`; the
`marksAudio` block and readiness master line in `DossierOverview`; the
`MASTERED` chip in `ArchivePage` and `ProjectBoardView`; `AUDIO_MARK_LABEL`,
`AUDIO_MARK_HINT`, `AUDIO_MARK_STAGE`, `marksAudio` and `FINAL_SOURCE_MARKS`.

**Kept as the seam, unreached by any screen** — `projects:set-final` /
`projects:clear-final`, `StacksService.setFinalMaster` / `clearFinalMaster`,
`ProjectsService.applyFinalMaster`, `AUDIO_MARKS`, `MasterSelectionSchema`, and
**every stored `masters` value**.

Nothing is deleted from the database. The operator has said the mix-and-master
workflow will be respecified; throwing away the marks already made would make
that harder rather than cleaner, and a schema migration to drop them would be
irreversible for no present gain.

## 12. Corrections to this document

§7's last bullet claimed the dossier's RECORD tab reports which release a
project is a track on. It did not — the list shipped in OVERVIEW's CREDITS
panel. It is in RECORD now, as a `RELEASES` panel, which is both what that
bullet specified and the right altitude: an appearance is read, not written.

It also carries the release master, with the file name, its size and a REVEAL
button. That is the half of D5 that makes referencing in place worth doing.

## 13. One deviation from the plan as approved

The masthead keeps its small artwork plate. The five-tab option as written said
it would not, ARTWORK owning the cover instead. Removing it would have made the
release sheet the only record surface in the console that cannot show its own
object, and the plate was already built.

## 14. No schema migration

`SCHEMA_VERSION` stays at 9. `credits`, `tracks[].master` and the appearance's
`trackId` and `master` all carry `.default()`, and `toRelease` parses every
document through zod on read, so existing releases hydrate with empty credits
and null masters. No stored project carries `released`. `INDEX_PLAN` unchanged.

## 15. A leaf module, again

`MediaFileSchema` moved from `projects.ts` to a new `domain/media.ts`.
`projects.ts` imports `ReleaseAppearanceSchema` from `discography.ts`, so
`discography.ts` naming a `MediaFile` would have been the **runtime import
cycle** §6.2 of PROJECT_CONTEXT documents — the one that killed the app at
launch on 2026-09-16 with `Cannot access 'IsoDateSchema' before initialization`.

Same fix as `dates.ts`: a leaf neither module owns, re-exported from
`projects.ts` so every existing importer keeps working. That rule has now paid
for itself twice.

---

## 16. D9 — the status set is cut to two, 2026-09-17

> **Decided against a recommendation to keep all five.** The trade-off below
> was stated before the choice and accepted; it is recorded so nobody
> re-litigates it, and so the cost is legible if it turns out to bite.

`RELEASE_STATUSES` was `idea` · `planned` · `scheduled` · `released` ·
`shelved`. It is now **`scheduled` · `released`** — either it is out or it is
not.

The operator's question was why four statuses other than RELEASED still
existed. Three of them had genuinely stopped earning their place the moment
TRACK READY became the gate into the catalogue:

- **`idea`** described a release under consideration. Nothing linkable is
  speculative any more: every track on an entry is work already declared
  finished in the ARCHIVE, so an entry is past being an idea by construction.
- **`planned`** was `scheduled` with no date — which a null `releaseDate`
  already says. Two ways to write one fact.
- **`shelved`** duplicated the project's own SHELVED *stage*, which is where
  parking work belongs.

### What this costs

**There is no status meaning "intended, not dated yet".** A null `releaseDate`
carries it instead, which is why `scheduled` deliberately does **not** require
one — and why its purpose string reads "Committed to, whether or not it has a
date yet" rather than the old "Dated and committed to".

**`scheduled` is now the default for a new entry**, so every release begins life
claiming to be committed to. That is the weakest part of the arrangement and
was raised as such.

**A shelved release becomes a scheduled one.** The v10 migration folds all
three removed values onto `scheduled`, so something the operator had parked now
reads as committed to. Nothing better is available: the status that meant
"parked" is gone, and inventing a date or dropping the entry would both be
worse.

### What moved with it

- The **SHELVED lens** goes too. A lens that can only ever select nothing reads
  as an empty shelf rather than as a category that no longer exists.
- `isForthcoming` is now the exact complement of `isPublic`. Kept as its own
  function rather than inlined as `!isPublic`, because "what is coming" is a
  different question that currently has the same answer — and a third status
  would have to touch both.
- The catalogue card's status tone drops from a three-arm ternary to two. The
  `offline` arm covered `shelved` and is unreachable.
- The **v9 migration** wrote `planned` for an undated volume or release. It
  writes `scheduled`, so a first boot on a pre-v9 database lands on a value
  that still exists.

### Schema version 10

`migrateReleaseStatuses` rewrites `idea`, `planned` and `shelved` to
`scheduled` in the `discography` collection. It drops nothing and rescans
nothing.

`DiscographyReleaseSchema.status` also carries `.catch('scheduled')`, which
makes an **unmigrated** document read correctly rather than being skipped as
unreadable by `toRelease`. That is the safety net for the gap between this
build starting and the migration finishing — not a substitute for the
migration, because without the rewrite the stored value stays `shelved` until
something happens to touch that release, and the database and the screen
disagree in the meantime.

---

## 17. D10 — the final master returns to the ARCHIVE, 2026-09-17

> Asked for directly: *"when we are in track ready, in the archive, we are
> required to select the final master file. Unless this is not set, the archive
> project cannot go to released stage."*
>
> This partly reverses D5 and the removal recorded in §11, one revision after
> them. The operator was offered the alternative — gate RELEASED but keep the
> pick in DISCOGRAPHY, changing no UI — and chose to have the picker back in
> the project. Recorded plainly so the reversal reads as a decision rather than
> as drift.

### Where the gate sits, and why not one stage earlier

On **`released`**, via `requiresMaster` — the seam §8 left on
`ProjectStageDefinition` when it came off `ready`. Re-arming it was a one-line
change, which is the whole reason the seam was kept.

It cannot go on `ready`. TRACK READY is what makes a project *linkable*
(§10), so requiring a file there while the file could only be chosen from a
linked release is the deadlock §8 exists to record. With the picker back in the
dossier the deadlock is gone either way — but RELEASED is still the honest
place for it, because that is the stage that makes a claim about the world.

### What the picker is now, and is not

`FinalMaster` on the dossier's OVERVIEW tab, live from TRACK READY
(`namesMaster`). One question — which of these bounces is the finished master —
answered against `project.audio`, and **nothing on disk moves**.

It is not MIX AND MASTER returning. That panel asked the operator to sort every
bounce into three buckets and then *promoted* one, moving it into
`Release Mastered Tracks` under a typed name. The buckets are still gone and
the move is still gone; D5's reasoning survives intact, and only the *location
of the question* has changed.

Consequently the move machinery is now **deleted rather than kept as a seam**:
`projects:set-final`, `projects:clear-final`,
`StacksService.setFinalMaster`/`clearFinalMaster`/`returnFinalMaster` and
`ProjectsService.applyFinalMaster`. §11 kept them because the workflow was
unspecified; it is specified now, so two writers for one field would be the
confusion D2 exists to end. One channel replaces two:
`projects:final-master { id, path | null }`.

`masters.final` keeps its name and its type. Its **meaning** widens from "the
file we moved into `Release Mastered Tracks`" to "the bounce that is the
finished master, wherever it sits". A legacy value still points into that
directory — a true path to a real file — so nothing migrates and the panel says
the file is outside the project rather than treating it as broken.

### The release takes a copy, and this is the load-bearing part

`track.master` is **copied** from the project's pick when a track is linked,
and left alone afterwards. It is not a read-through.

The project may change its mind — a remaster, a different render, a fixed fade.
A release that read through would rewrite what it claims to have shipped,
retroactively, on the one record whose job is to be right about what went out.
The track's own PICK MASTER still overrides, which is how a release says "the
label actually got this other file".

`masterFromProject` builds the descriptor, falling back to a path-derived one
with `sizeBytes: 0` for a legacy pick that is not in the scanned inventory.

### Two refusals, not one

- **The stage.** `applyStageChange` refuses `released` without
  `masters.final`, whichever path asks — the dossier's stage strip, the board's
  drag, the context menu, or DISCOGRAPHY's propagation.
- **The release.** `DiscographyService.update` refuses a flip to `released`
  outright while any linked project has no final master, **naming them**.

The second exists because of the first. Letting the flip succeed would leave
`reconcileLinkedStages` silently failing to move those projects — the catalogue
saying a track is out while the register says it is merely finished, which is
the disagreement the whole one-directional arrangement exists to prevent.
Counting them would send the operator hunting; the titles say where to go.

Clearing the master is refused while the project is at RELEASED, for the same
reason: it would produce the one state the gate forbids. Step the stage back
first. The panel hides the CLEAR control there rather than offering one whose
only outcome is an explanation.

---

## 18. D11 — tracks are capped per kind, 2026-09-17

The operator opened a SINGLE holding its one track and asked why ADD A TRACK
was still offered. Nothing stopped it: the only ceiling was a flat
`MAX_TRACKS = 60`, the same for a single as for an album.

`maxTracksFor(kind)` — **one** for `single` and `remix`, **forty** for the
rest. Chosen over two softer options that were put alongside it: flagging the
mismatch without refusing, and leaving the counts alone while explaining what
each kind means.

### The cost, which was stated and accepted

A single that ships with its own remix or an extended edit — `Original Mix`
plus `Nasko Remix` — is a normal two-track single on most stores. Under this
rule it must be filed as an `EP`. The operator was told this before choosing.

It also runs against the direction §7 took when `reconcileCategory`'s volume
invariant was removed and category became "the operator's own label, audited by
nothing". A release's *kind* is now audited. That inconsistency is deliberate
and worth knowing about: category describes a project, where nothing downstream
depends on it, whereas kind decides the shape of the record itself.

### Where it is enforced

- `addTrack` refuses past the ceiling, and the message names the way out —
  change the kind — rather than only the refusal.
- **`update` refuses a kind change that would overflow**, naming the count.
  Without it the rule is escaped in two presses: file four tracks as an EP,
  then change the kind to SINGLE. Truncating the tracklist to fit was the
  alternative and is worse — it destroys the operator's record to satisfy a
  label they can change back.
- `TrackList` hides ADD A TRACK at the ceiling and says what the kind holds.
  A live control whose only outcome is an explanation teaches less.

### `MAX_TRACKS` stays at 60, deliberately above every rule

`DiscographyReleaseSchema` is `safeParse`d by `toRelease`, which **skips** a
record it cannot read. Tightening the schema's own `.max()` to 40 would make
any stored release exceeding it vanish from the catalogue rather than merely
refuse the next write — losing data visibility to enforce a rule.

So the storage bound and the rule are two numbers on purpose: a rule can be
lowered safely at any time, a storage bound cannot. Verified by probe: an
over-long single still parses and still draws.

`maxTracksFor` is expressed through `seedsOneTrack` rather than re-listing the
kinds, because it is the same statement read twice — the kinds that *arrive*
with one track are the kinds that name one recording, so they are the kinds
that may *hold* one.

---

## 19. D12 — the sheet is centred, and the tab swap is animated

Two reports on the sheet as built, both fallout from splitting it into tabs.

### It was not centred

`.sheetBackdrop` used `align-items: flex-start` with 40px of top padding and
scrolled the backdrop itself. That is the correct pattern for a modal taller
than the viewport — centring one puts its top out of reach — and it was correct
while the sheet was a single long column.

Tabs made the sheet short, and a short sheet pinned 40px below the top of a
1000px window reads as a mistake. It now matches `ProjectDossier`, which had
this right all along: the backdrop centres, `.sheet` takes `max-height: 100%`,
and `.sheetBody` scrolls internally with `flex: 1; min-height: 0`.

That last declaration is load-bearing — without it a flex child will not shrink
below its content and the sheet grows past its own `max-height` instead of
scrolling. Bounding the sheet also keeps the masthead, the tab strip and CLOSE
in view at all times, which is the point of having tabs at all.

**ARTISTS got the same treatment**, because the header of
`DiscographyPage.module.scss` says to: the two sheets are read side by side and
the rules are deliberately duplicated rather than shared.

### The height jumped between tabs

`layout` on the sheet, with `sheetResizeTransition`.

The three fixed rows — masthead, tab strip, footer — carry `layout="position"`
rather than plain `layout`, and that distinction is the whole fix: motion
resizes a layout element by **scaling** it, so a masthead without the
positional variant is visibly squashed for the length of the animation.
Position-only means they travel and never distort.

The body is keyed by tab and **not** wrapped in `AnimatePresence`. With an exit
animation the outgoing tab must finish before the incoming one mounts, which
empties the body and collapses the sheet to a bare strip between every press.
Replacing outright and animating only the arrival keeps the height monotonic.

Rows arrive staggered through `sheetTabVariants` / `sheetTabItemVariants`,
which are new rather than `gridVariants` / `panelVariants`. Those are tuned for
a page arriving once — `y: 14`, `DURATION.slow`, a lead-in delay — and a tab
strip is pressed repeatedly. Shorter throw, no delay, tighter stagger: no tab
has more than four rows, so the last one lands about 90ms after the first.

All of it is gated on `useAnimationsEnabled()`. Note that a `layout` prop still
animates under `prefers-reduced-motion`, so gating has to *remove* the prop
rather than shorten its transition.

`ProjectDossier` needed none of this: it already staggers every tab through
`DossierGrid`, and its sheet has always been height-bounded.

---

## 20. D13 — FINAL MASTER becomes a tile grid

Four rounds of feedback on the panel D10 introduced, recorded together because
the end state only makes sense as the sum of them.

### Tiles, not a list

Asked for directly: *"could be large icons with its respective icon, and upon
selecting, we get a gold border to highlight that it is selected and we 'set as
final master'"*.

A bounce is an object being chosen between, which is what the tile grid is for
everywhere else in the department. `ArchiveIcon` gained an **`audio`** mark for
it — the first in that family with **no container**, and that is the
distinction: everything else there is a thing you open, so it has a silhouette
(a folder, a clipped document, a plate). A rendered file is not a place and
holds nothing, and drawing it as another document would make it read as a
second project sitting in the grid.

`TileGrid` was **not** reused. It is the archive's file browser — drag, marking,
context menus, open-on-double-click — and bending a browser into a picker costs
more than a dedicated grid that borrows the same visual construction.

### Selection is gold, and does not commit

Gold rather than crimson: crimson is the console's only saturated colour and is
reserved for focal points, live state and destructive actions. A staged
selection is none of those — it is the operator part-way through a sentence.
The ring and the mark both carry it, so selection never rests on colour alone.

Committing is a separate **SET AS FINAL MASTER** press. This is the one field in
the dossier that `released` is gated on, so a stray click must not be able to
change what the project claims shipped. Everything else on OVERVIEW writes
immediately, because everything else is cheap to correct. Double-clicking a
tile commits, because two clicks means "go" everywhere else here.

### No CHOOSE button in front of it

There was one for a revision. *"I don't need to hit the choose button to start
selecting the file, the default view should be seeing these icons."*

Correct, and the reason generalises: the panel has exactly one job, so a press
whose only outcome is revealing that job is a step with nothing on the other
side of it. The bounces are what the panel is *about*.

The staged pick is **derived**, not synced — `staged ?? chosen`, with a staged
path that has left the inventory discarded rather than drawn. The record
changes underneath this component whenever a rescan lands, and a copy held in
state would then select a file that is no longer there.

### Two rendering bugs the tiles introduced

- **Borders sheared on hover.** `overflow-y: auto` makes `overflow-x` compute
  to `auto` as well, so the grid clips on all four sides — and a scroll
  container clips at its *padding* box. The `translateY(-2px)` hover lift took
  the top border out of bounds, and the first tile in each row lost its left
  edge. Fixed with padding on the container: `gap` only separates tiles from
  each other and does nothing at the container's own edges, which is exactly
  where it showed.
- **The selection ring was clipped for the same reason.** It was
  `box-shadow: 0 0 0 $hairline`, which paints *outside* the border box. Now
  `inset`, which doubles the border's apparent weight with nothing extending
  past the element, so it cannot shear however the tile is transformed.

### The commit sits at the trailing edge

Where this console puts the verb that completes a sheet — the dossier's footer,
the release sheet's, every dialog. It led the row for a revision, beside a grey
line explaining the disabled states; both are gone. The selected tile is the
subject and the button is the verb, and the line between them was narrating
what the operator could already see.

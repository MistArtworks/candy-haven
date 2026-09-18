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

---

## 21. D14 — auditioning a bounce goes through the shared transport

*"I need to be able to play the track before I set the master."* Obviously
right: four renders of one track are not told apart by their filenames.

### The mistake worth recording

A `useBouncePreview` hook was written first — its own `<audio>` element, its
own blob URL, its own play/stop state, scoped to the panel. It worked, and it
was wrong, and it was thrown away before it shipped.

The console already has **one transport for the whole application**.
`PlaybackProvider` sits above the router in `App.tsx` and owns a single
`<audio>` element for the console's life; `usePlayback()` reaches it from
anywhere; `MiniPlayer` draws its controls as chrome in `ConsoleLayout`.

Both of the things needed here were already built *for this case* and said so
in their own comments:

- `MiniPlayer` — "something admitted in AUDITORIUM, **or played from a release
  in the ARCHIVE**, keeps playing while the operator works anywhere else — and
  this is where they can still reach it."
- `isPlayableAudio` — "used to decide whether to **offer** playback beside a
  file elsewhere in the console."

The local hook gave the operator two transports that could both be sounding,
and it stopped when the dossier closed — the opposite of what a shared one is
for. **Read the comments on the seam before building a second one.**

### What the panel does now

Each tile carries a `▶` that calls `playback.open(file.path)`, or
`playback.toggle()` when that file is already loaded — reopening would re-read
the whole file over IPC and restart it from zero, which is not what a second
press means anywhere else. The control is drawn only for extensions
`isPlayableAudio` accepts.

**Listening is not choosing**, and the two are separate states: the gold ring
says which file is selected, a crimson `▶` says which is audible. Crimson is
correct there and nowhere else in the panel — it is live state, which is what
the accent is reserved for. The play button stops propagation so auditioning
cannot move the selection.

Committing deliberately does **not** stop playback. The local preview did, on
the reasoning that the question had been answered; that was right for a
transport the panel owned and wrong for a console-wide one, which must not stop
because an unrelated field was written.

### Also found while doing this

**zod is in the renderer bundle** — 351 matches in the app chunk. §6.2 of
PROJECT_CONTEXT claims the domain split "keeps zod entirely out of the renderer
bundle — worth ~170 kB", and that has not been true for some time: ten domain
modules that import zod are value-imported by renderer code, including
`auditorium`, `calendar`, `projects`, `stacks`, `discography` and `timer`.

Not caused by this change and not fixed by it — the remedy is a `.constants.ts`
half for each, which is its own job. Recorded so the claim in §6.2 is not
mistaken for a fact.

---

## 22. D15 — the chrome is always on top, and overlays centre inside it

Three reports in sequence, and the third is the one that mattered: *"the modal
should be in the center of the container which is excluding the title bar's
height and the music player's height."*

### The chrome outranks modals now

`$z` was reordered. The title bar and the transport share a new **`chrome`**
layer at 75, above `modal` at 70. Both sat on 30, below every overlay, which
was harmless only while nothing could start playback from inside a modal — the
moment a bounce could be auditioned from the dossier, the controls for a sound
the operator had just started were behind the sheet that started it.

**`boot` moved to 85, above `chrome`.** `App.tsx` renders the console *and* the
boot screen together while the boot screen exits — `showConsole` and `showBoot`
are both true for the length of that transition — so a title bar above the boot
layer would punch through the cinematic on every launch. That is not a
hypothetical: it is why the layer could not simply be raised.

### `overlay-field()`

Eleven overlays had each written out the same thing by hand — `position: fixed;
inset: 0`, a z-index, flex centring, some padding. Eleven chances to disagree,
and they did, on padding and on whether they scrolled. They now share one
mixin, which is also the only place that knows about the chrome:

```scss
padding: calc(#{space($pad)} + var(--ch-titlebar-height, 0px)) #{space($pad)}
  calc(#{space($pad)} + var(--ch-transport-height, 0px));
```

**Padding, not `top`/`bottom` insets.** The scrim still has to reach the
window's edges — the dim means "the page is not interactive", which is true of
the page behind the title bar too — while the *centring* happens inside the
chrome-free region. A child with `max-height: 100%` is then bounded by the
content box, which is exactly that region, so the sheets needed no change.

`ErrorBoundary` is deliberately excluded and says so: it is the crash screen,
and the tree that draws the chrome is what has just failed, so reserving room
for it would leave a gap where nothing is painted.

### One number for the transport's height

`--ch-transport-height` is `0px` by default and `$transport-height` under
`:root[data-transport]`, which `MiniPlayer` sets while it exists.

An attribute rather than a measured pixel value. The obvious implementation
reads the bar's `offsetHeight` in an effect and writes it to the root — it
works, and it makes the correct value depend on when that effect runs relative
to the bar mounting. This way the number exists once, as the Sass token the bar
is sized from, and JavaScript reports only the thing CSS cannot know: whether
the bar is there.

On `:root` and not on the shell, because **every overlay is portalled to
`document.body`** — a variable set inside the shell inherits down to the page,
never sideways to a body-level portal.

## 23. D16 — popping the player out carries its position

*"If it is playing and we're at 0:20 and we popped it out, it needs to continue
playing from that moment in the popped window."*

`auditorium:popout` now takes `at` and `playing` alongside the file, and they
travel in the popout's query string beside it. The popout seeks and resumes on
arrival; the window that handed over **pauses itself**, so the sound moves
rather than sounding twice a few milliseconds apart.

A one-shot, not a synchronisation. After arrival the two windows are
independent transports again and agree only on which file is open, over
`auditorium:announce` — which is the arrangement `PlaybackProvider` documents
and this does not change.

Three details that are each load-bearing:

- **The seek waits for `duration`.** `seek` refuses while it is not finite, and
  the element has the blob long before it has read the metadata — so a seek
  fired when `open` resolves is silently dropped and the handover looks broken.
  The effect watches `duration`, which is watching for the moment seeking
  becomes possible.
- **It is guarded by a ref.** Without one, pausing at 0:05 in the popout
  re-runs the effect on the next `duration` change and throws the operator back
  to the handover point — a player that fights being used.
- **`autoplayPolicy: 'no-user-gesture-required'` on the popout window.**
  Chromium counts gestures per document, and the press that detached the player
  happened in a different window. Without it the popout arrives loaded, seeked
  and silently paused.

---

## 24. D17 — naming a master raises a single, and the dossier links to it

*"Once we have selected the master track, the discography automatically creates
a single (default) item with that respective project. The user will then have an
option to go to that specific modal through the archive project modal."*

### The auto-raise

`DiscographyService.ensureSingleFor(projectId)`, called from
`ProjectsService.setFinalMaster` **after** the record is written.

The entry is a `single`, titled after the project, credited to whatever the
project credits, carrying the master just picked (via `masterFromProject`), and
`scheduled` with no date — **not** `released`. Naming the file that ships says
the work is finished, not that it is out in the world, and a null `releaseDate`
on a scheduled entry is exactly "going out, when is not fixed yet" (D9).

### Idempotency is the whole of its correctness

This is driven by an event that **repeats**: a master can be re-picked any
number of times. So it returns null rather than creating when the project
already appears anywhere in the catalogue, on a release of any kind — a track
already on an album does not also want a single raised for it.

Probed: three consecutive calls leave one entry, and a project already on an
album gets nothing.

### It cannot break the pick

The raise is wrapped and swallowed with a warning. The master pick is what the
operator asked for; the catalogue entry is a convenience on top of it. Refusing
the pick because a second record could not be created would be the tail wagging
the dog — and it would leave the RELEASED gate unsatisfiable for a reason that
has nothing to do with the file.

Ordering matters: the repository write happens first, so the release's track
copies a master that is already stored.

### A fourth callback, and the first that writes

`projects.setReleaseRaiser()`, wired in the composition root beside
`setFilingResolver`, `setTagResolver`, `setArtistResolver` and
`setAppearanceResolver`. Same inversion for the same reason — discography reads
the register through projects, so projects cannot import discography — but the
first of them that asks the other service to *create* something rather than
hand data back.

### The crossing

`?release=<id>` on DISCOGRAPHY, read with `useSearchParams`, replacing the
local `openId` state.

Local state was enough to open a card by clicking it. It is not enough to be
*arrived at*, which is what a link from the dossier requires. The shape
deliberately matches ARCHIVE's own `?project=<id>`: two record surfaces,
addressed the same way, both replaced rather than pushed so opening and closing
a sheet does not build a history stack.

RECORD's RELEASES panel carries **OPEN IN DISCOGRAPHY** per appearance — per
appearance, not once for the panel, because a project on a single and then an
album has two and a single control would have to ask which. Navigating closes
the dossier for free, since the open dossier is itself a URL parameter.

---

## 25. D18 — clearing the master withdraws the single it raised

D17 raised a single when a master was named and left nothing to undo it. The
operator cleared a master and the single stayed: an entry they had never asked
for, which they then had to find and delete by hand.

### Why this is not simply "delete the release for that project"

Because by the time the master is cleared, the entry may be **theirs**. A label,
a catalogue number, artwork, a second track, a changed title — deleting a
record somebody has filled in, because they cleared an unrelated field on a
project, is a far worse outcome than leaving a stray single behind.

So the entry records its own provenance. `DiscographyRelease.raisedFor` holds
the project id **only while the entry is still untouched**, and **any operator
edit sets it back to null**:

- `update` — any field
- `writeTracks` — the funnel every tracklist change goes through
- `setAsset` — artwork or canvas, set or cleared

Null therefore means either "raised by hand" or "raised automatically and since
edited", and both say the same thing to every reader: do not touch it.

A boolean would have done, but the project id is strictly more useful — it
records *why* the entry exists and lets the withdraw find its target directly
rather than inferring it from the tracklist.

The alternative considered and rejected was a "still pristine" check: compare
the release against what the auto-raise would have produced. It needs no schema
field, and it rots the moment a field is added — every new column is one more
thing to remember to compare.

### One reconciler, both directions

`ensureSingleFor` became `reconcileAutoSingle(projectId)`, and
`ReleaseRaiser` became `ReleaseReconciler`. It reads the project's stored
`masters.final` and decides for itself:

| Stored state | What it does |
| --- | --- |
| a master is named, project not in the catalogue | raises a single, stamping `raisedFor` |
| a master is named, project already on any release | nothing |
| no master, a release still carries `raisedFor` | deletes that release |
| no master, nothing carries `raisedFor` | nothing |

`setFinalMaster` calls it from **both** branches through one private
`syncCatalogue`. The caller does not say which way the change went — the
discography reads the record — so there is one source of truth for the decision
and no way for the caller to describe it wrongly.

Still swallowed on failure, for the reason D17 records: the master pick is what
the operator asked for, and the catalogue entry is a convenience on top of it.

### Verified

Twelve assertions, and the ones that matter are the four where the release must
*survive*: after a field edit, after a tracklist edit, when raised by hand, and
when the project is already on an album.

One of them caught a probe bug rather than a code bug, which is worth recording
— `addTrack` on the auto-raised single was refused, because a single holds one
track (D11) and it already had its seeded one. The cap and the auto-raise agree.

### Existing entries are not retrofitted

`raisedFor` defaults to null, so a single raised automatically **before** this
change reads as hand-raised and will not be withdrawn. There is no honest way
to tell the two apart after the fact, and guessing would risk deleting real
work. Delete such an entry by hand once; everything raised from now on carries
its provenance.

---

## 26. D19 — an auto-raised entry is read-only until adopted

*"The item in discography should be read only until the user edits it
manually."*

`raisedFor` already carried exactly the right distinction (D18), so this is the
same flag read a second way: while it is set the sheet **reads**, and adopting
the entry clears it.

### Why a lock is the honest offer

Until it is adopted the entry is a *projection* of the project. The app made
it, and the app withdraws it again if that master is cleared — so a form over a
record that may vanish underneath the operator is the wrong thing to present.
Adopting it is the operator saying the release is real, and from that moment
nothing removes it on their behalf.

The two behaviours now line up exactly: **the locked entries are precisely the
withdrawable ones.**

### A disabled fieldset, not twenty props

Every control in the sheet's body is a native form element — `input`, `select`,
`textarea`, and `Button`, which renders a `button`. `fieldset[disabled]` takes
all of them out of reach, keyboard included.

The alternatives were worse. A `pointer-events: none` overlay leaves every
field reachable by Tab. A `disabled` prop threaded through five tabs of
controls is twenty call sites, and the twenty-first added later will miss it.

The body's flex column moved onto the fieldset, so the layout, the gaps and the
tab stagger are unchanged. A fieldset's default border, margin and padding are
reset.

### What stays live while locked

The **tab strip**, **CLOSE**, and **REMOVE FROM CATALOGUE** — all three sit
outside the body, so a locked entry can be read in full across all five tabs,
closed, and thrown away. Reading and discarding are not editing.

The **ADOPT** bar sits above the body and outside the fieldset, which is the
point: the one control that unlocks the record is the one control the lock
cannot reach.

### `discography:adopt`

Its own channel rather than an empty `update` — which would work, since
`update` clears `raisedFor` unconditionally, and would read as a trick. "I am
adopting this record" is a statement in its own right and reads as one at every
layer. Idempotent, and a no-op on anything raised by hand.

Worth noting why opening a locked sheet cannot adopt it by accident:
`useEchoedText` adopts the remote value in an effect by calling `setLocal`, not
`commit`, so mounting the form writes nothing.

## 27. D20–D22 — release dates on the calendar, and a publishable folder

*"Once a discography item is scheduled for release with a date and it's saved,
then we add the release date in the calender for the day of release. So once
all the details are entered, I need to add a button saying 'Ready to publish'.
This basically exports a folder with all assets in `/RELEASES`."*

Two things, asked for together and independent of each other: the date has to
leave the department, and the assets have to leave the app.

---

### D20 — the calendar reading is derived, never written

`calendar.ts` had already specified this, before there was anything to project:

> Anything that later wants to appear on the calendar without being one of
> these — a release date held on a release record — belongs in a projection
> over this, not in this schema.

Following it costs one callback and avoids the whole class of problem D17 and
D18 needed `raisedFor` to solve. The alternative — filing a real
`CalendarEntry` on the release date — means two records holding one fact, a
sync on every edit of either, a rule for who wins when they disagree, and a
migration for every release already in the catalogue.

- `CalendarState` gains `releases`, **beside** `entries` rather than merged
  into it, so `entries` stays exactly what the domain note says it is: the
  operator's own dated statements. `CalendarRelease` is
  `{ releaseId, title, kind, status, date }` and nothing more — a marker needs
  a label and a destination, not a copy of the record.
- `CalendarService` reads them through `setReleaseDateReader`, the fifth
  cross-service callback wired in the composition root, for the same reason as
  the four before it: the calendar cannot import the discography service.
- `scheduledDates()` returns every release carrying a date, **whatever its
  status**. A released record is still a thing that happened on a day, and the
  register is a register.

#### It is read on every build, and that is the point

`state()` had to become async. An earlier pass kept a synchronous one for
`publish()` to use, reasoning that filing an entry should not wait on the
catalogue — and that pass was wrong in a way worth writing down: the push it
emitted carried an empty `releases`, so **filing any entry erased every
release marker on the page** until it was reopened. The read is against a
local database and an entry write is a deliberate act behind a dialog. There
was nothing to buy and a whole projection to lose.

#### The other direction: `CatalogueListener`

A date moving in the catalogue is invisible to a service that holds no copy of
one, so the discography tells it. `setCatalogueListener` is the first callback
here that exists purely to say *something changed* — no payload, because
anything more specific would be the catalogue guessing at what the calendar
draws. Called after create, update, delete and auto-withdrawal, and swallowed
on failure: a calendar that did not hear is a stale marker, which is not worth
failing a write the operator asked for.

#### `ReleaseMark`, and why it is not a chip

Read-only, and built out of different parts so that reads at 10px: a gold seal
instead of a tone bar, an institutional title instead of sentence text, and no
mark to tick. Pressing it leaves for `/discography?release=<id>` — the link
added in D17 — because there is nothing here to open. A dialog over a
projection would be a form that keeps nothing, and a marker that could be
dragged would make the calendar a second writer of a date the catalogue owns.

It lands in all four views, and each one had something to say about it:

| View | Where |
| --- | --- |
| `MonthView` | ahead of the chips, and **never** counted by `CHIPS_PER_CELL` — a release is not something to hide behind "+2 more" |
| `TimeGrid` | the existing **all-day band**, which a release qualifies for by having no time of day; `terse` in the week's narrow columns, full in the day's one wide one |
| `DayView` | a ruled band above the sheet's entries — and `THE DAY IS CLEAR.` now checks both lists, because a day with a release out is not clear |
| `AgendaView` | folded into the **grouping**, not drawn per-section: a day whose only business is a release has no entry to group under, and the ledger is the last view to hide "what is coming" from |

Folding release dates into the agenda's grouping cost it its free sort order —
the day list was in insertion order and correct only because every day came
from an already-sorted entry list. A release can open a day in the middle of
it, so the order is now made rather than inherited.

---

### D21 — the export handles every kind

The request described a single. Numbering falls out of `maxTracksFor` already
allowing forty, so an EP, album or compilation exports as one folder of
numbered files.

| Kind | Audio |
| --- | --- |
| one track | `<folder name>.<ext>` — named exactly as the folder, as asked |
| many tracks | `NN <main artists> - <track title>[ (feat. …)].<ext>` |

Plus, in both cases: `Cover Art.<ext>`, `Spotify Canvas.<ext>` — each keeping
its own extension rather than being converted — and `Release Details.txt`.

**Three conventions chosen rather than specified**, since the request only
described the single:

1. `NN` is the running-order position, zero-padded to two. Positions are
   already contiguous: `writeTracks` renumbers on every tracklist change.
2. A track's `(feat. …)` is its **own** `artistIds` minus the release's main
   artists. `addTrack` copies a project's credits into the track, so those ids
   routinely include the main artist, and using them raw would print
   `(feat. Candy Heist)` on Candy Heist's own record.
3. A track with **no master is skipped, not fatal** — named in
   `Release Details.txt` and returned in `skipped` so the sheet says so.
   Blocking would make a back catalogue unpublishable: a label master is a
   track that legitimately has no file here.

#### Copied, never moved

The master in the folder is a copy. The project's own pick keeps pointing at
the bounce where the operator put it, and a distributor folder is a thing you
can delete without having deleted your work.

#### Re-publishing replaces

A second publish writes into the **same** folder and overwrites what is in it,
rather than making `… (2)`. Publishing again after fixing the artwork is the
common case, and `freePath` would leave a litter of near-identical folders with
no way to tell which one the distributor actually got.

#### What it refuses

Only what makes the export meaningless, and each refusal names the gap: no
tracks, no master on **any** track, no artwork, no release date — and while the
entry is **unadopted**, because publishing presumes the record is real and an
unadopted entry is one the app will withdraw if the master is cleared (D18).

The button is offered even when the record is incomplete, and the service
refuses with the list. A disabled button would have to re-derive those five
conditions in the renderer, and would then be a second opinion about them that
could disagree with the first.

#### `Release Details.txt`

Everything a filename cannot carry: title, subtitle, kind, status, date, main
and featured artists, the liner-note credits, label and label URL, catalogue
number, UPC, ℗ and ©, the platform links, notes, and a per-track block with
position, title, ISRC and which file shipped as it — including `no master` for
anything skipped. An empty field is **omitted** rather than printed with a
dash: a distributor reading a blank UPC line learns nothing that its absence
does not say better.

---

### D22 — features read `(feat. …)`

Main artists join with commas and a final `&`:

```
Candy Heist
Candy Heist & Nasko
Candy Heist, Nasko & Mist
```

and the folder is `<main artists> - <title>[ (feat. <featured>)]`, with the
bracket omitted entirely when there are none.

#### `safeSegment`, and why it scans

Every segment goes through it, so a title carrying `:` or `/` cannot produce an
unwritable path. `/`, `:` and `\` become `-`; `"`, `*`, `?`, `<`, `>` and `|`
are dropped; tabs and newlines fold to spaces; control characters go.

It scans code points rather than matching a character class, the same choice
`stacks.constants.ts` documents for its own validator — a regex class of
control characters is a thing nobody can read six months later, and this one
got written twice because a literal NUL in a patch script is invisible until
git calls the file binary.

`billedAs`, `featuring`, `releaseFolderName`, `trackFileName` and
`trackFeatureIds` are all pure and live in `discography.constants.ts`, zod-free,
so the renderer can show the operator the name before anything is written.

#### The filesystem half is not in the service

`publish.ts`, beside `media.store.ts` and for the same reason: the service
decides *whether* to publish and what the refusals are, and this decides where
the bytes go. It takes the releases root and an artist-name resolver as
arguments rather than reaching for either, which is what let a probe run it
against a real temp directory — a single, an album with a masterless track, and
a re-publish, 13 assertions — without an Electron app around it.

---

### What came next

Nothing here fetches anything, and a release date passing does not go and find
the Spotify link. The platform set, the pre-save links before release and the
stream links after it became **D23** below; automatic retrieval is still
ahead of both.

## 28. D23 — platforms, pre-save links and stream links

*"We need to also add platforms a project is gonna be distributed [to], and for
all the selected platforms, once it is released the user should enter the
stream links. Before release, it would be nice to also enter the pre-save links
as well."*

`links[]` modelled **where a record already is**, which is half of how a
release works. The operator picks the stores before anything exists, hands out
pre-save links in the run-up, and goes back after release day to fill in the
real addresses. A flat list of URLs cannot say *"Spotify is on the plan and has
nowhere to point yet"* — the one question worth asking in the week around a
release.

Asked which way to take it, the operator delegated: *"do whatever you think is
recommended, if it's something which is not necessary then we can skip it."*

### One list, replacing "Where it is"

`links[]` is **replaced**, not joined by a second list. Two lists in one tab
would both read as "links", and nothing would stop the same Spotify URL going
in either — the duplicate-fact problem this department has now refused three
times: the calendar projection (D20), `raisedFor` (D18), and volume membership
before either.

```ts
export const ReleaseDistributionSchema = z.object({
  id: z.string(),
  platform: z.enum(DISTRIBUTION_PLATFORMS).default('other').catch('other'),
  label: z.string().default(''),
  presaveUrl: z.string().default(''),
  streamUrl: z.string().default('')
})
```

Permissive on purpose, copying `ReleaseLinkSchema` exactly: `toRelease`
`safeParse`s the record and **skips** one it cannot read, so a strict field
here would make a release vanish from the catalogue rather than refuse the next
write. The same reasoning as `MAX_TRACKS` staying above `maxTracksFor` (D11).

`ReleaseLinkSchema`, `ReleaseLink` and `MAX_RELEASE_LINKS` are gone.
`ArtistLinkSchema` was always a separate declaration, so ARTISTS is untouched —
but `LinkEditor`'s comment claimed the two were "the same object", and that
claim is now false and has been corrected rather than left to mislead.

### The platform set is not `SOCIAL_PLATFORMS`

```
spotify · apple · youtube · soundcloud · bandcamp
beatport · amazon · deezer · tidal · other
```

That set carries `instagram`, `tiktok`, `x` and `website` — none of them
somewhere a release is distributed — and lacks the three services that matter
most after the big two. The two lists were the same object while both meant "a
platform and a URL". They stopped being the same object the moment one of them
grew a pre-save slot.

`other` is the escape hatch and the only entry that may repeat: a pre-save
gate, a smart link, a shop nobody has heard of. It is also the only one whose
`label` is read, because the rest can name themselves.

**Nothing guesses the platform.** `guessPlatform` exists for a pasted URL, and
here the platform is chosen from a menu *before* there is a URL to guess from,
which is the point of the feature.

### The guard had to change, and this is the sharp edge

`update`'s link guard ran `checkLinkUrl` over every row's address and threw on
a failure. `checkLinkUrl` **refuses the empty string** — so carried over
unchanged, that guard would have refused to save a platform the operator had
picked but had no address for yet, which is the first thing this feature has to
allow.

It now validates per *slot* and skips the empty ones. A probe over the real
`checkLinkUrl` records why that `continue` is load-bearing rather than tidy:
empty is refused, whitespace is refused, `file:` and `javascript:` are refused,
a finished address and a DistroKid pre-save gate both pass.

### Schema version 11

`links[]` → `distribution[]`, per document, and **nothing the operator typed is
thrown away**:

| Old link | Becomes |
| --- | --- |
| a platform the new set also has | that platform's row, address as its `streamUrl` |
| a social, a website, a bare `other` | an `other` row, keeping its own label |
| a **second** link on a platform already used | an `other` row labelled with the platform it came from |

`presaveUrl` is empty on every migrated row and has to be: an existing link is
somewhere the record already is, nothing stored said anything about a pre-save,
and inventing one would be worse than leaving the slot open.

**Idempotent by inspection**, which this machinery requires rather than
prefers. The version stamp is written once at the end of `applyMigrations` for
`SCHEMA_VERSION` alone, so a throw anywhere re-runs every step from `from`
onward — and a step that throws deterministically leaves the app on SEQUENCE
HALTED behind a retry button that loops. So the filter is
`{ links: { $exists: true } }` and each write `$unset`s `links` as it `$set`s
`distribution`: a second pass matches nothing.

Version 9 mints releases carrying `links: []`. Left alone — it runs before this
one in the same pass, so its empty list is picked up and unset like any other,
and editing a past migration's payload would change what an already-migrated
database was told for no gain.

#### The first migration here to be probed

`distributionFromLinks` is a **pure exported function** in
`discography.constants.ts`, taking a loose structural input because it reads
unmigrated documents and cannot assume the shape zod would have guaranteed.
That is the whole reason it is there rather than inline in `schema.ts`: 26
assertions drive every row of the table above with no database, which no
migration in this project had before.

It earned its keep immediately. The probe caught a real defect: an old link
already on `other` with no label was being labelled `OTHER`, which
`distributionLabel` says by itself anyway — so the fallback now distinguishes
"displaced from a platform it could not have" from "was never anywhere else".

### `DistributionEditor`, and why it is not `LinkEditor`

`LinkEditor` is a flat list of one-address rows whose URL is a **read-only**
`<code>` element — pasted once at the bottom, and edited by removing and
re-adding. This is a planned set: platform first, addresses later, and a row
with neither. Bending one component across both would leave it serving two
layouts through flags.

#### Committed on blur, not on change

The load-bearing detail. A URL patched per keystroke is one IPC write per
character, and every one of those writes but the last carries a half-typed
address that `update` now refuses — so typing a Spotify link would throw about
thirty times before succeeding. Committing on blur or Enter makes an edit one
write of one finished value.

An invalid address is **kept on screen and not committed**, with
`checkLinkUrl`'s own reason underneath. Discarding what somebody just typed
because it was unfinished would be worse than holding it.

The adopt-the-remote-value effect is guarded by **focus**, which is the
ownership rule `useEchoedText` was written for after pushed state ate
keystrokes: while somebody is typing here, a value arriving from outside is
stale by definition. That guard is also what satisfies
`react-hooks/set-state-in-effect`, which flagged the unguarded version.

#### Both slots always on screen

Only the emphasis moves, following `status === 'released'`: before, PRE-SAVE
reads live and STREAM sits muted; after, the reverse. Hiding either would be
wrong in both directions — a Beatport pre-order is a stream address that exists
weeks early, and a pre-save link is worth keeping as a record long after it
stops working.

`status` is the signal and not the date. Deriving "is it out" from
`releaseDate <= today` as well would be a second opinion about a fact the
operator has already written down, and the two could disagree.

#### The nudge, and the badge

When the record is out and rows have no stream link, one line says so —
*"OUT, AND 3 PLATFORMS HAVE NO STREAM LINK YET."* — and the TRADE tab carries
the count as a badge beside the ones TRACKS and CREDITS already have. Only
once it is out: before release an empty stream slot is the normal state, and a
badge counting it would be a warning about nothing.

That is what the request was actually asking for. *"Once it is released the
user should enter the stream links"* is a prompt, and the app is the only thing
in a position to give it.

### `Release Details.txt`

`WHERE IT IS` becomes `DISTRIBUTION`, printing both addresses per platform. An
empty slot is omitted per the file's existing rule — **except** a missing
stream link on a release that is out, printed as `no link yet`, because there
the absence is the actionable fact. The same treatment the running order gives
a track with no master.

Publishing is not refused over any of this. Distribution links are not assets.

### Still open

Nothing fetches anything. *"In future updates, once a song has reached a
release date, it AUTOMATICALLY gets all the streaming links and saves it to the
discography project item. But we will discuss possible pipelines once we get
these basic features done."*

The shape is chosen so that can land without another migration: a row already
exists per platform with an empty stream slot, and a `source` or `fetchedAt`
field could join it without touching anything that reads one.

## 29. D24 — the sheet opens as a record, and EDIT is asked for

> **Superseded in part by D25.** The rule below stands; the *implementation*
> described here — disabling the form — lasted one commit and was replaced by
> a real details view. Read this for why reading and writing are separate
> acts, and D25 for what reading actually looks like.

*"Not sure why you are not making this read only? This is the third time I am
telling you this — this should be read only with an edit button to edit the
discography item, right now everything is editable as default."*

Said three times, and the third time was a correction of me rather than of the
code: I had been reading it as D19's adopt lock, which is a different rule
about a different thing. This is every release, always.

### Why the request is right

Nothing in this sheet is staged. Every field commits as it changes — through
`useEchoedText` for text, immediately for a chip — which is what the rest of
this console does and what makes a catalogue quick to keep. The cost of that is
an open form over finished work: on a record that is already correct, anything
the operator brushes past while reading is a write.

So reading and writing become separate acts and the second one is asked for.
`editing` is `false` on every open, and the sheet is keyed by release id at its
call site, so opening the next record cannot inherit the last one's mode.

### Two refusals, kept apart

```ts
const locked = release.raisedFor !== null   // the app: not yours yet (D19)
const readOnly = locked || !editing         // the operator: not asked to change it
```

They are different statements and the ways past them differ: ADOPT for the
first, EDIT for the second. An unadopted entry is therefore read-only twice
over, and its ADOPT button now sets `editing` on the way through — which is
what the bar beside it has always promised (*"adopt it to make it yours and
start editing"*).

The EDIT button is not offered while `locked`. There the ADOPT bar is the only
honest way in, and a second button claiming to unlock the same form would be a
dead end.

### DONE, not SAVE

There is nothing to save. Every field has already written, several keystrokes
ago, and a button labelled SAVE would promise a commit that had already
happened — and imply that pressing CLOSE instead would discard something.

### The anchors, which are load-bearing

`fieldset[disabled]` was already the lock (D19) and it does the job properly:
it reaches every input, select, textarea and button beneath it, keyboard
included. Reusing it for view mode exposed something that had not mattered
while the only locked entries were unadopted ones — it reaches the affordances
that only *read*, too:

- the track master's `♪ filename`, which shows the file in Explorer
- DISTRIBUTION's OPEN, which follows a pre-save or stream link

Both now render as `a` elements rather than `button`s. `disabled` on a fieldset
applies to form-associated elements, and an anchor is not one, so these survive
the lock by construction rather than by a list of exceptions somebody has to
maintain. Each carries `role="button"`, `tabIndex={0}` and an Enter/Space
handler, so nothing is lost to the keyboard.

That distinction is the same one D19 drew in words — *"reading and discarding
are not editing"* — finally applied to the two controls that were quietly on
the wrong side of it. The most likely thing anybody wants from a finished
release is to go and hear it.

### What stays live while reading

The tab strip, CLOSE, REMOVE FROM CATALOGUE (behind its confirmation), READY TO
PUBLISH, and the two anchors above. Publishing is deliberately among them:
writing a distributor folder changes no record, so it is not an edit, and
having to press EDIT to publish a finished release would be a lock standing in
front of the thing the record exists for.

## 30. D25 — the details view, which is what D24 should have been

*"This was hella lazy. I meant I need a new UI for the modal so we can have a
details sort of a view, and when you edit, the view we have rn is what we are
supposed to see."*

Correct, and the word was fair. D24 got the *rule* right — the sheet opens as a
record — and then implemented it by switching a form off. A greyed-out form is
not a record. It is twelve input boxes with their affordances removed, which
reads as broken rather than as finished, and it left the operator looking at
empty grey wells where a released record should have been telling them things.

So there are two renderings of one release now:

| | |
| --- | --- |
| **Reading** | `ReleaseDetails` — one page, the default on open |
| **Editing** | the five-tab form, unchanged, behind EDIT |

### It cannot write, rather than declining to

`ReleaseDetails` takes `release`, `roster` and `projects`. No `onPatch`, no
mutation props, no state. The read view's inability to change the record is
**structural**: there is nothing in it to disable, and nothing for a later edit
to leak through. That is the difference from D24 in one line — a disabled
writer is still a writer.

### The house record idiom, not a sixth one

Numbered `Panel`s in a six-column grid holding `Field`/`FieldGrid` pairs. That
is exactly what `DossierRecord` does for a project, and a release and a project
are the console's two record surfaces; they should not be read differently.
Inventing a new presentation for this sheet is how a design language dies.

Six panels, in the order the tabs already use — what it is, what it looks like,
who made it, the paperwork, what is on it, where it goes:

```
01 THE RELEASE   span 4      02 ARTEFACTS  span 2   (the cover, large)
03 CREDITS       span 3      04 TRADE      span 3
05 RUNNING ORDER span 6, focal
06 DISTRIBUTION  span 6
```

RUNNING ORDER is the one `focal` panel, as set analysis is on a project's
record: it is the substance of a release. The cover is drawn large in ARTEFACTS
because D12 had already settled that it is *"the one thing on a release worth
drawing large"* — the masthead's 96px plate says which record is open, and this
says what the record is.

### One page, and this does not undo D12

D12 moved the *form* off a single scroll for reasons it stated precisely:

> twelve fields, a credit picker, a tracklist, six identifiers and two asset
> wells in a single scroll

Every item on that list is an **editing** affordance, and none of them is in a
read view: twelve fields are twelve lines of type, the credit picker is two
lines of credits, the two wells are one cover. What D12 costed was working at
one altitude, not reading at it. The tabs are untouched and still navigate the
form — they simply live inside the editing branch now, because a live tab strip
above a page that ignored it would be a control that does nothing.

The operator chose one page over keeping the strip in both.

### Every field shows, and a gap reads as a dash

Not hidden. This sheet's job is getting a release complete enough to go out,
and `publish` refuses on a missing date, artwork or master — so the panels
double as the pre-flight check that says which one is missing. `formatIsoDate`
already returns `—` for a null date, which is where the convention comes from,
and `DossierRecord`'s own rule applies: a labelled column can carry an em dash
and still mean something.

Empty *sections* say so in words rather than standing blank — *"No tracks yet.
A release cannot be published without at least one."* A consequence worth
having: because nothing is conditional, no panel renumbers itself the way
`DossierRecord`'s conditional RELEASES panel forces the one after it to.

### Two fields that had no surface at all

A track's `notes` is written by `TrackDialog` and was then drawn **nowhere** —
the running order has no room for it and the form never asks again. A record
that claims to tell you everything is the right home for the one field that had
none, so it reads under the track.

`labelUrl` was in the same position and is now a field in TRADE. Still not
*editable* anywhere, which is a separate gap and left as one.

`durationMs` stays unshown: it is stored, never populated, and a running order
of `0:00`s would be worse than silence. The release's `createdAt`/`updatedAt`
stay unshown too — both feature-local `formatStamp` helpers live in other
departments, and a third copy of a date formatter is not worth two lines of
provenance.

### Buttons here, anchors there

D24 turned the track master's reveal and DISTRIBUTION's OPEN into anchors,
because `fieldset[disabled]` reaches every form control beneath it and those
two only *read*. That still holds **in the editing branch**, where an unadopted
entry keeps the form disabled — do not turn them back into `Button`s.

`ReleaseDetails` is outside that fieldset entirely, so its REVEAL COVER, REVEAL
and OPEN are ordinary `Button`s. The distinction is the presence of the lock,
not a house style: where a fieldset can disable a control that ought to keep
working, it must not be a form control.

### The stagger, which is a trap

`Panel` declares `panelVariants` but no `initial`/`animate` of its own — it
inherits them from whatever lays it out. A grid of panels in a plain `div`
therefore renders at `opacity: 0`: present, taking up space, and completely
invisible. `DossierGrid` exists solely to stop that regressing, and
`ReleaseDetails` drives `gridVariants` itself for the same reason. Worth
reading its comment before touching that element.

## 31. D26 — the cover leads, and the canvas can be watched

*"The cover art should be the highlight, along with the title and artist name,
the user has a chance to swap to see the canvas too."*

D25 put the record on one page and then laid it out as six equal panels, which
made the cover a 168px square in the second slot — a thumbnail in a field grid.
For a catalogue whose entries are recognised by their artwork that is the wrong
emphasis, and D12 had already said so: the cover is *"the one thing on a
release worth drawing large."* It only ever honoured that on a tab you had to
go and find.

### A hero band, unnumbered

The record now opens on a masthead of its own — artefact large on the left,
title set as a title on the right, who it is by under it, and the register's
line of readings under that. Unnumbered and unlabelled, like the dossier's
masthead: the numbered panels are the *sections* of a record and this is its
face.

The panels below renumber to 01-05 and lose ARTEFACTS entirely, which had been
reporting two paths and an attachment state that the hero now shows outright.
The title is the largest type in the sheet, same face and treatment as the
catalogue card's title one step up, so opening a sleeve from the grid lands on
the same object drawn larger.

**No panel carries `focal` any more.** The house rule is at most one, and the
accent's job — saying which object the view is about — is done here by scale.
A crimson edge around artwork would fight the artwork, which is the one thing
on this page that must not be competed with.

### One well, two artefacts

Not two wells side by side. The cover and the canvas are the same object seen
two ways — the square a store shows and the vertical loop a phone plays — and
putting them next to each other at half size each would make neither the
highlight, which is precisely what was asked for.

The well is square, because the cover defines the shape. A canvas is 9:16 and
is `contain`ed inside it rather than cropped: letterbox bars are honest about
the aspect the file has, and cropping the one artefact whose whole purpose is a
phone screen would be a lie about it.

The swap is **two chips, not one toggle.** A single button reading CANVAS has to
be read as either "you are looking at the canvas" or "press to see the canvas"
and cannot say which; a pair with one lit says both at once. It is the same chip
the form uses for kind and status.

### This reverses "reported, not drawn"

The canvas has been deliberately undrawn since the department was built:

> The canvas — the vertical looping video — is reported rather than drawn. A
> still frame of a nine-second loop tells you less than knowing it is attached,
> and decoding video for a thumbnail is work with no payoff.

That reasoning was about a **thumbnail**, and it still holds for one: a frozen
frame of a loop is worth less than the word ATTACHED. It does not hold for the
thing the operator actually asked for, which is to watch the loop at size. The
argument was never "a canvas should not be visible" — it was "a still of one is
not worth the decode." Playing it is a different proposition and the answer
goes the other way.

### `discography:canvas`, and why the bytes cross the bridge

The renderer's CSP is `media-src 'self' blob:` with no `file:` anywhere in it,
which is not an oversight — it is what stops a compromised renderer reading the
drive through a media element. So the channel hands over the bytes and the
renderer wraps them in a blob URL, which is exactly the route
`auditorium:read` takes for a master.

Its own channel rather than that one, which refuses anything that is not an
audio format and caps at 512 MB. Three refusals, each naming itself, copied
from the listening room's reasoning: **the path is checked rather than trusted**
even though the app copied that file into its own media folder, because by the
time it arrives it is a renderer-supplied string and the channel would
otherwise read any file on disk into the renderer for anything that could reach
the bridge.

`MAX_CANVAS_BYTES` is 64 MB — far below the audio ceiling, because a canvas is
a three-to-eight-second loop that Spotify itself caps in the low megabytes, so
anything near this is the wrong file.

`CANVAS_MIME` is load-bearing for the reason `AUDIO_MIME` documents at length:
Chromium does not sniff a blob the way it sniffs a network response, so a wrong
type produces an element that loads, reports a size, and then fails to decode
without saying why.

### A GIF never reaches the video element

`CANVAS_EXTENSIONS` includes `gif` because a canvas may legitimately be one,
but a GIF is an image and `img-src` is `'self' data:` — **no `blob:`**. So
`canvasIsVideo` sends it through the thumbnail channel instead and it draws as
a still. Widening the image policy to animate a format nobody actually delivers
a canvas in would be the wrong trade.

### `CanvasFilm` holds one piece of state, keyed by its path

Copied from `Plate`, and for its reason: separate `url` and `error` flags would
both have to be *cleared* when the path changes, and clearing them in the body
of an effect is a synchronous `setState` that cascades a render before paint —
which `react-hooks/set-state-in-effect` refuses, and rightly. Holding the value
beside the path it belongs to lets render decide whether what is held is still
the right film, with nothing to reset.

The blob URL is revoked as the path changes and not only on unmount, or a
session spent reading through a catalogue would hold every canvas it had looked
at in memory.

### Found while in the file

`contract.ts` carried a broken comment: ``Copies artwork or a canvas into
`Media`` followed by a line beginning ``eleases\```. A past heredoc had
collapsed the `\r` in `Media\releases\` into a real newline — the same
accident that once committed a NUL byte into `FolderTrail.tsx`. Repaired, and
worth recording as the third instance of one class of bug.

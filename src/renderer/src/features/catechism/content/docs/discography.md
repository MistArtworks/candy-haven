# DISCOGRAPHY

Everything released: singles, EPs, albums, compilations and remixes, and where
each of them went.

## What this department is for

The ARCHIVE answers _what have I made_. This answers _what have I put out_ —
a different question with a different shape, because a discography includes
work that has no project on this machine at all.

That is the load-bearing detail. Everything released before this application
existed, everything a label mastered, every remix somebody else made: all of
it belongs in a discography and none of it has an Ableton set in your filing
root. So a catalogue entry **stands alone**, and links to a project when there
happens to be one.

> This replaced two things. VOLUMES held albums and EPs; a stood-down RELEASES
> model held dates and cover art. They described one object twice, and neither
> carried what actually ships a track. One record does both jobs now.

## Reading the catalogue

Each entry is drawn as its sleeve, because a discography is recognised by its
artwork long before its titles. The cover fills the card; the title, who it is
by, and the kind, date and length sit beneath it.

That is the opposite of the ARCHIVE's register, deliberately. A cover-card
view was tried there and deleted, because most projects have no artwork and a
grid of empty frames teaches nothing. Here artwork is the point — a release
without one is incomplete rather than ordinary, so an entry with no cover
draws a **struck sleeve**: a record seen head-on, in concrete rather than
gold, so an absence does not claim the eye on a page meant to be scanned for
pictures.

The panel's header carries the **kind** rather than the title, which is what
lets the title be set as a title instead of as small-caps in a rule. The
register still reads as a register — numbered, ruled, status on the right.

## The lenses

| Lens            | Shows                                 |
| --------------- | ------------------------------------- |
| **CATALOGUE**   | What is out in the world. The default |
| **FORTHCOMING** | Scheduled, not yet released           |
| **ALL**         | Every entry, whatever its status      |

There used to be a **SHELVED** lens. It went with the status of that name — a
lens that can only ever select nothing reads as an empty shelf rather than as a
category that no longer exists.

## Finding something

The bar is three rows, split by what each is for: where you are, what you are
looking at, and what you can do.

- The **lenses** scope the whole catalogue, and sit beside **Raise a release**
  because that is the action they scope.
- **Search** covers the title, the label and the credited artists — because
  "everything on Monstercat" and "everything with Nasko" are the two questions
  a discography gets asked that a title search cannot answer. The ✕ clears it.
- **Kind chips** narrow to singles, EPs, albums, compilations or remixes, and
  stack — picking two shows both.
- **Any label** appears once there are labels to pick from. A select rather
  than chips, because the list grows with the catalogue and has no ceiling.
- The count reads `6 of 31` while anything is filtering, and **Clear** appears
  only when there is something to clear.

## Raising an entry

**Raise a release** opens a dialog. **The title and the kind are required and
nothing else is** — those two are the facts that exist the moment an entry is
worth making, and a label, a catalogue number, a UPC and a date all arrive
later, often from somebody else.

The kind defaults to `SINGLE` because it is right most of the time. Your own
record is billed by default if one is marked **This is me** in ARTISTS; one
press removes it.

The one thing the dialog insists on beyond those two: a status of `RELEASED`
needs the date, because the catalogue sorts by it. The dialog says so rather
than letting the service refuse after you press Raise.

It opens straight into the sheet, where the artwork and codes go.

### It opens as a record, not a form

Everything reads until you press **EDIT**. Press it and the fields come
alive; press **DONE** and they settle again.

There is no save button because there is nothing to save — every field is
written the moment you change it, which is how the whole console works. EDIT
is there so that reading a finished release cannot accidentally rewrite it.

Three things still work while it is reading: the tabs, the **OPEN** links
beside a platform, and a track's master filename, which shows the file in
Explorer. Going and looking at something is not editing it. You can also
publish and remove without pressing EDIT.

> An entry the app raised for you is read-only for a second reason as well,
> and shows an **ADOPT** bar instead of an EDIT button. Adopting it starts
> editing straight away.

### The sheet is five tabs

Ordered by when you learn each thing, not by importance:

| Tab        | Holds                                                          |
| ---------- | -------------------------------------------------------------- |
| `RELEASE`  | Title, subtitle, kind, status, release date, notes             |
| `CREDITS`  | Main artist, featuring, and the liner-notes credits            |
| `TRACKS`   | The running order, project links and release masters           |
| `TRADE`    | Label, catalogue number, UPC, ℗ and ©, and the distribution    |
| `ARTWORK`  | Cover and canvas, drawn large                                  |

It was one long scroll, which put twelve fields, a credit picker, a tracklist,
six identifiers and two artwork wells at the same altitude.

Everything writes as you type. A catalogue entry is filled in over weeks, a
field at a time, as a label sends things — a form that had to be submitted would
be one abandoned half-filled.

The artwork, title and figures stay in the masthead on every tab, so the sheet
always says which record is open. `TRACKS` and `CREDITS` carry a count in the
strip, so their weight is legible without opening them.

### A single arrives with its track

A single **is** a recording, so raising one gives it one track, taking the
release's title. Remixes too, for the same reason.

EPs, albums and compilations do not: those genuinely start empty and are
filled over time, and inventing a first track for them would be guessing at a
running order.

The seeded track is an ordinary one — rename it, or link a project to it. If
the single turns out to be two edits and a dub, change the **kind** to `EP`:
a single holds one track, so the kind is the field that has to give.

## Kind and status are different questions

**Kind** is what the object is, and it decides how many tracks the release may
hold:

| Kind                              | Tracks   |
| --------------------------------- | -------- |
| `SINGLE` · `REMIX`                | one      |
| `EP` · `ALBUM` · `COMPILATION`    | up to 40 |

A single and a remix each name one recording, so ADD A TRACK disappears once
the track is there rather than refusing when pressed.

Note what that refuses: a single shipping with its own remix or an extended
edit — `Original Mix` plus `Nasko Remix` — is a normal two-track single on most
stores, and here it has to be filed as an `EP`. That is the deliberate cost of
the kinds meaning exactly what they say.

Changing the kind of a release that already has more tracks than the new kind
allows is **refused**, naming the count. Nothing is ever silently dropped to
make a record fit its label.

**Status** is how public it is, and it is **two states**: either it is out or it
is not.

| Status      | Means                                                 |
| ----------- | ----------------------------------------------------- |
| `SCHEDULED` | Committed to, whether or not it has a date yet        |
| `RELEASED`  | Out in the world. Moves every linked project to RELEASED |

`SCHEDULED` does **not** require a date. Leaving the date empty is what says
"this is going out, I do not know when" — it is the only thing that can say it
now, which is why the status does not insist on one.

Status is **not** a project's stage. A stage says how finished the work is; a
status says how public it is. A track can sit at `TRACK READY` for a year
while a label schedules it, and neither figure is wrong.

`RELEASED` is refused without a date. The catalogue sorts by date, so an entry
claiming to be out with no date would file itself beneath everything — and
guessing today would put a wrong fact in the one record whose job is to be
right about dates.

### It used to be five

`IDEA`, `PLANNED` and `SHELVED` have been removed, and each for its own reason:

- `IDEA` described a release you were only thinking about. Nothing linkable is
  speculative any more — every track on an entry is work already declared
  finished in the ARCHIVE, so an entry is past being an idea by construction.
- `PLANNED` was `SCHEDULED` without a date, which the empty date field already
  says. Two ways to write one fact.
- `SHELVED` duplicated the project's own **SHELVED stage**, which is where
  parking work belongs.

Entries stored under any of the three now read as `SCHEDULED`. Note what that
costs: a release you had shelved says it is committed to. Park the *work* on the
project's stage instead.

### Marking a release RELEASED writes into the ARCHIVE

This is the one status change that reaches outside this department. Every
project linked to one of the release's tracks moves to the **RELEASED** stage,
with a line in its stage history naming the release. Moving the release back to
`SCHEDULED` — or unlinking a track, or removing the entry — returns those
projects to `TRACK READY`.

Only those two stages are ever touched. A project still at `MIX`, or shelved, or
in the bin is left exactly where it is: putting a release out should not drag
unfinished work forward or wake something you deliberately parked.

The status field says which of the two it is about to do before you press it.

## The running order

A release owns its tracklist. Each track carries a title and, **optionally**,
the ARCHIVE project it was made in. A single or a remix already has one; the
other kinds start empty.

**Add a track** opens a dialog. Only the title is required — and it fills
itself in from the project when you pick one, so adding something made here
is choose the project and press Add. Credits and an ISRC are offered and
optional.

Choosing **No project** is an ordinary answer rather than a skipped step.

**Only finished, filed projects are offered** — at `TRACK READY` or `RELEASED`,
and on a shelf. Two reasons, and both matter:

- A track on a release is finished work, and TRACK READY is where you say the
  work is finished. The ARCHIVE's pipeline is the gate into the catalogue.
- Everything the scanner found loose in an intake root is in the register too,
  and listing it buried the real work under a wall of `Untitled`.

If something you expect is missing from the picker, it has not reached TRACK
READY — move it there in the ARCHIVE and it appears. The picker says so rather
than showing an empty list.

A track that _already_ links to a project keeps showing it whatever its stage.
The rule governs what can be picked, not what has been.

Once a track is on the list: **LINK A PROJECT** / **CHANGE PROJECT** points it
at an ARCHIVE project — or at nothing, by choosing **No project** — the arrows
nudge it up or down, and positions renumber themselves.

Re-pointing a track takes the new project'''s final master with it, and
unlinking clears the master. The old file belonged to the project that was
there a moment ago, so keeping it would have the release claiming a bounce from
one project shipped as a track now credited to another.

### The release master

Once a track has a project, **PICK MASTER** lists that project's own bounces —
every audio file in its folder except the imported samples — and records which
one shipped.

**Nothing moves.** The release stores the path to the file where it already
sits, beside the set that made it. Clicking the filename afterwards opens the
folder in Explorer, and the project's own dossier reports the same thing from
the other end, under RECORD → RELEASES.

This used to be done in the ARCHIVE, and choosing a final **moved** the bounce
into `Release Mastered Tracks`. That is gone: it took the audio away from its
own session, which made finding the source harder rather than easier.

Re-pointing a track at a different project clears its master, because the file
belonged to the project that was there before.

The TRACKS tab counts how many of the running order have one, so an entry that
is out in the world with three source files unnamed says so.

A track with no project reads `No project`, which is an ordinary state. A
track pointing at a project that has since been forgotten reads **Project no
longer in the register**, in crimson — those two mean different things and
only one is worth investigating.

Looking from the other direction, a project's dossier reports which release it
is a track of. That readout is **read-only**: the release owns the order, and
it is the only place that can see the whole of it.

## Credits

Two different questions, on one tab.

### Who it is by

**Main artist** is the release's own artist. **Featuring** is everybody billed
alongside. The split is how a release is _titled_ rather than a fact about the
people — `CANDY HEIST feat. NASKO` is two positions on a cover, and the same
person holds either on different releases.

### Who did the work

The **credits** list beneath it is the liner notes: a line per role, each naming
one or more people from the roster.

`PRODUCED BY`, `VOCALS BY`, `WRITTEN BY`, `MIXED BY`, `ENGINEERED BY`,
`PERFORMED BY`, `ARTWORK BY`, or `CREDITED` for anything else. Every line
carries an optional note for what the role cannot say on its own — `additional
production`, or which instrument was played.

A row per _role_ rather than per person, because that is how a credit reads: one
`PRODUCED BY` line naming three people, not three lines saying PRODUCED BY.

All of it is optional. Most singles carry no credits at all.

The roles are the same closed set the roster uses, said in a credit's voice. A
free-text role would produce `Vocals`, `vocalist`, `Vocal` and `VOX` inside a
month, which is the whole reason that set is closed.

Somebody can appear in both halves, and usually does — the main artist of a
single generally produced and wrote it too.

## Where it went

| Field                | Holds                                                   |
| -------------------- | ------------------------------------------------------- |
| **Label**            | Who put it out. Empty means self-released               |
| **Catalogue number** | The label's own reference                               |
| **UPC**              | Identifies the _product_ — twelve to fourteen digits    |
| **ISRC**             | Identifies a _recording_, so it sits on the **track**   |
| **℗ / ©**            | The recording and the composition, separately           |
| **Distribution**     | The platforms it goes out on — see below                |

The label field autocompletes from labels already used, which is what keeps
the spelling consistent across a catalogue.

A release with a **date** also appears on the CALENDAR, on that day, in every
lens. The date is held here and only here — the calendar reads it, and changing
it here moves the marker there.

> ISRC on the track and UPC on the release is not a layout choice — it is what
> the two codes identify. An album has one UPC and eleven ISRCs.

### The platforms it goes out on

Under the codes, one block per platform — the stores and services this release
is going to, each holding **two** addresses:

| Slot | What goes in it |
| --- | --- |
| **PRE-SAVE** | The link you hand out before release day — a DistroKid or Hypeddit gate, a smart link |
| **STREAM** | Where it actually is, once it is out |

Add a platform as soon as you know you are going to it, and leave both slots
empty. That is the point of the list: it can say *Spotify is on the plan and
has nowhere to point yet*, which a plain list of links never could.

The one being asked for is the one in gold. Before the release is out that is
PRE-SAVE; once you mark it RELEASED they swap, and the sheet says how many
platforms are still waiting for a stream link — on the line above the list and
as a count on the TRADE tab itself, so you can see it from anywhere in the
sheet.

Nothing is ever hidden. A Beatport pre-order link exists weeks early, and a
pre-save link is worth keeping as a record long after it stops working.

> An address is saved when you **leave the field** or press Enter, not as you
> type. If it is not a usable `https://` address it stays on screen with the
> reason underneath, rather than being thrown away half-finished.

**OTHER** is the one platform you can add twice, and the only one you name
yourself — for a gate, a smart link, or a shop that is not on the list.

## Cover art and canvas

Both are **copied** into the archive's own media folder, so the originals can
be moved or deleted afterwards without the catalogue losing its artwork.

The canvas — the vertical looping video — is reported rather than drawn. A
still frame of a nine-second loop tells you less than knowing it is attached,
and decoding video for a thumbnail is work with no payoff.

## Ready to publish

The button at the foot of the sheet writes a distributor-ready folder into
`Candy Haven\RELEASES`, named the way the release is billed:

```
Candy Heist, Nasko & Mist - Moves Like Jaggar (feat. Ekali)
```

Inside it:

| File | What it is |
| --- | --- |
| `<folder name>.wav` | the master, when the release has **one** track |
| `01 Candy Heist - Solstice.wav` | numbered, when it has **several** |
| `Cover Art.png` | the artwork, in whatever format you attached |
| `Spotify Canvas.mp4` | the canvas, likewise |
| `Release Details.txt` | everything a filename cannot carry |

The details file holds the title, kind, status, date, artists, credits, label,
catalogue number, UPC, ℗ and ©, notes, every platform with its pre-save and
stream addresses, and a block per track with its position, ISRC and which file
shipped as it. On a release that is out, a platform with no stream link is
printed as `no link yet` rather than left blank — there the gap is the thing
worth reading.

Masters are **copied**, never moved. The project keeps pointing at the bounce
where you put it, and the folder is something you can delete without having
deleted your work.

Publishing twice writes the **same folder again** rather than making a second
one, so fixing the artwork and publishing again is the normal way to work.

### What it will refuse, and what it will not

It refuses, naming the gap, when the release has no tracks, no master on any
track, no cover art, or no date — and while the entry is still **auto-raised**,
because an entry the app might withdraw is not one to hand to a distributor.
Adopt it first.

It does **not** refuse a track with no master. That track is skipped, named in
`Release Details.txt`, and counted in the sheet — a label master is a track
that legitimately has no file here, and a back catalogue has to stay
publishable.

A title carrying `/`, `:` or `?` is safe. Those characters cannot go in a
Windows path, so they are folded or dropped in the name and left untouched on
the record.

## Removing an entry

Removing a release takes its tracklist and its copied artwork with it. **No
project is touched** — every one of them stays in the ARCHIVE exactly as it
was. The catalogue records what happened in the world, and deleting the record
does not delete the work.

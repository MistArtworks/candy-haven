# OBSERVATORY — redesign capture

> The desk and the nine overlay console pages, reworked 2026-09-17 on the
> operator's instruction: _"Right now it is kind of a really bad UX and UI."_
>
> **The broadcast graphics themselves were not touched.** Everything under
> `src/renderer/overlays/`, `src/renderer/src/overlays/`,
> `src/renderer/src/muster/` and `src/main/services/overlay/` is exactly as it
> was. No IPC channel was added, no schema changed. This is the console only.

---

## 1. What was asked for

Three things, in the operator's own framing:

1. The department and its overlay pages are bad UX and bad UI, and should be
   redesigned against the project aesthetic and the lore.
2. He should have **easy access to the controls of each overlay — all the
   important fields and buttons — from the dashboard itself**, with deeper
   settings one click away on the overlay's own page.
3. **A better way to know what each overlay does**, instead of leading with the
   lore sub-caption. Clarified mid-build: the lore line may stay, but
   understanding what an overlay is doing matters more.

---

## 2. Flaws in what was there

### 2.1 The rail and the cards were the same information twice

The desk had a 236px rail listing every overlay with an index, a label, a state
dot and a live figure — and, below it, a card per overlay carrying an index, a
label, a state dot, a live figure **and everything else**. The rail was a
scroll-spy over the cards.

### 2.2 The cards carried everything, so the page ran about eight screens

Each of eleven entries drew: a purpose line, a lore epigraph, a live line, its
verbs, a two-field composer, an add-one line, filed chips, **every** address it
answers on with a URL and two buttons each, and a canvas/form footer. Two to a
row.

The two questions an operator actually asks — _what is this for_ and _what is
it doing_ — had become the hardest two things on the page to answer.

### 2.3 The lore led

`epigraph` was the second thing every card said after its name, in italic
behind a rule, at the same size as the purpose above it. Eleven of those is a
lot of world-building in front of the function.

### 2.4 Title and question existed twice, as two implementations

The desk's composer and each overlay page's config panel were **separate code
writing one setting** — two text fields, two commit paths, two sets of limits,
nothing keeping the wording or the validation in step. THE MUSTER's page also
kept a `question` field in local state, separate from the stored `prompt` the
overlay actually draws: two questions, one broadcast.

### 2.5 Nine pages, nine shapes

Each overlay page was five to nine panels in its own order. `SelectionPage` put
its addresses at `03`, `ConcordPage` at `06`, `MusterPage` at `07`.

### 2.6 Panel numbers moved under a setting in REGULATION

Three pages carried `index={testMode ? '07' : '06'}`, so switching rehearsal
mode on renumbered the panels beneath the simulator.

### 2.7 Five hand-rolled copies of the address block

The same `.address` / `.addressHead` / `.addressActions` markup across five
files, with the copy handler rewritten each time — and **none of them handled a
refused clipboard write**, so a blocked copy read as a button that did nothing
at all. `AddressList` and `useCopy` already existed and were written for
exactly this; the pages predated them.

### 2.8 Two verbs the service supported and nothing could reach

`muster.handoff` — the point of the whole department — was two navigations away
from the surface an operator has open while a call is closing. `timers.extend`
was keyboard-only, so adding a minute to an overrunning break meant knowing a
chord.

---

## 3. The system now

### 3.1 The desk is a board and a bench

```
┌ THE KIT ──────────────────┐  ┌ 01 THE MUSTER ──── OPEN CALL ─ focal ─┐
│ CHAT INSTRUMENTS          │  │ Chat types entries; they fill a       │
│ 01 ▤ THE MUSTER   12 ●    │  │ numbered list on screen.              │
│    The roll is open ·2:40 │  │  01 You put a question on the scene   │
│ 02 ◎ RESONANCE SEL.   ○   │  │  02 Chat files with !add anything     │
│ 03 ▥ THE CONCORD      ○   │  │  03 Close it, then hand the list on   │
│ CLOCKS                    │  │  "Choices measured. Deviance erased." │
│ 04 ⧗ INTERVAL  04:12 ●    │  │ ───────────────────────────────────── │
│ 05 ⧖ CONVENING        ○   │  │ The roll is open · 12 filed · 02:40   │
│ STANDING SCENES           │  │ [   CLOSE THE CALL   ]  Open console →│
│ 06 ⌸ THE GATE         ●   │  │ [To the ring][To the chamber][To both]│
│ 07 ✳ THE SURVEY       ●   │  │ TITLE ______   QUESTION ______        │
│ FURNITURE                 │  │ FILE ________________________  [+]    │
│ 08 ♪ NOW TRANSMITTING ●   │  │ BETWEEN SEGMENTS                      │
│ 09 ⌷ THE ENCLOSURE    ●   │  │ Call runs for ──●──── 90s             │
│ 10 ▦ THE CHORUS       ○   │  │ BROWSER SOURCES                       │
│ RESERVED                  │  │ scene  1920×1080  [Copy][Preview]     │
│ 11 ▢ THE DOCKET       ○   │  │ widget  460×380   [Copy][Preview]     │
└───────────────────────────┘  └───────────────────────────────────────┘
```

**The board is a readout. The bench is the desk.** Nothing on the board is
pressed; everything you do to an overlay is on the bench.

### 3.2 A board row is quiet until its overlay is doing something

`statusFor` has always returned a null `detail` at rest, with a note saying a
dashboard of rows each reporting that nothing is happening is harder to read
than rows that stay quiet. The board takes that at its word: at rest a row is a
number, a mark, a name and a dot. The live figure and the detail line appear
only when something is running, and the figure is `visually-hidden` rather than
absent so `StatusDot` never conveys state by colour alone.

The plain description moved to the row's **tooltip** and to the bench.

### 3.3 Grouping is part of the explanation

`OVERLAY_FAMILIES` gives **CHAT INSTRUMENTS · CLOCKS · STANDING SCENES ·
FURNITURE**, with reserved entries grouped last by `!implemented` rather than by
family — what an overlay *is* and whether it exists yet are two facts. Knowing
THE GATE is a standing scene and THE ENCLOSURE is furniture says how each is
placed in OBS before a word of description is read.

### 3.4 The registry says what an overlay is

Four additive fields on `OverlayDefinition`, all plain strings and arrays
because `electron.vite.config.ts` reads that module:

| Field           | For                                                      |
| --------------- | -------------------------------------------------------- |
| `role`          | The kind chip — `OPEN CALL`, `CHAT VOTE`, `PRIZE DRAW`   |
| `family`        | Which group of the board it sits in                      |
| `how`           | Three plain steps for how it runs                        |
| `sourcePurpose` | Caption for the *primary* address, where it differs      |

`purpose` was **rewritten on all ten entries** into plain operator language — no
`petition`, `citizen`, `chamber`, `rite`. `epigraph` is untouched and is now
drawn last and faint, in quote marks rather than behind a rule: quotes say "a
line from somewhere else", a rule says "this is a reading".

`how` is the part that actually teaches. A sentence says what an overlay *is*;
only steps say how it is *used*, and they carry the chat command, which is the
whole interface for three of these.

### 3.5 `lib/kit.ts` owns every number the operator sees

The board needs THE CHORUS, which cannot join the registry — every member there
is a document the build emits and the server routes, and the chorus is code
pasted into Streamlabs. And numbering by `overlay.order` inside family groups
would print `04 · 07` under CLOCKS.

So `kit.ts` builds the board, inserts the chorus into FURNITURE, and numbers
across the flattened result. **`overlay.order` is declaration order and is no
longer displayed anywhere** — nine mastheads used to read `overlay.order + 1`,
which was only correct while the board listed the registry in declaration order.

### 3.6 The bench is one component, drawn in two places

`OverlayBench` is the desk's focal panel **and** slot `02` of every overlay's
own console page, reading the same `actionsFor` / `composerFor` / `dialsFor`.
That is the fix for §2.4: a verb that gains a refusal or a field that gains a
limit gains it everywhere at once.

It is composed of pieces that are each useful alone: `OverlayVerbs`,
`OverlayComposer` (already existed), `OverlayDials`, and `AddressList` (already
existed).

An `OverlayIdentity` was among them and has since been removed. It drew the
kind chip, the plain sentence, three numbered steps and the epigraph — a
paragraph of prose above every control, on a surface somebody has open while a
stream is live. The operator asked for the controls and nothing else. The chip
survives, drawn at the size the prose was; the sentence is the board row's
tooltip; the procedure is CATECHISM's.

### 3.7 The altitude rule decides what is a dial

**The bench carries what changes between segments. The overlay's page carries
what is set once.** The same split the ARCHIVE dossier arrived at after five
attempts, and the only principle that makes the list decidable rather than a
matter of taste.

| On the bench                                    | On the page                        |
| ----------------------------------------------- | ---------------------------------- |
| A call's length — per call                      | Its command word — printed forever |
| A poll's window, and how strictly a vote parses | Its twelve `show*` switches        |
| A countdown's duration and grace                | Which of five faces it draws       |
| Whether the winner is withdrawn; how it draws   | The roster, the ballot, the marque |

Five overlays get no dials, and that is honest rather than a gap: THE
ENCLOSURE, THE GATE and THE SURVEY store nothing at all (the address *is* the
configuration, which is what lets two scenes carry two differently configured
copies), NOW TRANSMITTING's presentation is addressed per source, and THE
CHORUS is not served from here.

### 3.8 The lead verb is emphasised by size, not colour

`OverlayVerbs` gives the first action its own line at full width.
`actionsFor` already orders every case so the first entry suits the phase the
overlay is in — an open call leads with Close, a stopped clock with Start — so
taking the first is taking the obvious one.

Forcing `primary` on it would paint `Close the call` crimson, and crimson here
is reserved for live state and destructive actions. Closing a call is neither.

### 3.9 A report is not a refusal

`DeckRunner` gained `report` alongside `error`, and `DeckAction` gained an
optional `report(result)`. The hand-off *truncates* a roll longer than the
destination holds, so `Sent 10. 30 did not fit and stayed on the roll.` has to
be said — and drawing it crimson would teach the operator to read every notice
on the page as a fault. Brass for a report, crimson for a refusal.

### 3.10 The nine pages take one standing shape

| Slot           | What sits there                                                 |
| -------------- | --------------------------------------------------------------- |
| `01` **focal** | The live object — the roll, the ring, the tally, the face        |
| `02`           | **The bench** — verbs, composer, dials                          |
| `03`…          | That overlay's own composition                                  |
| then           | **Presentation**                                                |
| then           | **Broadcast** — `AddressList`                                   |
| **last**       | **Simulator**, rehearsal only                                   |

The simulator moving to the end is what makes every index above it a literal
again, fixing §2.6 by ordering alone rather than by a helper.

`PageHeader` gained one optional `kind` prop for the chip. The back-link reads
**← The desk**; it had said `Catalogue` for two releases after the department
stopped being one.

### 3.11 `soloDeck`, and the invariant it rests on

An overlay page must not mount `useOverlayDeck` — that claims the chat socket
and **starts the Spotify poll**, and THE ENCLOSURE's console has no business
doing either. So a page supplies the slice it already subscribes to and
`soloDeck` fills the rest from the same empty-state factories the hooks start
from.

This is safe **only** because every case in `statusFor`, `actionsFor`,
`composerFor` and `dialsFor` reads the slice named by its own `id` and nothing
else. That invariant is load-bearing and is documented on the function. If a
case ever needs a second overlay's state it must take it as an argument, or the
page will silently disagree with the desk about whether a control is available.
`owner` is asserted so that at least the page's own slice can never be missing.

### 3.12 A shared stylesheet for the pages' chrome

`overlays/_page.scss` emits the page chrome as a **mixin** — the grid, the
spans, the masthead, both notice tones, the prose, the switch groups, the stage,
the simulator. A mixin rather than a shared stylesheet because these are CSS
Modules: a plain `@use` would give nine modules nine different class names for
the same rules.

Two collisions were found and renamed rather than left to win by source order:
the enclosure's `.canvas` (a size *label*, against the chrome's preview
*element*) became `.canvasLabel`, and the reserved page's `.notice` (a *slab*,
against the chrome's notice *line*) became `.noticePanel`.

---

## 4. Rejected, and why

**Row buttons on the board.** The first build gave each row its leading verb, so
the interval could be held without moving the bench off a muster being composed.
The operator's verdict was immediate — _"we don't need the buttons on the side
bar, we can make sure we highlight the main button better on the right
section"_ — and he was right: eleven buttons down a 300px column is the clutter
the redesign existed to remove, reintroduced one level down. The emphasis went
to §3.8 instead.

**A description on every board row.** Also in the first build, as a second line
carrying the live detail when live and the plain sentence otherwise. Eleven of
those made the board a wall of prose beside a bench that says the same thing
better. Now a tooltip.

**Keeping a quick-set row for the poll window.** It existed for a good reason —
"a slider that has to be dragged to its far left to mean *no timer* hides the
most useful option behind a gesture" — and cost a second control writing one
field. The dial reads `Until closed` at zero, which fixes the same problem once.

**A separate BROADCAST panel on NOW TRANSMITTING.** Every other overlay answers
on one or two fixed addresses. This one answers on as many as the operator has
made, so the *source* is the unit and `SourceList` already draws each with its
address. A second panel was the same list twice.

---

## 5. Still outstanding

**Three catechism screenshots are stale.** `observatory-01-catalogue.png` and
`observatory-02-card.png` show the old catalogue; `overlay-muster-console.png`,
`overlay-concord-console.png` and `overlay-chorus-console.png` predate the
standing shape. They need retaking on the running app — deliberately not done
here, because it means bringing the window to the foreground while the operator
is at the keyboard (PROJECT_CONTEXT §15).

---

## Decisions log

| Date       | Decision                                                         | By       |
| ---------- | ---------------------------------------------------------------- | -------- |
| 2026-09-17 | Board + bench, over a grouped long scroll or a board alone       | operator |
| 2026-09-17 | Kind chip + plain line + three steps, over a line alone          | operator |
| 2026-09-17 | One standing shape for all nine pages, over fixing only the bugs | operator |
| 2026-09-17 | No buttons on the board; emphasise the bench's lead verb         | operator |
| 2026-09-17 | Lore epigraph kept, demoted and faint, never leading             | operator |

Candy Haven explains itself now. There is a manual in the console, a quick guide on every department, and a tour on first launch — plus multi-select filing, a new landing, an AUDITORIUM you can read closely, a way to rehearse the broadcast kit without an audience, and settings that survive a reinstall.

## CATECHISM

A tenth department, at the bottom of the rail under OVERSIGHT. The manual, in the console rather than in a file somewhere.

- Thirteen chapters: one per department, a commissioning walkthrough, the shortcut tables, a glossary of everything this console calls things by its own name, and a fault-finding chapter organised by symptom.
- **Quick guide** in every department's masthead — a handful of slides on that department, for when you are already on the page and do not want a chapter.
- A tour opens on a first launch, and again only when the guides are rewritten enough to be worth re-reading. Dismissing it is what marks it read — everything in it is also in the chapters, at more length.
- `F1` opens the guide for wherever you are. `Ctrl+Shift+K` opens the manual. `Ctrl+/` lists every chord currently bound, which it always could, and which is now written down.

Every chapter carries screenshots of the thing it describes, and a contents rail down the right that says how long the chapter is and where you are in it.

The prose lives in Markdown files in the repository, so correcting the documentation is editing a sentence rather than a component.

## Filing several projects at once

INTAKE was one drag per project. Twelve projects was twelve drags.

- **Tick the box** on any project in ON DISK, UNFILED, or a shelf. Ctrl-click and Shift-click work too — Shift takes a whole run from the last one you touched.
- **MARK ALL** takes the folder. **FILE _n_ INTO _shelf_** files the marked set without dragging anything.
- Dragging a marked project carries the whole marked set. Dragging an unmarked one carries only itself, so a bulk move cannot happen by accident.
- `Ctrl+A` marks everything in scope. `Escape` clears the marks before it clears anything else.

Marks clear when you walk somewhere else, because a selection you cannot see is one you will move by mistake.

## A gate, where the nebula was

NEXUS opens on a new scene: a colossal gate on a causeway, a shaft of light standing in the opening, and a procession climbing the steps toward it. The camera is down on the road at about the height of the people walking it, and it leans with the cursor.

It is drawn rather than rendered — no 3D engine, one canvas, a few thousand lines of arithmetic — so it costs almost nothing and starts instantly.

## Reading a file closely

AUDITORIUM's WAVEFORM had five fixed spans: four, eight, sixteen and thirty seconds, and ALL. The step you want is always between two of the ones on offer, and ALL behaved differently from the rest — the picture stood still and the playhead crossed it, where at every other setting the picture moved.

- **Scroll over the render to zoom**, continuously, from a third of a second to the whole file. `Ctrl` with the up and down arrows does the same from the keyboard.
- Beneath the waveform, a **strip showing the whole file** with a lit box marking the part you are looking at — the one thing a zoomed view cannot tell you about itself.
- Press anywhere on either to move the playhead, and drag to scrub. On the waveform you are pointing at the window; on the strip, at the whole file.

`SPAN` in the transport says where the zoom has got to, and a click fits the whole file.

## Rehearsing the broadcast kit

Every overlay in OBSERVATORY is built to be filled by a crowd, which made the department impossible to exercise alone: you put a call and then look at an empty roll.

Turn on **REGULATION → REHEARSAL** and THE MUSTER and RESONANCE SELECTION each grow a **Simulator** panel, joining the one THE CONCORD already had. The muster fills the roll with synthetic filings; the ring fills the roster with weighted petitions.

Nothing is written into the overlay directly — a simulated filing goes through the real chat command, the real per-citizen limit and the real duplicate rule. So the ceilings bite, and that is the point: ask for sixty filings on a roll that holds forty and forty arrive, the rest are turned away, and the count says so.

## Settings that outlive an installation

Two things, both about configuration surviving longer than the copy of Candy Haven holding it.

**The uninstaller asks what to keep.** Two boxes on its welcome page, both ticked: **keep my settings** and **keep my archive**. They are separate deliberately — settings are a few kilobytes of REGULATION that cost minutes to retype, while the archive is the register, hundreds of megabytes of project records, stages, tags, notes and volumes that exist nowhere else. One box covering both would mean resetting your preferences cost you the whole register to do it.

Leave both ticked and a later reinstall comes back exactly as you left it. Your project folders on disk are never touched either way, whatever is ticked. A silent uninstall keeps both, so an unattended removal can never take an archive with it.

**Export and import.** REGULATION's masthead writes everything the department holds to one zip — settings, the board configuration, the Spotify link, and a manifest saying what is inside. Import reads one back, validating the settings before anything is written, so a damaged or hand-edited file is refused rather than half-applied.

The zip holds credentials; keep it somewhere private. One thing it cannot carry is the Spotify link, which is sealed against the machine that wrote it — it restores perfectly on a reinstall here and simply asks to be linked again anywhere else. And it is configuration only: the archive is a database and is not in there.

## Projects called "Untitled Project" file properly

Live names every project it creates `Untitled Project`, so bringing work in from several folders collided on the _usual_ case. The second one simply refused, and the reason was not written down anywhere you would find it.

It now files as `Untitled Project (2)`, the register renames with it so the two are tellable apart, and the notice says exactly what was renamed and why. Nothing is merged and nothing is overwritten. Refusals that do happen are written to the log with their reason.

## Plates say something useful

A project tile read `SINGLE · 4.3 MB`. Every project on a genre shelf is the same category, and megabytes say nothing about music.

Tiles now carry **tempo and key**, with the project's **tags** in their own colours on the line beneath. Size is still in the ledger, which is the view whose job is figures.

## Departments arrive rather than appear

Optional, and off until you ask for it. Turn **THE SWEEP** on and a crimson mark crosses the field as a department changes: the page you are leaving recedes, the mark passes, the new one is set behind it.

REGULATION → PRESENTATION → **Page transition**: `SWEEP`, `FADE` or `OFF`. Motion still wins where the two disagree.

Two things that were wrong here are fixed with it. The console briefly rendered the department you were _going to_ inside the one you were leaving — you could see the next page before the transition to it. And loading a shelf drew a sentence where the shelf was about to be; it now draws the shelf's own shape, so the real tiles land where the placeholders stood instead of the page jumping.

## Shortcuts that changed

**`Ctrl+Backspace` no longer clears anything.** It was bound to _clear the board_ in four overlays, and it fires while you are typing — so deleting a word in an entry you were filing wiped the roll a second after you typed it. It deletes a word now, as it does in every other text field on Windows.

- **Clearing is `Ctrl+Shift+X`** in THE MUSTER, THE CONCORD, RESONANCE SELECTION and INTERVAL / CONVENING, and it does not fire from inside a text field at all.
- **THE MUSTER splits put and close.** `Ctrl+Enter` puts the call and `Ctrl+Shift+Enter` closes it. One chord did both, which meant reaching for a submit-shaped key mid-call ended the call.
- **RESONANCE SELECTION's clear moves off `Ctrl+Enter`**, which starts something on the two overlays either side of it.

More broadly: a shortcut can no longer take a chord the text field owns. `Ctrl+A`, `Ctrl+Z`, `Ctrl+←` and `Ctrl+Home` belong to the field while it has focus, whatever is bound to them elsewhere.

## Shortcuts added

- CALENDAR and AUDITORIUM had none. Both have a full set now — lenses and presets on `Alt`+digits, `Space` for the transport, `Ctrl+T` back to today, `Ctrl+N` to file an entry.
- `Ctrl+0` reaches the tenth department. It was generating a `Ctrl+10`, which is not a key.
- `Ctrl+A` in ARCHIVE marks everything in scope, and still selects text inside the search field.

## Fixed

- Rows in UNFILED drew their name a hundred and fifty pixels to the right of where it belonged, on a ragged left edge, once the marking box arrived beside them.
- INTERFACE's commissioning scope sat in a sixth of the page with its contents running out through the panel's own border.
- Folders in INTAKE could be marked with a modifier click even though they cannot be filed — they are places to walk into, and a folder has no record to file. They counted toward the total and would have been sent to the filing service as if they were projects.
- Double-click opens a folder in INTAKE, as it always has in STACKS. A single click selects. Previously a click meant to mark something navigated out of the folder you were working in.

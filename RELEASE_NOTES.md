Candy Haven explains itself now. There is a manual in the console, a quick guide on every department, and a tour on first launch — plus multi-select filing, a page transition, and a fix for the migration that kept refusing.

## CATECHISM

A tenth department, at the bottom of the rail under OVERSIGHT. The manual, in the console rather than in a file somewhere.

- Thirteen chapters: one per department, a commissioning walkthrough, the shortcut tables, a glossary of everything this console calls things by its own name, and a fault-finding chapter organised by symptom.
- **Quick guide** in every department's masthead — a handful of slides on that department, for when you are already on the page and do not want a chapter.
- A tour opens on a first launch, and again only when the guides are rewritten enough to be worth re-reading. Dismissing it is what marks it read — everything in it is also in the chapters, at more length.
- `F1` opens the guide for wherever you are. `Ctrl+Shift+K` opens the manual. `Ctrl+/` lists every chord currently bound, which it always could, and which is now written down.

The prose lives in Markdown files in the repository, so correcting the documentation is editing a sentence rather than a component.

## Filing several projects at once

INTAKE was one drag per project. Twelve projects was twelve drags.

- **Tick the box** on any project in ON DISK, UNFILED, or a shelf. Ctrl-click and Shift-click work too — Shift takes a whole run from the last one you touched.
- **MARK ALL** takes the folder. **FILE _n_ INTO _shelf_** files the marked set without dragging anything.
- Dragging a marked project carries the whole marked set. Dragging an unmarked one carries only itself, so a bulk move cannot happen by accident.
- `Ctrl+A` marks everything in scope. `Escape` clears the marks before it clears anything else.

Marks clear when you walk somewhere else, because a selection you cannot see is one you will move by mistake.

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

## Shortcuts

- CALENDAR and AUDITORIUM had none. Both have a full set now — lenses and presets on `Alt`+digits, `Space` for the transport, `Ctrl+T` back to today, `Ctrl+N` to file an entry.
- `Ctrl+0` reaches the tenth department. It was generating a `Ctrl+10`, which is not a key.
- `Ctrl+A` in ARCHIVE marks everything in scope, and still selects text inside the search field.

## Fixed

- Folders in INTAKE could be marked with a modifier click even though they cannot be filed — they are places to walk into, and a folder has no record to file. They counted toward the total and would have been sent to the filing service as if they were projects.
- Double-click opens a folder in INTAKE, as it always has in STACKS. A single click selects. Previously a click meant to mark something navigated out of the folder you were working in.

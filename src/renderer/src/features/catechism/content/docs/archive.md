# ARCHIVE

The project registry. Everything you have made: created here rather than merely
discovered, filed on shelves that are real directories, tracked through the
production pipeline, and carried through to a folder of finished files.

## Two axes

Keeping these separate is what stops the page becoming a settings screen, and
understanding the split is most of understanding the department.

- The **lens** decides _what is in scope_.
- The **view** decides _how whatever is in scope is drawn_.

They are independent. The ledger view of the BIN lens is a table of deleted
projects; the plate view of the VOLUMES lens is a grid of albums. Any lens can
be read through any view that makes sense for it.

## The lenses

![archive-01-lenses.png](archive-01-lenses.png)

| Lens        | Scope                                                                                | Chord     |
| ----------- | ------------------------------------------------------------------------------------ | --------- |
| **STACKS**  | The filing tree you build — categories, genres, artists, and what is shelved on them | `Alt`+`1` |
| **INTAKE**  | Work found elsewhere on disk that the register does not know about                   | `Alt`+`2` |
| **VOLUMES** | Albums, EPs and compilations, and the tracks bound into each                         | `Alt`+`3` |
| **ALL**     | The whole register, flat                                                             | `Alt`+`4` |
| **BIN**     | Deleted projects, kept until you empty them                                          | `Alt`+`5` |

STACKS is the only lens that _browses_ rather than filters — you stand inside a
folder and can step into another. The rest narrow the register and are read as
one list.

> The BIN is a place, not a filter. A project in the bin is not hidden from the
> other lenses, it has been moved out of them.

### The filing tree

Three kinds of folder, and the tree enforces what may go inside what.

- A **category** holds genres and artists. It never holds projects directly —
  dropping one on a category is refused rather than silently re-homed.
- A **genre** or an **artist** holds projects.

That rule is why `Ctrl`+`Shift`+`N` is disabled at the root: a project needs a
shelf, and at the top of the tree there is nowhere to put it.

## The views

![archive-02-board.png](archive-02-board.png)

| View      | What it is                  | Use it when                    |
| --------- | --------------------------- | ------------------------------ |
| **ICONS** | A grid of plates            | Browsing a shelf — the default |
| **LIST**  | A table of rows and columns | The figures are the point      |
| **BOARD** | Pipeline columns            | Moving work between stages     |

`Ctrl`+`E` cycles them. The board has no meaning over directories, so it is not
offered on the STACKS lens while you are standing in a folder.

A plate carries the project's **tags, tempo and key** — the three things that
tell one set from another once the names have stopped being distinguishable,
which is the point at which you switched to this view. Size on disk lives in the
ledger, which is the view whose job is figures.

## The pipeline

Six stages in a line, and one off to the side.

| Stage         | What it means                                           |
| ------------- | ------------------------------------------------------- |
| `IDEA`        | A loop, a sample, a direction. Nothing committed yet    |
| `SKETCH`      | The core sections exist. Structure is still open        |
| `ARRANGEMENT` | Full-length arrangement committed end to end            |
| `MIX`         | Balance, processing and automation being resolved       |
| `MASTER`      | Mixdown bounced; mastering passes in progress           |
| `TRACK READY` | Final mix and master chosen, and filed where it belongs |
| `SHELVED`     | Parked indefinitely. Kept for parts, not for release    |

`TRACK READY` cannot be reached until a final mix and a final master have been
named. That is enforced, and deliberately so: the stage is a claim about a
specific file, not a mood.

`SHELVED` is off-pipeline. It does not sit after `TRACK READY`, it sits beside
the whole line, and a shelved project reports no pipeline progress rather than a
misleading position.

### Changing a stage

![archive-07-stage.png](archive-07-stage.png)

Three ways, all equivalent:

1. Drag the project between columns on the **BOARD** view. The move _is_ the edit.
2. Use the stage strip on the project's dossier.
3. Right-click a project and choose a stage from the menu.

Every change is recorded with a timestamp, and optionally a note, in the
project's stage history under the **RECORD** tab.

## Categories

What kind of release a project belongs to. Set on the dossier; shown on the
ledger and used by the filters.

`SINGLE` · `EP` · `ALBUM` · `COMPILATION` · `BOOTLEG` · `EXPERIMENTAL` ·
`BEAT BATTLE`

A category is a property of the project. It is not the same thing as a
**volume**, which is an actual collection with tracks bound into it in order —
see below.

## Sorting and filtering

The controls above the register narrow and order what the lens has in scope.

| Sort           | Orders by                                |
| -------------- | ---------------------------------------- |
| `LAST TOUCHED` | Most recently worked, first. The default |
| `NAME`         | Alphabetical                             |
| `STAGE`        | Pipeline position                        |
| `REVISIONS`    | How many saved versions exist            |
| `SIZE`         | Bytes on disk                            |

- **Search** matches project names. `Ctrl`+`F` focuses it and selects whatever is
  already there, so the next keystroke replaces the previous search.
- **Filters** narrow by stage, category and tag.
- **Favourites only** (`Ctrl`+`B`) reduces the view to what you have marked.
- **Subtree** widens a folder search to everything beneath it rather than the
  single level.

A filter left on from another lens cannot narrow what you are looking at now —
the controls reset with the scope, which is why INTAKE does not offer them.

## Selecting several at once

Every list of projects supports the same three gestures.

1. **Tick** the box on a plate or row.
2. **Ctrl-click** anywhere on it to add one to the selection.
3. **Shift-click** to mark a whole run from the last one you touched.

Dragging any marked project carries the entire marked set. Dragging an unmarked
one carries only itself and leaves your marks alone — so a bulk move cannot
happen by accident.

Marks clear when you navigate somewhere else, because a selection you cannot see
is a selection you will move by mistake.

## INTAKE

![archive-03-intake.png](archive-03-intake.png)

Two panes. The left is a directory on disk; the right is where it would go.

1. Point the source pane at a directory. Double-click a folder to walk into it.
2. Anything the register has never seen is marked **NOT INDEXED** — it cannot be
   picked up until a scan has indexed it.
3. Open the destination shelf in the right pane.
4. Tick what you want, then press **FILE _n_ INTO _shelf_** — or drag.

Anything that could not be moved is reported **by name** with a reason, rather
than as a count. "Three could not be moved" sends you hunting; the names say
which and why.

> Folders in the left pane are places to walk into, not things to file. They
> cannot be ticked, and a modifier click does nothing to them.

### Name collisions

Live names every project it creates `Untitled Project`, so bringing work in from
several folders collides on the usual case rather than a rare one.

A collision is resolved rather than refused: the project files as
`Untitled Project (2)`, the register renames with it, and the notice says
exactly what was renamed and why. Nothing is merged and nothing is overwritten.

### Move or copy

Set in REGULATION under ARCHIVE. `move` is the default.

- **Move** — the work leaves the source directory and lives under the filing root.
- **Copy** — the original stays where it was.

Copy is occasionally right for a shared or read-only source. It is the wrong
default because the two copies immediately begin to diverge.

Copy only applies on the way _in_, from outside the archive. Moving a project
between two shelves is reorganising, not migrating, so it always moves.

## The dossier

![archive-04-dossier.png](archive-04-dossier.png)

Opening a project gives you its record, split by the question you are asking.

| Tab          | Answers                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------- |
| **OVERVIEW** | What is this, and what do I want to do about it — tempo, key, length, stage, tags, notes |
| **RECORD**   | The rest of the facts. Full set analysis, register fields, stage history                 |
| **FILES**    | What is in the folder, and the master picks settled there                                |

The two things you do _to_ a project — **OPEN FOLDER** and **OPEN IN ABLETON** —
lead the header. Both are refused while the folder is missing, because launching
a set that is not there produces an OS error naming a path, which is a worse way
to find out.

### Notes

Filed against the project and kept in the register, not in the folder. A note is
for what needs doing, what was tried, and what to remember — the things that do
not survive in the set file.

### Marking a final master

![archive-09-finalmaster.png](archive-09-finalmaster.png)

Audio can only be marked from the `MIX` stage onward, because before that the
bounces that matter do not exist and an empty section on every new project
teaches nothing.

1. Mark considered mixdowns at `MIX` and mastered versions at `MASTER`.
2. Move the project to **TRACK READY**.
3. If no final is set, the dialog opens and asks which file ships.
4. The chosen file **moves** into `Release Mastered Tracks` under the name you
   give it, and the stage only changes once the move has actually succeeded.

> The project's other files are never touched. Marking a master is a statement
> in the register about which file ships — it does not rename or rewrite the
> rest of the folder.

## Volumes

![archive-10-volumes.png](archive-10-volumes.png)

A volume is an album, EP or compilation. It is metadata only: nothing is written
to disk, and a track's membership lives on the project rather than in a second
list that could disagree with it.

Create a volume, then bind tracks into it in the order they should run. A
project can carry a track number within its volume.

## Tags and colours

![archive-11-tags.png](archive-11-tags.png)

**Tags** are your own labels, managed from the dossier's TAGS panel via
**MANAGE**. Each carries a colour you pick, and that colour is drawn on the
project's plate — the one place the five-material palette gives way, because a
label you chose is more useful in your own colour than in the house one.

Usage counts are computed by reading the register, so a tag always reports how
many projects actually carry it rather than a number that has drifted.

**Colours** can also be set on a project or a shelf directly, and code the tile
itself. **Favourites** (the ◆ corner mark) are a separate axis again, filtered
with `Ctrl`+`B`.

## Scanning

The scan walks the filing root and any satellite roots, and reconciles what it
finds against the register — additions, deletions, renames and moves.

- It runs on launch by default, and is cheap because it is incremental: a set
  whose size and modification time are unchanged is served from its stored
  analysis rather than re-read.
- `Ctrl`+`R` scans for changes.
- `Ctrl`+`Shift`+`R` re-reads **every** set regardless, for when a project's
  tempo or key looks wrong and you want the analysis rebuilt.

There is deliberately no filesystem watcher. Live rewrites its set file on every
save, so a watcher would re-read a large XML document every few minutes while
you are working — the exact moment the machine is needed elsewhere.

Filing is refused while a scan is running, because both move the same files.

## Deleting and restoring

Deleting a project moves it to the **BIN** — a real directory under the archive,
not a flag. Nothing leaves the disk until the bin is emptied, and emptying is
confirmed separately and is not reversible.

A binned project remembers where it came from, so restoring it puts it back on
the shelf it left rather than at the root.

If you delete the folder you are standing in, the browser steps out to its
parent rather than being left pointing at nothing.

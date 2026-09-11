# ARCHIVE — redesign capture

> **Status: capture in progress. Do not build from this yet.**
>
> The operator is dictating a new system for the ARCHIVE that replaces parts of
> the current one but explicitly *not all of it*. This file records each piece
> as it is described, in their words plus a mapping onto the code that exists
> today. Nothing here is agreed or designed until the dictation is complete and
> the open questions at the bottom have been answered.
>
> Started 2026-09-11. See `PROJECT_CONTEXT.md` §ARCHIVE for the system being
> replaced, and the "How it works today" briefing in the session that opened
> this file.

---

## 1. Setup inputs — root folders, template, destination

**What the operator said:**

> "The root folder selection, the template selection and the destination
> section remain the same EXCEPT we can add multiple root folders."

**Unchanged, therefore:** the three things the operator configures before the
ARCHIVE can do anything stay conceptually as they are.

| Input | Today's field | Today's UI |
| --- | --- | --- |
| Root folder(s) | `workspace.satelliteRoots` | Setup gate "source roots"; REGULATION → ARCHIVE → FILING → "Other locations" |
| Template | `workspace.projectTemplatePath` | Setup gate; FILING → "Project template" |
| Destination | `workspace.filingRoot` | Setup gate; FILING → "Filing root" (read-only) |

**The one change:** *multiple root folders.*

**Not yet resolved — see Q1.** Today there is already a list of source roots
(`satelliteRoots`, N of them) and exactly **one** destination (`filingRoot`).
So "add multiple root folders" could mean either:

- (a) the *sources* become the primary concept and are treated as a flat list of
  peers — roughly what exists, possibly renamed and reframed; or
- (b) there can be more than one **destination**, i.e. more than one filing
  root, each with its own `Candy Haven` wrapper.

These are very different. (b) touches several places that assume a single
destination exists:

- `WRAPPER_DIRECTORY_NAME` / `requireWrapper()` — one wrapper per install
- `unfiledDestination()` — "unfile" means "move back to *the* filing root"
- `pruneMissingFolders()` — guards on *the* wrapper being reachable
- `ArchiveSetupState` / the setup gate — asks for one root, one template
- Folder paths are absolute, so a shelf belongs to whichever wrapper it is under

---

## 2. Flaws in the current system

Dictated by the operator. Each one checked against the code; where the stated
behaviour does not match what the code does, that is recorded too — a fix for a
problem that does not exist would be worse than no fix.

### 2.1 "Take off the shelf" does not return a project where it came from

> "All the files in the unfiled when dragged into a genre/folder — yes it's
> moved BUT when I 'TAKE OFF THE SHELF' it goes to Candy Haven/.. and not the
> original place that we got the projects from."

**Confirmed. Real flaw.** `StacksService.unfiledDestination()` returns the
**filing root** — the parent of the `Candy Haven` wrapper — for any project
currently sitting inside the wrapper. So a project discovered at
`C:\Users\hanee\Desktop\Music\test Project`, filed into `DUBSTEP`, and then
unfiled, lands at `C:\Users\hanee\Music\test Project`. It never goes home.

**Why it cannot currently do better:** `ProjectRecord` has no field recording
where the project was discovered. There is `trashedFrom` — the bin remembers
its origin, which is exactly what makes the bin reversible — but filing has no
equivalent. The information needed to send a project back does not exist.

The one case it gets right: a project that has *never* been inside the wrapper
is left exactly where it is (`dirname(record.path)`), on the grounds that it is
already unfiled as far as the disk is concerned.

**Implication:** any fix needs a new persisted field (working name: origin /
discovered-at path), and a rule for what happens when that origin is gone —
drive unplugged, folder deleted, root removed from settings.

### 2.2 Moving a project into the archive — what comes with it

> "We don't only want 'Ableton Project Info', 'Backup' and 'Samples' (along
> with the .als file). Sometimes the user might have rendered a few audios OR
> left a few files in there which he wants to bring to Candy Haven project
> file. I'm assuming we are only moving those files and nothing else in this
> system."

**The assumption is incorrect — this already works the way the operator
wants.** Filing does not copy a list of known subfolders. `fileProject()` calls
`moveDirectory(record.path, destination)`, which moves **the entire project
folder as one unit**:

- same volume → `rename()`, so the whole tree moves atomically;
- different volume → `cp` recursive, verified on file count and total bytes,
  and the source is only deleted once the copy is proven complete.

Nothing is filtered at any point. Rendered audio, stray files, extra
subfolders, anything else sitting in the project folder all come across. There
is no allow-list of `Ableton Project Info` / `Backup` / `Samples` anywhere in
the move path.

**The adjacent gap that is real — see Q2.** A project *created* inside Candy
Haven is scaffolded by `provisionProject()` with six folders: `WIPS`,
`MIX & MASTER`, `STEMS`, `GRAPHICS`, `MARKETING`, `REFERENCES`. A project
**adopted** from a root gets none of them. So after filing, an outside project
sits in the archive with its rendered bounces loose at the project root, while
a home-grown project keeps them in `MIX & MASTER`. The two look nothing alike
once they are on the same shelf.

Note the scanner already distinguishes these files: audio outside `Samples/` is
indexed as `audio` — candidate deliverables, the list the master picker draws
from — separately from imported samples, which are only counted.

### 2.3 A loose `.als` in a root turns the whole root into a "project"

Not dictated — found while answering the operator's question "so it's copying
ALL the files where the als exists?". The answer is yes, and that is exactly
what makes this dangerous.

`walk()` is entered as `walk(root, 0, context)` and the set test has **no depth
guard**:

```ts
if (files.some((entry) => classifyExtension(entry.name) === 'set')) {
  context.projectDirectories.push(directory)
  return
}
```

So if a stray `beat.als` is sitting directly in `C:\Users\hanee\Desktop\Music`,
that root **is** a project folder. Two consequences, both bad:

1. **Every real project under that root disappears from the register.** The walk
   `return`s the moment it finds a set, so it never descends. One loose file at
   the top of a root hides everything beneath it.
2. **Filing it moves the entire root.** `fileProject` → `moveDirectory` would
   move `C:\Users\hanee\Desktop\Music` — all of it — into
   `Candy Haven\<genre>\Music`.

The one accidental protection: if the loose set is in the **filing** root, the
destination is inside the source, and `moveDirectory`'s `pathIsInside(to, from)`
check refuses it. A **satellite** root has no such protection — the destination
is elsewhere, so the move succeeds.

**Implication:** whatever the new system does, a configured root must never
itself be adoptable as a project. Candidate rules: never treat depth 0 as a
project folder; or refuse to file any project whose path is a configured root;
or both. See Q4.

### 2.4 No multi-select — everything is one project at a time

> "I can't select multiple projects/files/folders to drag and drop or move to
> the folder/location I want through the ARCHIVE's feature. Correct me if I'm
> wrong."

**Confirmed. Correct.** There is no multi-select anywhere in the ARCHIVE, and
the limitation is not a renderer oversight — it is single-item the whole way
down:

| Layer | Today |
| --- | --- |
| Drag payload | `beginDrag(event, type, id: string)` — one id in `dataTransfer` |
| Drop handler | `readDrag()` → one id → `fileProject(projectId, folderId)` |
| IPC contract | `projects:file` input is `{ id: string, folderId: string \| null }` |
| Service | `StacksService.fileProject(projectId, folderId)` — one record |
| Context menu | built from a single `project`, so every verb on it is singular |

The only thing resembling a selection is the `?project=<id>` URL param, and
that is not a selection — it is *which dossier is open*. There is no set of
selected ids in the page at all.

Consequence: filing twelve unfiled projects into a genre is twelve drags.

**Implication:** supporting this means a change at every one of those layers,
including the IPC contract and the service signature. Two things fall out of
that which need deciding before it is built:

- **Partial failure.** `moveDirectory` refuses when something of the same name
  is already in the destination — nothing is merged or overwritten. With one
  project that is a clean refusal. With twelve, eleven may have moved before
  the twelfth collides. All-or-nothing is not achievable across a filesystem
  without a staging area, so the honest options are "stop at the first failure
  and report what moved" or "move what can move and report the rest". See Q5.
- **What can be multi-selected.** Projects only, or folders too? Filing a
  folder into another folder is `updateFolder`'s re-parent path, which cascades
  every descendant's path — a different operation from filing a project.

**Flaw list closed** by the operator after §2.4. §2.3 was found during review
rather than dictated; everything else is theirs.

---

## 3. The proposed system

The ARCHIVE has **two mechanisms**:

- **MIGRATION** — bringing existing work in from wherever it already lives.
  _(Awaiting dictation.)_
- **MANAGEMENT** — creating and running projects from here on: projects, WIPs,
  final mixdowns, stems.

### 3.1 MANAGEMENT

**Dictated by the operator:**

1. On entering the ARCHIVE, create the primitive directories inside
   `Candy Haven`: **`Projects`**, **`Release Master`**, **`RECYCLE BIN`**.
2. The operator can create and choose **categories**, which are created inside
   the `Projects` directory. Example: `Personal`, `Collabs`.
3. Inside a category, the operator chooses between two **directory types** —
   **Genre** and **Artist**. (More custom types may be added in future updates;
   for now just these two.)
4. Inside an artist or a genre, the operator can create a **project**. On
   creation the project folder must be made such that **the custom icon shows**
   — see the reference screenshots: a project folder created this way renders
   with the Candy Haven project icon in Explorer, while an ordinary folder
   (`Test project Project`) shows the default yellow folder.

**Resulting shape on disk:**

```
<filing root>\Candy Haven\
├── Projects\
│   ├── Personal\              ← category
│   │   ├── Dubstep\           ← genre
│   │   │   └── idk honestly Project\   ← project, custom icon
│   │   └── Some Artist\       ← artist
│   └── Collabs\
├── Release Master\
└── RECYCLE BIN\
```

**How this differs from today:**

| | Today | Proposed |
| --- | --- | --- |
| Wrapper children | `RELEASES`, `RECYCLE BIN`, + genres at top level | `Projects`, `Release Master`, `RECYCLE BIN` |
| Depth to a project | `Candy Haven\<genre>\<project>` | `Candy Haven\Projects\<category>\<genre\|artist>\<project>` |
| Folder type | Derived from **depth** — `folderKindAtDepth()` says depth 0 is a genre, everything below is a plain folder. Deliberately not stored: "moving a folder changes what it is, and a stored kind would sooner or later disagree with where the folder sits." | **Chosen by the operator** — genre vs artist is a real, stored distinction, extensible later |
| Folder icon | None — projects are ordinary folders | Custom icon on every created project folder |

The folder-type change is the significant one: it reverses an explicit decision
recorded in `stacks.constants.ts`. If type is stored rather than derived, moving
an `Artist` folder under a `Genre` no longer changes what it is — which is
probably the intent, but it needs stating, because the tree then has to refuse
or tolerate arrangements that depth alone used to prevent.

**On the custom folder icon.** Windows does this with a `desktop.ini` in the
folder pointing at an `.ico`, and the *folder* must carry the read-only or
system attribute for Explorer to read it:

```ini
[.ShellClassInfo]
IconResource=..\..\AProject.ico,0
```

The reference screenshot shows `AProject.ico` — 128×128, 470 KB — already
sitting under `C:\Users\hanee\Music\Candy...`, which suggests one shared icon
referenced by every project rather than a copy inside each. Details to settle
in Q9.

---

## Open questions

Numbered as they arise; to be put to the operator once dictation is complete.

- **Q1 — "multiple root folders": sources or destinations?** Does this mean more
  than one place to *look for* projects (close to today's `satelliteRoots`), or
  more than one place to *file them into* (multiple filing roots / wrappers)?
  If destinations: when a project is unfiled, or restored from the bin, which
  root does it go back to?

- **Q2 — should an adopted project be scaffolded?** When a project is brought in
  from a root, should it get the six scaffold folders a home-grown project gets
  (`WIPS`, `MIX & MASTER`, `STEMS`, `GRAPHICS`, `MARKETING`, `REFERENCES`)? And
  if so, should its loose rendered audio be *sorted into* them — bounces into
  `MIX & MASTER` or `WIPS` — or left at the project root untouched? Sorting
  means moving files the operator did not ask us to move, which is a much
  stronger action than moving a folder as a unit. See §2.2.

- **Q4 — can a root ever be a project?** Confirming the intended rule for §2.3:
  a configured root should never be adoptable as a project folder even if a
  loose `.als` is sitting in it. If so, what should happen to that loose set —
  ignored silently, reported as an oddity somewhere, or offered as "wrap this
  into a project folder"?

- **Q5 — bulk filing, partial failure.** When a multi-project move hits a name
  collision part way through, should it stop at the first failure and report
  what moved, or move everything it can and report what it could not? And
  should multi-select cover folders as well as projects, or projects only?

- **Q6 — what happens to the existing wrapper layout?** Today's wrapper holds
  `RELEASES` and `RECYCLE BIN` with genres as direct children. The proposal has
  `Projects`, `Release Master`, `RECYCLE BIN`. Is `Release Master` a rename of
  `RELEASES` (with its contents and the `releases` collection's paths moved), or
  a new thing beside it? And do the operator's existing genre folders get moved
  under `Projects\<category>`, and if so into which category?

- **Q7 — genre vs artist: stored type or still derived?** Today `FolderKind` is
  computed from depth on purpose, so a stored kind can never disagree with where
  a folder sits. The proposal makes genre/artist an operator choice. Confirming:
  the type is stored on the folder, and moving a folder does *not* change it.
  Follow-on: may an Artist contain a Genre, or vice versa, or are both only
  valid directly under a category?

- **Q8 — are categories a folder, or a new kind of thing?** Are `Personal` and
  `Collabs` ordinary folder records at a fixed depth, or a separate concept with
  its own collection and rules?

- **Q9 — the project icon.** Confirming the mechanism: one shared `.ico` in the
  `Candy Haven` wrapper, referenced by a `desktop.ini` written into each project
  folder, with the folder marked read-only so Explorer honours it. Should the
  `.ico` ship with the app and be written out on setup, or is it a file the
  operator supplies? And should *existing* projects be back-filled with the icon
  or only newly created ones?

- **Q3 — where does "home" point when it no longer exists?** If §2.1 is fixed by
  remembering a project's origin, what should taking it off the shelf do when
  that origin is unreachable — external drive unplugged, folder deleted, or the
  root removed from settings? (Refuse / fall back to the filing root / ask.)

---

## Decisions log

_(Nothing decided yet.)_

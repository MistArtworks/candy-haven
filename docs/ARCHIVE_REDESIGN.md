# ARCHIVE — redesign capture

> **Status: BUILT.** Every decision below is implemented on `archive-upgrade`.
>
> The operator dictated a new system for the ARCHIVE that replaces parts of the
> current one but explicitly *not all of it*. This file records each piece in
> their words, plus a mapping onto the code that exists today. All 22 open
> questions were put to them and answered on 2026-09-11 — see the Decisions log
> at the bottom, which is the authoritative list. The sections above are the
> reasoning that produced it.
>
> **Built in nine commits on `archive-upgrade`**, in dependency order: schema
> v4 (stages) → scaffold removal → RELEASES stood down → schema v5 (tree in
> `Projects`, stored folder kinds) → the icon stamp → schema v6 (origins) and
> the loose-`.als` fix → schema v7 (audio marks) → bulk filing and copy mode →
> the drill-down picker → multi-select → the migration view.
>
> **The migrations have not been run.** Schema v4 to v7 execute on the next app
> launch and, between them, rewrite stage values, move the operator's genre
> folders on disk into `Projects\GENERAL\`, backfill origins and reshape the
> master picks. They are idempotent and each explains itself at the point of
> change, but they act on real data and real directories, so the first launch
> should be a deliberate one.
>
> **One decision is only partly built.** D22 asked for a refusal *and* a picker
> when a project's origin is unreachable. The refusal is in place and names the
> path it expected; it points the operator at "File to…" rather than opening a
> destination picker for them. The gesture exists, but it is two steps where
> one was asked for.
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
  See §3.2.
- **MANAGEMENT** — creating and running projects from here on: projects, WIPs,
  final mixdowns, stems.

### 3.0 Standing constraints

Rules the operator has stated that apply across the whole system, not to one
mechanism. Treat these as decided.

**C1 — Never rename a project folder. Migration takes the name exactly as the
operator wrote it, and does not append ` Project`.**

> "We don't want to rename projects, or while migrating we are not going to add
> 'Project' in the end — just the way the user named it."

Status against today's code:

- **Moving already honours this.** `fileProject()` builds its destination as
  `join(destinationParent, basename(record.path))`, so the folder name survives
  a move untouched. Nothing in the filing or bin paths renames anything.
- **Creation does not.** `provisionProject()` appends the suffix deliberately:
  `` const folderName = `${name} Project` ``. The recorded reason is that
  `cleanProjectName()` strips exactly that suffix to derive the display name,
  so "the register should not be able to tell which projects the app created."
  Whether C1 overrides this is Q10.
- **Display names are still derived, not verbatim.** `cleanProjectName()` strips
  a trailing ` Project` to produce `name`, while `folderName` keeps the real
  directory name. No disk rename is involved, but a folder called
  `My Beat Project` shows in the register as `My Beat`. Whether that counts as
  "renaming" under C1 is Q11.

**C2 — No scaffold folders. A project folder is the set plus whatever Live
makes, and nothing of ours.**

> "Also we don't need the 6 scaffolding folders."

`provisionProject()` currently creates `WIPS`, `MIX & MASTER`, `STEMS`,
`GRAPHICS`, `MARKETING` and `REFERENCES` in every project it makes. These go.

Blast radius is small — `PROJECT_SCAFFOLD_FOLDERS` has four references:
`project-provisioner.ts` (the loop that creates them), `ProjectDialog.tsx` and
`SetupGate.tsx` (explanatory copy naming them), and the re-exports in
`domain/projects.ts`. **The release scaffold goes too** — confirmed
separately. `RELEASE_SCAFFOLD_FOLDERS` (`MASTER`, `ART`, `COPY`) is a different
mechanism, created under a release directory when a release is cut, but the
operator wants it gone on the same grounds.

That one has a behavioural knock-on the project scaffold does not.
`ReleasesService.attach()` *copies* each deliverable into its scaffold folder
and records `copiedPath` — `DELIVERABLE_DESTINATION` maps master → `MASTER`,
cover and canvas → `ART`. With the folders gone, deliverables are copied to the
release directory root instead, and `DELIVERABLE_DESTINATION` is deleted. The
release directory itself moves from `RELEASES` to `Release Master` under the new
wrapper layout — see Q6.

This is consistent with how the app already tracks deliverables: `masters`
(`prefinal` / `final`) on the record points at whichever audio file the operator
picked, and the scanner lists every audio file outside `Samples\` as a
candidate. Neither has ever required the file to sit in a particular folder —
the folders were a filing convention the app never actually read.

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

**On the custom folder icon — this is Ableton's own mechanism, not something we
invent.** Verified against a real Live-made project at
`C:\Users\hanee\Desktop\Music\Hyperpop Project`:

```
Hyperpop Project\                       ← attributes: ReadOnly, Directory
├── Ableton Project Info\
│   └── AProject.ico                    ← 481,686 bytes, per project
├── Backup\
│   └── Hyperpop [2026-07-17 174440].als   ← and nine more
├── Samples\
│   └── Processed\
├── Desktop.ini                         ← attributes: Hidden, Archive
└── Hyperpop.als
```

`Desktop.ini`, exactly as Live writes it:

```ini
[.ShellClassInfo]
ConfirmFileOp=0
NoSharing=0
IconFile=Ableton Project Info\AProject.ico
IconIndex=0
```

Three corrections to the earlier guess in this file:

1. It is `IconFile` + `IconIndex`, **not** `IconResource`.
2. The `.ico` is **per project**, inside `Ableton Project Info\` — not one shared
   copy in the wrapper. Every project carries its own ~470 KB.
3. Three things must all be true for Explorer to draw it: the `Desktop.ini`
   exists with that content, it is **Hidden**, and the *project folder itself*
   carries **ReadOnly**. Miss the ReadOnly attribute and the icon silently does
   not appear.

**Which explains the reference screenshots.** `idk honestly Project` has the
icon because Live saved it and wrote all three. `Test project Project` does not,
because `provisionProject()` only copies the template `.als` and makes the
scaffold folders — there is no `Ableton Project Info\`, no `Desktop.ini` and no
ReadOnly attribute until Live opens the project for the first time.

**So requirement 4 means: do what Live does, at creation time**, so a
Candy Haven project looks right in Explorer before Live has ever touched it.
Where our copy of `AProject.ico` comes from is Q9.

Two knock-on risks worth recording now:

- **`Ableton Project Info` is already in `SCAN_IGNORED_DIRECTORIES`**, so the
  walk never descends into it and the `.ico` is not indexed as project artwork.
  That stays correct and needs no change.
- **Cross-volume migration may drop the icon.** `copyAcrossVolumes()` uses `cp`
  recursive; if it does not carry the ReadOnly attribute across, every project
  migrated from another drive arrives looking like a plain folder even though
  its `Desktop.ini` and `.ico` came over intact. Needs testing, and probably an
  explicit re-stamp of the attribute after any copy. Same-volume `rename()` is
  unaffected — attributes travel with the directory entry.

### 3.2 MIGRATION

**Dictated by the operator:**

> "Migration is a similar way as before but we get a **side-by-side migration
> mode**.
>
> We either get to **drag and drop** it at a specific folder like we have right
> now, or we **right click and drop** it to where we want it — like
> `Dubstep -> [Folder] -> final location`. Basically it could be any sort of
> depth, it could be shown in the right click and migrated.
>
> When migrating, the user gets to put something in **the settings** saying if
> he wants to **copy** all the files of a project that he selected in archive,
> or **move** them."

Three parts, at three different distances from what exists.

**(a) Side-by-side migration mode — new.** A dedicated mode showing source and
destination together, rather than today's arrangement where UNFILED is a panel
beside the folder browser. Shape not yet specified — see Q13.

**(b) Placement by drag, or by a deep right-click picker.** Both gestures exist
today; the second is not fit for the new depth.

- Drag and drop onto a folder: works today, one project at a time (§2.4).
- Right-click → "File to…": exists, but renders a **flat list of every folder
  by bare name**, in reading order:

  ```tsx
  filingTargets.map((folder) => <Item label={folder.name} … />)
  ```

  No nesting, no path, no indication which folder sits inside which. With
  today's shallow tree that is survivable. Under the proposed hierarchy —
  `Projects\<category>\<genre|artist>\<subfolder>` — it becomes a flat wall of
  names where three folders called `Misc` are indistinguishable. The operator
  wants it **cascading**, walking the tree to arbitrary depth, with the final
  destination chosen at the end of the walk.

**(c) Copy or move, chosen in settings — new, and the most consequential.**
`fileProject()` always **moves** today; `moveDirectory()` is `rename()` on one
volume and verified copy-then-delete across volumes. There is no copy path at
all, and no setting for one.

The significant consequence is what copy does to the register. If the project is
copied rather than moved, the original stays at the source root, and **the next
scan walks both**:

- the original at e.g. `C:\Users\hanee\Desktop\Music\Hyperpop Project`, and
- the copy at `…\Candy Haven\Projects\Personal\Dubstep\Hyperpop Project`.

`findRelinked()` will not merge them — it explicitly skips any record whose own
path was also found in this scan, precisely so that two folders sharing a name
are treated as two projects. So copy mode produces **two records with the same
name**, each with its own stage, tags and notes, diverging from the moment they
are made. Whether that is intended, and which one the register should consider
canonical, is Q12.

Secondary: copying duplicates `Samples\`, so a copy-mode migration of a large
library costs real disk space. Worth surfacing in the UI before it runs.

### 3.3 Multi-select migration

> "There should be a multi-select migration as well, where I can move multiple
> projects along with its corresponding files."

This is §2.4 applied to migration: select several projects and place them in one
gesture, each carrying its whole folder. "Along with its corresponding files" is
already guaranteed by the move path — the unit is always the whole project
folder (§2.2) — so the new work is entirely the selection model and the bulk
operation, which is singular at every layer today including the IPC contract.

Partial-failure policy is Q5 and now matters more: a bulk migration is exactly
where a name collision part way through is likely.

### 3.4 Conforming a migrated project to the house structure

> "We need to come up with a mechanism to convert these migrated projects into
> how Candy Haven is structured. Like let's say we have a project we created
> through the archive and a project we migrated — they should be similar in
> structure."

**This answers Q2: yes, an adopted project is brought up to the same shape as a
created one.** The two are visibly different today:

| | Created by Candy Haven | Migrated (Live-made) |
| --- | --- | --- |
| `<name>.als` | ✓ copied from template | ✓ |
| `WIPS`, `MIX & MASTER`, `STEMS`, `GRAPHICS`, `MARKETING`, `REFERENCES` | ✓ | ✗ |
| `Ableton Project Info\AProject.ico` | ✗ *(until §3.1 lands)* | ✓ |
| `Desktop.ini` + ReadOnly, so the icon draws | ✗ *(until §3.1 lands)* | ✓ |
| `Backup\`, `Samples\` | ✗ until Live saves | ✓ |
| Loose rendered audio at the project root | ✗ — bounces go in `MIX & MASTER` / `WIPS` | ✓ commonly |

**C2 removes most of the difference.** With no scaffold folders, a created
project and a migrated one differ by one thing: whether the icon is stamped.
`Backup\` and `Samples\` are Live's to make on first save and should not be
faked. So conforming reduces to:

1. **Icon stamp** — the §3.1 helper: ensure `Ableton Project Info\AProject.ico`,
   write `Desktop.ini`, set the folder ReadOnly. A no-op for a Live-made project
   that already has all three; the fix for one Candy Haven made and Live has
   never opened.

It should be idempotent and runnable against any project at any time, not only
at the moment of migration — which makes "conform" a verb the operator can apply
across the whole archive rather than a hidden side effect of a drag.

**Q14 is moot under C2.** The question of whether to sort loose bounces into
`MIX & MASTER` / `WIPS` disappears with the folders: there is nowhere to sort
them to, and loose files at the project root are now the house standard for both
kinds of project. Nothing moves files inside a project folder any more.

### 3.5 WIPs, masters and the final — records, not folders

> "The user is going to store all the project's WIPs in the project's folder
> itself — like let's say in `Beatout`, we have a section where we can select
> specific audio files to be a part of **WIPs**, **masters** (different mastered
> song versions), and **a final mix and master** (for release)."

**This answers Q16, and it is why C2 works.** Every bounce stays loose in the
project folder. What gives them meaning is a selection made in the app against
the audio the scanner already found — `record.audio`, which is every audio file
outside `Samples\`, capped at 400. Dropping the scaffold folders does not lose
information, because the folders were never where the information lived; it
moves the classification from *where a file sits* to *what the operator says it
is*, which is the one place it cannot drift out of step.

**Against today's model.** The record has exactly two single-valued slots:

```ts
MASTER_PICKS = ['prefinal', 'final']
MasterSelectionSchema = { prefinal: string | null, final: string | null }

prefinal: 'The candidate currently being lived with. Expected to be replaced.'
final:    'The exact file that ships. Chosen from the bounces found in this project.'
```

The proposal generalises this to three buckets, two of them lists:

| Bucket | Cardinality | Today |
| --- | --- | --- |
| WIPs | many | — nothing |
| Masters (mastered versions) | many | `prefinal`, but only one |
| Final mix and master | one | `final` — unchanged |

So `prefinal` becomes `masters[]`, `wips[]` is new, and `final` survives as is.

**Blast radius — `final` is load-bearing.** It is not just a label:

- `PROJECT_STAGES` carries `requiresMaster`, gating entry to the later stages.
- `evaluateReadiness()` / `isReleaseReady()` read the selection.
- `ReleasesService.create()` attaches `subject.finalMaster` automatically when
  raising a release, so the operator is not asked to choose the same file twice.

Keeping `final` singular and in place means none of that has to change — only
the two list buckets are new. See Q17 for the one thing that is genuinely open.

#### Setting the final writes a named file to the wrapper

> "**Release Mastered Tracks** (the folder which is in `Candy Haven\`) is where
> the final mix and masters are saved. When he is setting this, he gets to name
> the file."

So designating the final is not only a record edit — it puts a file on disk:

```
Candy Haven\Release Mastered Tracks\<name the operator types>.wav
```

**Folder name discrepancy — see Q19.** §3.1 recorded this primitive directory as
`Release Master`; it is `Release Mastered Tracks` here. Taking the later,
fuller name as correct, but worth confirming since it is created on disk.

**The shape this needs already exists in the codebase.** `ReleasesService` holds
each deliverable as

```ts
master: { sourcePath: null, copiedPath: null, copiedAt: null }
```

— where the file came from, where the copy landed, and when. That is exactly
what setting a final needs: the bounce stays in the project folder (`sourcePath`)
and a named copy lands in `Release Mastered Tracks` (`copiedPath`). Reusing the
shape rather than inventing a second one keeps one answer to "where is the file
that ships".

Three things this raises, all in Q20: whether it is a copy or a move, what
happens on a name collision in what is now a flat shared folder, and what
happens to the old file when the final is changed or cleared.

### 3.6 The pipeline stops at TRACK READY

> "We can remove the stages/phases after the mix and master stage. We have a
> final stage called **TRACK READY** — we will decide in future for the system
> for releasing and wrapping the project up. For now this is all we need."

**The table today — nine stages:**

`idea` → `sketch` → `arrangement` → `mix` → `master` → `ready` → `scheduled`
→ `released`, plus `shelved` off-pipeline.

**Proposed — seven:**

`idea` → `sketch` → `arrangement` → `mix` → `master` → `ready` *(relabelled
**TRACK READY**, now `terminal: true`)*, plus `shelved` off-pipeline.
`scheduled` and `released` are deleted.

**The code change is contained.** Nothing outside `projects.constants.ts`
references `'scheduled'` or `'released'` as literals — the board columns, the
stage strip and the progress meter are all generated from `PROJECT_STAGES`, so
they shrink on their own. `requiresMaster` stays on `ready`, so the master
selection keeps gating entry to the final stage.

**The data change is not, and this one bites.** Records are validated on the way
out of the database, and an unreadable one is *skipped*:

```ts
const parsed = ProjectRecordSchema.safeParse({ id: _id, ...rest })
if (!parsed.success) {
  logger.warn(`Skipping unreadable project record ${_id}`, …)
  return null
}
```

`ProjectStageSchema` is `z.enum(PROJECT_STAGE_IDS)`, and `stageHistory[].stage`
uses it too. So the moment the enum shrinks, any project sitting in `scheduled`
or `released` — **or merely carrying one of them in its stage history** — fails
to parse and disappears from the register.

It gets worse than disappearing. The comment reasons that "a rescan rewrites
it", which was true for the failure that comment was written for. It is not true
here:

1. `listAll()` drops the unreadable record, so it is absent from `existing`.
2. `reconcile()` finds no match by path and no relink candidate, so it takes the
   *new project* branch and issues an `insertOne`.
3. The orphaned document is still in Mongo holding that `path`, and
   `project_path_unique` is a unique index on `path` — so the insert collides.

The project would be permanently unreadable rather than merely reset, and the
operator's stage history, notes, tags and filing would go with it.

**This is a migration, not a constant edit.** `applyMigrations()` in
`archive/schema.ts` is already a versioned runner at `SCHEMA_VERSION` 3, with
precedent for exactly this kind of field rewrite at v3 (`tags` → `tagIds`). A
v4 step must rewrite `stage` and every `stageHistory[].stage` off the removed
values — presumably onto `ready` — **before** the enum shrinks. See Q22.

### 3.7 Audio selection follows the stage — refinement, 2026-09-12

> "Once we are on mix or master stage, we get a button or section in OVERVIEW
> where it is represented as icons of all the audios in the project folder. We
> select the mix and masters files at their respective stages. And when we do
> ready for release, that's when we select the final master or mix from the
> things we have selected, and then it is moved to the final master directory
> (with file rename before moving)."

**This revises §3.5 and reverses D13.** As built, the three buckets live on the
FILES tab, are available at every stage, and the final may be any audio file in
the project. The proposal ties the whole thing to the pipeline:

| | As built | Proposed |
| --- | --- | --- |
| Where | FILES tab, panel 01 | OVERVIEW, at MIX and MASTER stages |
| What is marked | WIPs, masters | Mixes at MIX, masters at MASTER |
| Drawn as | Rows with mark buttons | Icons of the project's audio |
| The final | Any audio file (D13) | Chosen **from what was marked** |
| When the final is set | Any time; gates TRACK READY | On moving to TRACK READY |
| The move + rename | Already as described | Unchanged |

The shape of it is coherent: the operator marks what they produced at the stage
they produced it, and the last step chooses among those rather than starting
from the whole folder again. It also answers the question that prompted it —
"where do I select my final mix and master" — by putting the selection on the
tab the operator is already looking at, at the moment the stage makes it
relevant.

Open: whether the buckets are renamed to match the stages, whether the final
may come from mixes as well as masters, whether the picker is part of the
TRACK READY transition or merely gates it, and whether the section is hidden
before MIX. See Q24–Q27.

---

## Open questions

**All resolved.** Kept for the reasoning behind each; the answers are in the
Decisions log below, which is what to build from. Q2, Q14 and Q16 were closed by
later dictation rather than by a decision.

- **Q1 — "multiple root folders": sources or destinations?** Does this mean more
  than one place to *look for* projects (close to today's `satelliteRoots`), or
  more than one place to *file them into* (multiple filing roots / wrappers)?
  If destinations: when a project is unfiled, or restored from the bin, which
  root does it go back to?

- **Q2 — ~~should an adopted project be scaffolded?~~ ANSWERED by §3.4:** yes.
  A migrated project is conformed to the same shape as a created one. The
  remaining half — whether loose files are *sorted into* the scaffold rather
  than the folders merely created — carries forward as Q14.

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

- **Q9 — the project icon. Recommendation below; confirm or overrule.**

  **Use Ableton's own `AProject.ico`, never a Candy Haven one.** Live writes its
  own copy the first time it saves a project, so any icon we invent is either
  replaced under the operator or leaves two visually distinct populations of
  project folder for no functional reason. Ableton's icon makes the folder look
  identical before and after Live first touches it — the same principle already
  recorded in `provisionProject()`: the register should not be able to tell
  which projects the app created.

  **Source it from Live's installation, resolved once and cached in userData.**
  Verified on this machine:

  ```
  C:\ProgramData\Ableton\Live 12 Suite\Resources\Misc\AProject.ico   481,686 bytes
  ```

  Byte-identical in size to the copy inside `Hyperpop Project\Ableton Project
  Info\` — Live copies this file verbatim rather than generating anything per
  project. Cascade:

  1. Cached copy in userData, if already resolved.
  2. `C:\ProgramData\Ableton\<edition>\Resources\Misc\AProject.ico`. Skip
     dot-prefixed directories — this machine also has a staged
     `.Live 12 Suite_updated` beside the live one.
  3. Any indexed project's `Ableton Project Info\AProject.ico`, covering a
     non-standard install path.
  4. Skip the icon; Live writes it on first save. Only reachable when Live is
     not installed at all.

  This closes the fresh-machine case: the icon is available before a single
  project has been indexed. The template cannot be a source — the operator's
  template is a bare `.als` in Ableton's User Library, not a project folder.

  Note the app has no Live-path resolution today to reuse: `openInLive()` calls
  `shell.openPath()` and lets the OS file association do the work. This needs a
  small new locator in the shape of `archive/binary-locator.ts`.

- **Q10 — does C1 apply to *creating* projects too?** `provisionProject()`
  currently appends ` Project` to match Ableton's own convention, so an
  app-made folder is indistinguishable from a Live-made one. Should newly
  created projects keep that suffix, or be named exactly what the operator
  typed — accepting that app-made and Live-made folders then look different on
  disk?

- **Q11 — should the register display the folder name verbatim?** Today
  `cleanProjectName()` strips a trailing ` Project` for display only, so
  `My Beat Project` on disk reads as `My Beat` in the UI. Nothing is renamed on
  disk. Does C1 mean this should stop, and the register show exactly what the
  folder is called?

- **Q12 — what does COPY mode mean for the register?** Copying leaves the
  original at the source root, so the next scan finds both it and the copy and
  registers them as two separate projects with the same name, each accumulating
  its own stage, tags and notes. Options: (i) accept two records; (ii) the
  original is forgotten from the register once copied, leaving the file on disk
  as a backup but only one record; (iii) the source root is excluded from
  scanning after migration; (iv) the two are linked so one record has two paths.
  Related: should copy/move be a global setting as dictated, or a choice made
  per migration at the moment of the drop?

- **Q13 — what is on each side of the side-by-side view?** Left = the source
  roots as a real directory tree, right = the `Candy Haven\Projects` tree? Or
  left = unfiled projects as a list, right = the destination tree? And does the
  left side browse *directories on disk*, including folders that are not
  projects, or only the projects the register already knows about?

- **Q14 — ~~does conforming move files, or only create folders?~~ MOOT under
  C2.** With no scaffold folders there is nowhere to sort loose files to, and
  nothing moves files inside a project folder.

- **Q16 — ~~where do WIPs, mixdowns and stems live?~~ ANSWERED by §3.5:** loose
  in the project folder, classified by selection in the app rather than by which
  folder they sit in.

- **Q17 — must the final be one of the masters?** Is "final mix and master" a
  promotion of one entry from the masters list — so choosing it picks from what
  is already there — or an independent pick from any audio file in the project?
  Follow-on: can one file appear in two buckets at once (a WIP that is also a
  master), or is each audio file in exactly one?

- **Q18 — what about stems?** §3 named "wips, final mixdowns and stems" as the
  things MANAGEMENT looks after, but §3.5 describes only three buckets. Are stems
  a fourth bucket, or out of scope for now?

- **Q15 — when does conforming run?** Automatically as part of every migration,
  or an explicit verb the operator applies? And should it be runnable
  retroactively against projects already in the archive — including the 26
  already indexed?

- **Q19 — `Release Master` or `Release Mastered Tracks`?** §3.1 recorded the
  first, §3.5 the second. This directory gets created on disk, so the name has to
  be settled.

- **Q20 — mechanics of writing the final master.** (a) Copy the bounce into
  `Release Mastered Tracks` and leave the original in the project, or move it?
  (b) It is a flat folder shared by every project, so two projects can produce
  the same operator-typed name — refuse, suffix, or overwrite? (c) When the final
  is changed to a different bounce, or cleared, does the previously written file
  get deleted, left behind, or replaced?

- **Q21 — what happens to RELEASES in the meantime?** §3.6 defers "the system
  for releasing and wrapping the project up" to a future decision, but the
  RELEASES lens, service, collection and directory all exist and work today, and
  §3.5 adds a second place a final master is written. Options: leave RELEASES
  running untouched; hide the lens until it is respecified; or strip it back now
  so there is one answer to "where is the file that ships". Related: with
  `scheduled` and `released` gone from the pipeline, a release can no longer
  move a project's stage.

- **Q22 — confirm the stage migration target.** A v4 migration must rewrite
  every project sitting in `scheduled` or `released`, and every `stageHistory`
  entry naming them, before the enum shrinks — otherwise those records become
  permanently unreadable (§3.6). Rewriting both onto `ready` is the obvious
  target. Should the historical entries be rewritten in place, or dropped from
  the history so it does not claim a stage the project never reached under the
  new table?

- **Q3 — where does "home" point when it no longer exists?** If §2.1 is fixed by
  remembering a project's origin, what should taking it off the shelf do when
  that origin is unreachable — external drive unplugged, folder deleted, or the
  root removed from settings? (Refuse / fall back to the filing root / ask.)

---

## Decisions log

Answered by the operator on 2026-09-11.

- **D1 (Q1) — Multiple roots means multiple *sources*.** "Where we can find
  directories for project files." One filing root, one `Candy Haven` wrapper.
  `satelliteRoots` is already a list, so this is close to what exists;
  `requireWrapper()`, `unfiledDestination()` and `pruneMissingFolders()` keep
  their single-wrapper assumption.

- **D2 (Q12) — COPY migration yields one record, and the original is skipped.**
  The record follows the copy into `Candy Haven`. The original stays on disk
  untouched, is remembered as the project's origin, and is excluded from future
  scans so no duplicate appears.

- **D3 — MOVE is the default migration mode.** Copy is the opt-in, not the
  other way round. (Volunteered alongside Q12.)

- **D4 (Q8) — Categories are ordinary folders.** A category is a folder record
  directly under `Projects`, reusing the existing tree wholesale — colours,
  renaming, re-parenting, drop targets, counts. The only new rule is that depth
  0 under `Projects` is named "category".

- **D5 (Q7) — Folder types have fixed positions.** Genre and Artist are stored
  on the folder and only valid **directly under a category**. Either may hold
  projects and plain sub-folders, but never each other:
  `Personal\Dubstep\Nasko\` is refused, as is `Personal\Nasko\Dubstep\`.

- **D6 (Q6) — The existing wrapper is auto-migrated.** On first launch, create
  `Projects\`, make one category, and move the current genre folders under it,
  rewriting the folder records' paths in the same migration. No hand re-filing.

- **D7 (Q19) — The directory is `Release Mastered Tracks`.** Not
  `Release Master`.

- **D8 (Q22) — Removed stages are rewritten onto `ready`,** both the project's
  current stage and every `stageHistory` entry naming `scheduled` or `released`.
  Nothing is dropped; the timeline stays continuous. Ships as schema v4.

- **D9 (Q9) — The project icon is harvested from Live's install.** Copy
  `AProject.ico` from `C:\ProgramData\Ableton\<edition>\Resources\Misc\` once,
  cache in userData, stamp every created project. Nothing shipped or
  redistributed. Fallbacks as recorded in Q9.

- **D10 (Q10) — Created projects keep the ` Project` suffix.** C1's no-rename
  rule governs *migration*; creation still follows Ableton's convention so an
  app-made folder is indistinguishable from a Live-made one.

- **D11 (Q11) — The register keeps stripping ` Project` for display.** Display
  only; `cleanProjectName()` stays. Nothing is renamed on disk.

- **D12 (Q18) — No stems bucket.** Three buckets only: WIPs, masters, final.
  Stems remain ordinary unclassified files in the project folder.

- **D13 (Q17) — The final can be any audio file in the project,** not only one
  promoted from the masters list. The picker offers everything the scanner
  found.

- **D14 (Q17b) — WIP and master are mutually exclusive.** A file is a WIP, or a
  master, or unmarked. The final is a separate designation and may point at a
  file already carrying one of those marks.

- **D15 (Q20a) — Setting the final MOVES the bounce** into
  `Release Mastered Tracks`, under the operator-typed name. It does not stay in
  the project folder.

- **D16 (Q20b) — Changing the final moves the old file back** into the project
  folder, then moves the new one out to `Release Mastered Tracks`. One file, one
  place, always — and the folder is an accurate list of finished tracks.

- **D17 (Q20c) — A name collision is refused.** The operator is asked to rename;
  nothing is overwritten or silently suffixed. Consistent with
  `moveDirectory()`, which already refuses rather than merging.

  **Follow-on — Q23, now D23:** when a demoted final moves back into the
  project folder, it keeps the operator-typed name. Also: `Release Mastered Tracks` should join
  `RESERVED_WRAPPER_DIRECTORIES` so a category cannot be created with that name,
  and the record needs to remember the file's in-project path for D16 to be able
  to put it back.

- **D18 (Q13) — Side-by-side shows two directory trees.** Left browses the
  source roots as real directories; right browses the `Candy Haven` tree. Not a
  flat unfiled list — seeing how work is currently organised on disk is part of
  deciding where it belongs.

- **D19 (Q5a) — Bulk operations move what they can and report the rest.** One
  name collision does not block the rest of the batch; the failures are named at
  the end.

- **D20 (Q5b) — Multi-select covers folders as well as projects.** Note this is
  the heavier option: re-parenting a folder cascades a path rewrite across every
  descendant, so bulk folder moves need the partial-failure reporting of D19 to
  be genuinely trustworthy, and `cascadePaths()` becomes a hot path.

- **D21 (Q21) — RELEASES is turned off, not deleted.** Hide the lens, stop
  creating release directories, leave the service, collection and existing
  records in place. Nothing competes with `Release Mastered Tracks`, and the
  mechanism is still there when releasing is respecified.

- **D22 (Q3) — An unreachable origin refuses, then offers a picker.** Taking a
  project off the shelf when its origin is gone moves nothing and says why; the
  operator can plug the drive back in and retry, or choose a destination from
  the same refusal. It never silently falls back to the filing root — that is
  the flaw in §2.1.

- **D23 (Q23) — A demoted final keeps the operator-typed name.** It returns to
  the project folder as `Hyperpop Final.wav`, not as whatever it was called
  before promotion. The name was a deliberate choice, and C1 says the app does
  not rename the operator's files.

- **D24 (Q4) — A configured root is never a project, and a stray set is logged.**
  The walk descends past a loose `.als` at the top of a root and finds the real
  projects beneath it. One line in the indexing log names the stray file, since
  a set outside any project folder is nearly always a mistake.

- **D25 (Q15) — Conform runs on migration, and there is a fix-all pass.**
  Anything migrated is stamped as it lands, and a separate action walks the whole
  archive stamping whatever is missing — which is what brings projects created
  before this change (e.g. `Test project Project`) up to standard. Idempotent, so
  both paths are safe to re-run.

- **D26 (Q24) — Three buckets: WIPS, MIXES, MASTERS.** A rough bounce and a
  considered mix stay distinguishable. MIXES is marked at the MIX stage and
  MASTERS at MASTER; WIPS belongs to no stage, since a bounce worth keeping can
  happen at any of them.

- **D27 (Q25) — The final may be promoted from a mix or a master,** not masters
  alone. A track that never got a separate mastering pass can still ship. WIPS
  are excluded: kept for reference, never meant to go out.

- **D28 (Q26) — Pressing TRACK READY asks which file ships.** Reaching that
  stage *is* choosing the final, so the transition opens the picker, takes the
  name, moves the file and then advances — in that order, because a stage
  claiming the work is finished while the move failed is the worse of the two
  states to be left in. Re-entering the stage with a final already set passes
  straight through.

- **D29 (Q27) — The audio panel appears from MIX onward,** on OVERVIEW rather
  than FILES. Reverses part of §3.5: it was correct on FILES and unfindable
  there. What is marked changes with the stage, so the panel asking belongs on
  the tab the stage lives on. FILES is now purely an inventory, which is what
  it is named for.

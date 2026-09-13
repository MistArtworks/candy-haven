# Screenshots to capture

Every image the CATECHISM references, generated from the Markdown itself — so
this list is exactly what the documentation asks for, no more and no less.

**Drop the files in this folder.** No code change, no import, no registry entry.
`lib/guide-assets.ts` globs the directory at build time and resolves each image
by filename.

A name with no file renders a captioned `CAPTURE PENDING` plate showing the
filename it wanted, so you can also open CATECHISM in the app and read the
outstanding list off the page.

---

## Before you start

|             |                                                             |
| ----------- | ----------------------------------------------------------- |
| Format      | PNG                                                         |
| Window size | 1600 × 1000, or any size — **the same one for all of them** |
| Accent      | crimson (REGULATION → PRESENTATION → Accent)                |
| Motion      | full                                                        |
| UI scale    | 1.0                                                         |

Capture with `Alt`+`PrtScn` (active window) or `Win`+`Shift`+`S` (region). Full-
console shots keep the title bar and rail; detail shots crop to the panel.

Have real data on screen. An empty state teaches nothing — except the two places
a chapter documents one on purpose (`archive-05-setup`, `dispatch-02-door`).

> **Five shots can be reused under two names.** Take one capture, save it twice:
>
> - `nexus-01-landing.png` = `welcome-02-nexus.png`
> - `archive-01-lenses.png` = `welcome-04-archive.png`
> - `observatory-01-catalogue.png` = `welcome-05-observatory.png`
> - `auditorium-01-stage.png` = `welcome-06-auditorium.png`
> - `regulation-01-categories.png` = `welcome-07-regulation.png`
>
> That takes 41 files down to **36 distinct captures**.

Shortcuts worth knowing: `Ctrl`+`1`–`9` and `Ctrl`+`0` walk the rail, `Ctrl`+`,` opens
REGULATION, `Ctrl`+`E` cycles LIST / ICONS / BOARD, `Alt`+`1`–`5` switches
ARCHIVE lens.

---

## Session 1 — NEXUS (2 files)

`Ctrl`+`1`.

**`nexus-01-landing.png`** · also save as `welcome-02-nexus.png`

1. Land on NEXUS. Do not scroll.
2. Wait for the orb to settle — it reports archive health, so a steady orb means
   the database is up and the shot is representative.
3. Capture the full window.

**`nexus-02-overview.png`**

1. Scroll down once, or click the descend affordance.
2. Frame so panels **01 ARCHIVE** through **05 DEPARTMENTS** are visible.
3. Capture.

---

## Session 2 — ARCHIVE (9 files)

`Ctrl`+`3`. Do these in order; each builds on the last.

> ARCHIVE is the **third** chord, not the second. INTERFACE is reserved but
> still on the rail and still bound, so it holds `Ctrl`+`2` — the numbering
> follows what is drawn rather than skipping what is not built.

**`archive-01-lenses.png`** · also save as `welcome-04-archive.png`

1. Select the **STACKS** lens (`Alt`+`1`).
2. Set the view toggle in the panel header to **ICONS**.
3. Open a genre shelf with several projects on it.
4. Capture the full window — the lens rail must be legible down the left.

**`archive-02-board.png`**

1. Same shelf, switch the view toggle to **BOARD**.
2. Ideally have projects sitting in more than one stage column.
3. Capture.

**`archive-03-intake.png`**

1. Switch to the **INTAKE** lens (`Alt`+`2`).
2. In the left pane, walk into a folder that holds unfiled projects.
3. In the right pane, open the shelf you would file them into.
4. Optional but good: tick two projects so the selection bar is showing.
5. Capture both panes.

**`archive-04-dossier.png`**

1. Back to **STACKS**. Double-click a project to open its dossier.
2. Stay on the **OVERVIEW** tab.
3. Pick a project that has tags and notes on it — an empty dossier is a poor
   illustration.
4. Capture.

**`archive-07-stage.png`**

1. In the same dossier, frame the **STAGE** strip (panel 01).
2. Crop to the strip and the readiness note beneath it.
3. Capture.

**`archive-09-finalmaster.png`**

1. Open a project that has **no final master** chosen.
2. On the stage strip, click **TRACK READY**.
3. The final master dialog opens because the gate is unmet — that is the shot.
4. Capture, then **Cancel**. Do not commit unless you mean to.

**`archive-11-tags.png`**

1. In a dossier's OVERVIEW tab, find the **TAGS** panel.
2. Click **MANAGE**.
3. Capture the dialog.

**`archive-10-volumes.png`**

1. Switch to the **VOLUMES** lens (`Alt`+`3`).
2. Open a volume so its bound tracks are listed.
3. Capture. _(Skip if you have no volumes yet — the plate will stay pending.)_

**`archive-05-setup.png`** — the setup gate

1. Open REGULATION → **ARCHIVE** and **copy the current filing root somewhere**.
2. Clear the filing root.
3. Go to ARCHIVE. The setup gate is drawn instead of the register. Capture.
4. **Paste the filing root back.**

> This moves no files and deletes nothing — it only re-points the console. But
> do put the path back before carrying on, or the department stays gated.

---

## Session 3 — CALENDAR (3 files)

`Ctrl`+`4`. Have entries on a few days first, or the views look empty.

**`calendar-01-month.png`**

1. Select the **MONTH** view.
2. Page to a month with entries spread across several days.
3. Capture.

**`calendar-02-agenda.png`**

1. Switch to **AGENDA**.
2. Capture — the list should run several entries deep.

**`calendar-04-entry.png`**

1. In MONTH, click a day cell. The entry dialog opens on that date.
2. Fill in a title and a time so the dialog is not blank.
3. Capture, then close **without saving** if it was only for the shot.

---

## Session 4 — AUDITORIUM (4 files)

`Ctrl`+`5`.

**`auditorium-01-stage.png`** · also save as `welcome-06-auditorium.png`

1. Click **Admit a file** and open a track.
2. Press play. The status reads `SOUNDING`.
3. Let the playhead reach roughly a third in, so the waveform is clearly drawn.
4. Capture the full window.

**`auditorium-02-presets.png`**

1. Same file, still playing.
2. Frame the preset rail — WAVEFORM / SPECTRUM / SPECTRAL / STATIC.
3. Crop to the rail and the stage above it.
4. Capture.

**`auditorium-03-zoom.png`**

1. Zoom in on a region with a clear transient — a drop or a drum hit.
2. Capture the stage at that zoom.

**`auditorium-04-popout.png`**

1. Click **Pop out** in the masthead.
2. Capture the detached player window on its own.

---

## Session 5 — OBSERVATORY (6 files)

`Ctrl`+`Shift`+`O`. The broadcast server must be running for the addresses to be
real.

**`observatory-01-catalogue.png`** · also save as `welcome-05-observatory.png`

1. Land on the catalogue.
2. Confirm the **Broadcast server** panel shows a root address and `Serving`.
3. Capture the full window with as many overlay cards visible as fit.

**`observatory-02-card.png`**

1. Frame a single overlay card — THE CONCORD is a good one, it has two addresses.
2. The **Source** URL and the canvas size must be readable.
3. Crop to the card.
4. Capture.

**`overlay-muster-console.png`**

1. Open **THE MUSTER** (`Open console →` on its card).
2. Put a question and let a few entries onto the roll — test mode under
   REGULATION → REHEARSAL is the easy way if chat is not live.
3. Capture the console page.

**`overlay-concord-console.png`**

1. Open **THE CONCORD**.
2. File a ballot with three or four options and let some votes land.
3. Capture with the tally showing real numbers.

**`overlay-selection-scene.png`**

1. Open **RESONANCE SELECTION** and file several petitions.
2. Open its browser-source URL in a normal browser window.
3. Start a draw and capture the ring **mid-spin**.

**`overlay-chorus-console.png`**

1. Open **THE CHORUS** (`Configure and copy` on its panel).
2. Capture the configuration page.

---

## Session 6 — TELEMETRY (2 files)

`Ctrl`+`7`.

**`telemetry-01-vitals.png`**

1. Let the page run ten seconds so the sparklines have history in them.
2. Capture the tile row.

**`telemetry-02-cores.png`**

1. Frame the per-core strip below the tiles.
2. Best taken while the machine is doing something — an even set of idle bars
   says less than an uneven one.
3. Crop to the strip and capture.

---

## Session 7 — DISPATCH (3 files)

`Ctrl`+`8`.

**`dispatch-01-board.png`**

1. Sign in to the board.
2. Have a few items filed, ideally in different states.
3. Capture the board.

**`dispatch-03-thread.png`**

1. Open an item that has discussion on it.
2. Capture the thread.

**`dispatch-02-door.png`** — the identity band

1. Sign out.
2. Capture the band before signing back in. **Have the password to hand.**

---

## Session 8 — REGULATION (5 files)

`Ctrl`+`,`.

**`regulation-01-categories.png`** · also save as `welcome-07-regulation.png`

1. Open the **PRESENTATION** category.
2. Frame so the whole category nav is visible down the side.
3. Capture the full window.

**`regulation-02-archive.png`** — ARCHIVE category, filing root and satellites.

**`regulation-03-integrations.png`** — INTEGRATIONS category.

> **Blank the Spotify client id and the Twitch channel before capturing.** This
> image ships in the app.

**`regulation-04-board.png`** — BOARD category. Scrub the connection details too.

**`regulation-05-diagnostics.png`** — DIAGNOSTICS category, paths and versions.

---

## Session 9 — the whole console (1 file)

**`welcome-03-rail.png`**

1. Any department will do — NEXUS is cleanest.
2. Make sure the rail is **expanded**, not collapsed.
3. All four divisions must be visible: COMMAND, PRODUCTION, BROADCAST,
   OVERSIGHT.
4. Capture the full window.

---

## Session 10 — last, once everything else is in

**`welcome-08-documentation.png`**

1. `Ctrl`+`0` for CATECHISM — it is the tenth department.
2. Open the **THE CONSOLE** chapter.
3. Capture the full window — chapter rail on the left, prose on the right.

This is a picture of the documentation, so take it after the other captures have
landed. Otherwise it shows a page full of `CAPTURE PENDING` plates.

---

## Checklist

| Done | Filename                         | Tier                                   |
| ---- | -------------------------------- | -------------------------------------- |
| ☐    | `nexus-01-landing.png`           | 1                                      |
| ☐    | `nexus-02-overview.png`          | 1                                      |
| ☐    | `archive-01-lenses.png`          | 1                                      |
| ☐    | `archive-02-board.png`           | 1                                      |
| ☐    | `archive-03-intake.png`          | 1                                      |
| ☐    | `archive-04-dossier.png`         | 1                                      |
| ☐    | `calendar-01-month.png`          | 1                                      |
| ☐    | `calendar-02-agenda.png`         | 1                                      |
| ☐    | `auditorium-01-stage.png`        | 1                                      |
| ☐    | `auditorium-02-presets.png`      | 1                                      |
| ☐    | `observatory-01-catalogue.png`   | 1                                      |
| ☐    | `observatory-02-card.png`        | 1                                      |
| ☐    | `telemetry-01-vitals.png`        | 1                                      |
| ☐    | `dispatch-01-board.png`          | 1                                      |
| ☐    | `regulation-01-categories.png`   | 1                                      |
| ☐    | `welcome-02-nexus.png`           | 1 · copy of `nexus-01-landing`         |
| ☐    | `welcome-03-rail.png`            | 1                                      |
| ☐    | `welcome-04-archive.png`         | 1 · copy of `archive-01-lenses`        |
| ☐    | `welcome-05-observatory.png`     | 1 · copy of `observatory-01-catalogue` |
| ☐    | `welcome-06-auditorium.png`      | 1 · copy of `auditorium-01-stage`      |
| ☐    | `welcome-07-regulation.png`      | 1 · copy of `regulation-01-categories` |
| ☐    | `welcome-08-documentation.png`   | 1 · take last                          |
| ☐    | `archive-05-setup.png`           | 2                                      |
| ☐    | `archive-07-stage.png`           | 2                                      |
| ☐    | `archive-09-finalmaster.png`     | 2                                      |
| ☐    | `archive-10-volumes.png`         | 2                                      |
| ☐    | `archive-11-tags.png`            | 2                                      |
| ☐    | `auditorium-03-zoom.png`         | 2                                      |
| ☐    | `auditorium-04-popout.png`       | 2                                      |
| ☐    | `calendar-04-entry.png`          | 2                                      |
| ☐    | `dispatch-02-door.png`           | 2                                      |
| ☐    | `dispatch-03-thread.png`         | 2                                      |
| ☐    | `telemetry-02-cores.png`         | 2                                      |
| ☐    | `regulation-02-archive.png`      | 2                                      |
| ☐    | `regulation-03-integrations.png` | 2 · scrub secrets                      |
| ☐    | `regulation-04-board.png`        | 2 · scrub secrets                      |
| ☐    | `regulation-05-diagnostics.png`  | 2                                      |
| ☐    | `overlay-muster-console.png`     | 2                                      |
| ☐    | `overlay-concord-console.png`    | 2                                      |
| ☐    | `overlay-selection-scene.png`    | 2                                      |
| ☐    | `overlay-chorus-console.png`     | 2                                      |

---

## Where each one is used

Useful when a capture looks wrong on the page and you want the sentence it
illustrates.

| Filename                         | Appears in                                                        |
| -------------------------------- | ----------------------------------------------------------------- |
| `archive-01-lenses.png`          | `guides/archive.md`, `docs/archive.md`                            |
| `archive-02-board.png`           | `guides/archive.md`, `docs/archive.md`                            |
| `archive-03-intake.png`          | `guides/archive.md`, `docs/archive.md`, `docs/getting-started.md` |
| `archive-04-dossier.png`         | `guides/archive.md`, `docs/archive.md`                            |
| `archive-05-setup.png`           | `docs/getting-started.md`                                         |
| `archive-07-stage.png`           | `docs/archive.md`                                                 |
| `archive-09-finalmaster.png`     | `docs/archive.md`                                                 |
| `archive-10-volumes.png`         | `docs/archive.md`                                                 |
| `archive-11-tags.png`            | `docs/archive.md`                                                 |
| `auditorium-01-stage.png`        | `guides/auditorium.md`, `docs/auditorium.md`                      |
| `auditorium-02-presets.png`      | `guides/auditorium.md`, `docs/auditorium.md`                      |
| `auditorium-03-zoom.png`         | `docs/auditorium.md`                                              |
| `auditorium-04-popout.png`       | `docs/auditorium.md`                                              |
| `calendar-01-month.png`          | `guides/calendar.md`, `docs/calendar.md`                          |
| `calendar-02-agenda.png`         | `guides/calendar.md`                                              |
| `calendar-04-entry.png`          | `docs/calendar.md`                                                |
| `dispatch-01-board.png`          | `guides/dispatch.md`, `docs/dispatch.md`                          |
| `dispatch-02-door.png`           | `docs/dispatch.md`                                                |
| `dispatch-03-thread.png`         | `docs/dispatch.md`                                                |
| `nexus-01-landing.png`           | `guides/nexus.md`, `docs/nexus.md`                                |
| `nexus-02-overview.png`          | `guides/nexus.md`, `docs/nexus.md`                                |
| `observatory-01-catalogue.png`   | `guides/observatory.md`, `docs/observatory.md`                    |
| `observatory-02-card.png`        | `guides/observatory.md`, `docs/observatory.md`                    |
| `overlay-chorus-console.png`     | `docs/observatory.md`                                             |
| `overlay-concord-console.png`    | `docs/observatory.md`                                             |
| `overlay-muster-console.png`     | `docs/observatory.md`                                             |
| `overlay-selection-scene.png`    | `docs/observatory.md`                                             |
| `regulation-01-categories.png`   | `guides/regulation.md`, `docs/regulation.md`                      |
| `regulation-02-archive.png`      | `docs/regulation.md`                                              |
| `regulation-03-integrations.png` | `docs/regulation.md`                                              |
| `regulation-04-board.png`        | `docs/regulation.md`                                              |
| `regulation-05-diagnostics.png`  | `docs/regulation.md`                                              |
| `telemetry-01-vitals.png`        | `guides/telemetry.md`, `docs/telemetry.md`                        |
| `telemetry-02-cores.png`         | `docs/telemetry.md`                                               |
| `welcome-02-nexus.png`           | `guides/orientation.md`                                           |
| `welcome-03-rail.png`            | `guides/orientation.md`, `docs/overview.md`                       |
| `welcome-04-archive.png`         | `guides/orientation.md`                                           |
| `welcome-05-observatory.png`     | `guides/orientation.md`                                           |
| `welcome-06-auditorium.png`      | `guides/orientation.md`                                           |
| `welcome-07-regulation.png`      | `guides/orientation.md`                                           |
| `welcome-08-documentation.png`   | `guides/orientation.md`                                           |

---

## Adding one that is not on this list

Drop the file here and reference it from any Markdown document under
`src/renderer/src/features/catechism/content/`:

```markdown
![A short caption](my-new-capture.png)
```

The caption becomes the figure's caption on the page. Filename only — no path,
no import.

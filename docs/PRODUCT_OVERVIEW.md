# Candy Haven — What the Application Does

**Version 1.12.0 · Windows desktop application · Built for one working musician**

> A non-technical capability overview, written to be shown to someone outside the
> project. Compiled 2026-09-14 from the live department and overlay registries
> rather than from prose docs, which lag behind the code in places.

---

## 1. In one paragraph

Candy Haven is a single desktop application that runs the entire working life of one
music artist — DJ, producer and sound engineer **Candy Heist**. It files and tracks
every music project from first idea to finished master, keeps the calendar of sessions
and deadlines, plays and visually analyses audio, grades photographs into the brand's
look, powers every graphic that appears on his live streams, monitors the health of the
computer it runs on, and carries a shared request board between the artist and the
developer who builds it. Its stated purpose is to **replace the pile of separate apps**
a music practice normally needs, so that everything is in one place and every record can
reference every other.

It is styled deliberately as an institutional terminal from a fictional universe —
sections are called "departments", the database is called "the Archive", the user is
"the operator". That is a design choice, not a technical one, and it is consistent
throughout.

## 2. Who it is for, and the scale it is built at

- **Exactly two users**, permanently: the artist (who operates it) and the developer
  (who builds it).
- There are **no accounts, no sign-up, no roles, no multi-tenancy** — and there will not
  be. That is a settled product decision, not a gap.
- Everything lives on the artist's own machine, in a private database the application
  installs and runs itself. Nothing about his projects goes to a cloud service.
- The one exception is the shared feedback board (see DISPATCH), which is deliberately
  online so both people see the same list.

## 3. Current status at a glance

|                          | Count                              | Notes                                    |
| ------------------------ | ---------------------------------- | ---------------------------------------- |
| Departments (sections)   | **11 total — 10 live, 1 reserved** | Only INTERFACE is unbuilt                |
| Live-stream graphics     | **9 shipped**, plus a chat widget  | 1 more (THE DOCKET) specified, unbuilt   |
| Built-in manual chapters | 14                                 | Written as prose, shipped inside the app |
| Platform                 | Windows only                       | Installer-based, auto-updating           |

A department marked **RESERVED** is not an empty page — it lists exactly what it will do
when built, so the shape of the finished product is visible while it is being assembled.

## 4. How the application is organised

Departments are grouped into four **divisions**, which tell you what kind of question
each one answers:

| Division       | Purpose                                                        | Departments                                |
| -------------- | -------------------------------------------------------------- | ------------------------------------------ |
| **COMMAND**    | Seeing the system whole, and instructing it                    | NEXUS, INTERFACE _(reserved)_              |
| **PRODUCTION** | The work itself — what is filed, when it is due, how it sounds | ARCHIVE, CALENDAR, AUDITORIUM, DARKROOM    |
| **BROADCAST**  | What an audience sees while a stream is live                   | OBSERVATORY                                |
| **OVERSIGHT**  | The condition of the installation and the rules it runs under  | TELEMETRY, DISPATCH, REGULATION, CATECHISM |

Everything is numbered, every department has a keyboard shortcut, and the layout is
consistent from page to page.

---

## 5. Department by department

### NEXUS — the landing page and system overview _(live)_

The home screen. A large focal object shows, at a glance, whether the underlying
database is healthy, starting, degraded or down. Beneath it sit five status panels:

- **Archive** — database state, where its files live, response speed, the last thing it
  reported, and how many times it has had to restart itself.
- **Boot report** — how long the last startup took, how many of the nine startup stages
  completed, and _which stage was slowest_. If startup ever feels slow, this names the
  cause instead of leaving you guessing.
- **Runtime** — version information for the app and its components.
- **Update channel** — what version is installed, what is available, and what the
  updater is doing.
- **Departments** — the full register of sections, each marked in service or reserved.

### ARCHIVE — the project registry _(live — the largest department)_

This is the heart of the application: every piece of music, filed, tracked and carried
through to a finished release.

**Filing.** The artist nominates a "filing root" — a real folder on his hard drive.
Inside it, the app builds a three-level tree of **categories → genres/artists →
projects**, and it enforces the rules (a project cannot be dumped at the top level; it
needs a shelf). These are genuine folders on disk, so his existing library works as-is
and nothing is locked inside a proprietary store.

**Five ways to look at the register (lenses):**

| Lens    | Shows                                                               |
| ------- | ------------------------------------------------------------------- |
| STACKS  | The filing tree, browsed folder by folder                           |
| INTAKE  | Work found elsewhere on the disk that the register doesn't know yet |
| VOLUMES | Albums, EPs and compilations, and the tracks bound into each        |
| ALL     | The whole register as one flat list                                 |
| BIN     | Deleted projects, recoverable until the bin is emptied              |

**Three ways to draw whatever is in scope:** a grid of tiles, a detailed table, or a
**pipeline board** with drag-and-drop columns.

**The production pipeline** — six stages in a line plus one parking state:

`IDEA → SKETCH → ARRANGEMENT → MIX → MASTER → TRACK READY`, with `SHELVED` off to the
side.

Reaching **TRACK READY** is _enforced_: the app refuses it until a specific final mix and
final master file have been named. The stage is a claim about a real file, not a mood.
Every stage change is timestamped and kept, optionally with a note, as a project history.

**Automatic reading of Ableton Live projects.** The app opens each Ableton set file and
extracts real information rather than guessing: tempo, musical key, time signature,
track counts and names, number of scenes, arrangement length, which third-party plugins
are used, how many samples are referenced, and — usefully — **which referenced samples
are now missing from disk**. A corrupt or unreadable project degrades gracefully; it
still gets registered, with the problem noted.

**Bringing in outside work (INTAKE).** A two-panel screen: browse a folder on the left,
choose a destination shelf on the right, tick what to bring in, and file it. Name
collisions are resolved automatically and reported by name; anything that could not be
moved is listed individually with a reason. Whether intake moves or copies is a setting
(move is the default, so two diverging copies can't happen by accident).

**The project dossier.** Opening any project gives three tabs — an overview (tempo, key,
length, stage, tags, notes), the full record (analysis, register fields, stage history),
and the files in the folder. Two buttons lead the page: _open folder_ and _open in
Ableton_, both refused if the folder has gone missing.

**Marking a final master.** From the MIX stage onward, bounces can be marked as
work-in-progress, mixdown or master. When a project is declared finished, the chosen file
is **moved** into a single "Release Mastered Tracks" folder under a name the artist types
— so that folder is an accurate, complete list of finished tracks. Demoting reverses it
cleanly.

**Volumes and releases.** A _volume_ is an album/EP/compilation with tracks bound into a
running order. A _release_ is what actually ships: it gets its own folder outside the
genre tree, carrying **copies** of three deliverables — the final master audio, cover
art, and a vertical looping canvas video — plus a release date, notes, and a snapshot of
what category it went out as. Copies rather than moves, so shipping never leaves holes in
the library.

**Also:** freeform tags with colours the artist picks, per-project and per-folder colour
coding, favourites, search, filtering by stage/category/tag, five sort orders,
multi-select with tick / ctrl-click / shift-click, bulk drag-and-drop, a recoverable bin
that remembers where each project came from, and incremental re-scanning (unchanged
projects are served from stored analysis, so a rescan is cheap).

### CALENDAR — the dated register _(live)_

Sessions, deliveries and observances, in four views: **month, week, day and agenda**.
Entries can be all-day or timed, and come in five kinds — session, delivery, broadcast,
rite, deadline — each drawn in a distinct material so a month can be read as a shape
before reading a word of it. Deliberately not auto-populated from projects: a delivery
date written down should never silently move because something else changed.

### AUDITORIUM — the listening room _(live)_

Plays one audio file at a time and renders it visible, in four modes:

- **Waveform** — the whole file plus a zoomable window, coloured by frequency content so
  a drop and a breakdown are different colours; scroll to zoom continuously from a third
  of a second to the entire track; click or drag to scrub.
- **Spectrum** — live frequency content on a logarithmic scale, with smoothed and
  instantaneous readings overlaid so transients are visible.
- **Spectral** — a scrolling spectrogram, good for spotting resonances, noise and
  mastering artefacts.
- **Static** — no analysis, for when the console is on a second screen.

Files arrive by browsing, drag-and-drop, or straight from a project's dossier. The player
can be **popped out into its own always-on-top window** — the configuration it was
designed for, floating over the DAW on a second monitor. Whatever is playing also appears
in a mini transport bar in the app's title bar, so it keeps playing and stays reachable
from any department.

### DARKROOM — photo grading _(live)_

Takes a photograph and grades it into the brand's five-colour palette, so promotional
images match everything else. Full-resolution live preview with no quality trade-off.
Controls cover exposure, contrast, black and white points, gamma, a freeform tone curve,
and a colour ramp (with blend amount and saturation) whose default is the brand's own
colour ladder. Exports at full resolution through exactly the same processing shown on
screen.

### OBSERVATORY — the live-stream kit _(live)_

The broadcast department. The app runs a small local web server; each graphic is a page
OBS (the standard streaming software) picks up as a "browser source". The app itself is
the control desk driving them live.

The desk is a **board and a bench**. The board lists the whole kit at once — grouped
into chat instruments, clocks, standing scenes and furniture — and is purely a readout:
each row stays quiet until its overlay is doing something, then reports its live figure
and one line of detail. The bench beside it holds one overlay and everything the host
does to it: the verb that suits the phase it is in, the title and question it is put
against, one line for adding an option or an entry, the handful of settings that change
between segments, and every address it answers on. Deeper composition — a ballot, five
countdown faces, a marque — is one click away on that overlay's own page, which carries
the same bench as its own second panel so the two can never disagree about one setting.

Every graphic leads with **what kind of thing it is** and one plain sentence, then three
steps for how it runs, including the chat command. The in-world flavour line is still
there, faint, underneath.

| Graphic                     | Kind           | What it does                                                                                                                                                                                                                                                                                             |
| --------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **THE MUSTER**              | OPEN CALL      | An open call — the host puts a question on screen, chat submits entries with a chat command, entries fill a numbered, credited roll. One entry per viewer, duplicates refused, optional countdown. A finished roll can be handed straight to the draw or the vote with no re-typing.                     |
| **RESONANCE SELECTION**     | PRIZE DRAW     | A weighted prize draw with three visual mechanisms. Entries can carry a weight from 1–999 (so a subscriber or a paid request counts for more). Elimination mode walks through the field without repeats. The winner is decided before the animation starts, so the spin can never contradict the result. |
| **THE CONCORD**             | CHAT VOTE      | Chat voting on a ballot. One vote per viewer, changeable while open, timed or open-ended. Ties escalate to a visible tie-break draw. The host chooses how strictly votes are recognised (command only, bare number, or either) — a real turnout-vs-noise trade-off, exposed as a setting.                |
| **NOW TRANSMITTING**        | NOW PLAYING    | Live "now playing" from Spotify — track, artist, cover art, smooth timeline — in four layouts (lower band, portrait column, thin strip, spinning disc). Hides itself when nothing is playing.                                                                                                            |
| **INTERVAL**                | BREAK CLOCK    | A break countdown with a grace period that keeps counting past zero, five visual faces, and audio cues.                                                                                                                                                                                                  |
| **CONVENING**               | START CLOCK    | A "stream starting" countdown that resolves to a single word. Silent by default — nothing should warn an audience it is nearly time.                                                                                                                                                                     |
| **THE ENCLOSURE**           | STREAM FRAME   | A standing frame for the whole broadcast: corner brackets, a name plate along the bottom, and one "on air" indicator.                                                                                                                                                                                    |
| **THE GATE**                | STARTING SCENE | A full "stream starting soon" scene — an animated causeway and portal, with a headline, a sub-line, and a reserved, tinted band for the chat capture.                                                                                                                                                    |
| **THE SURVEY**              | BRB SCENE      | The "be right back" equivalent — a turning galaxy, same controls as the gate.                                                                                                                                                                                                                            |
| **THE CHORUS**              | CHAT FEED      | Chat displayed as a numbered institutional register. The one item with no address: the app generates the code and the host pastes it into Streamlabs.                                                                                                                                                    |
| **THE DOCKET** _(reserved)_ | REQUEST QUEUE  | A standing queue of chat requests showing what is being worked on next. Specified, not built.                                                                                                                                                                                                            |

**Across the whole kit:** every graphic has scale, text-size and opacity controls;
several serve both a full-screen scene and a matching corner widget from one live state,
so both stay in step; a positioning-guide mode can be switched on while cutting a scene
and removed before going live; and a **rehearsal mode** fills the graphics with realistic
synthetic traffic (up to 1,000 votes) so the host can test layouts, limits and timings
the evening before a stream rather than discovering problems on air. The simulator drives
the _real_ code paths, so the real limits genuinely bite.

Twitch is read-only — the app listens to chat and never posts.

### TELEMETRY — host vitals _(live)_

Live readings of processor (total and per-core), memory, graphics and storage, each with
a current value, a meter and a recent-history sparkline. A metric Windows genuinely
cannot report shows as **"unavailable"** rather than as zero — an important distinction
when you're diagnosing a machine mid-session.

### DISPATCH — the shared request board _(live)_

The only part of the app whose records are not on the local machine. The artist files
ideas, suggestions, requests and fault reports against a department, with a priority; the
developer discusses them in a thread and then either resolves them (recording what was
actually built) or denies them with a reason. Both endings stay visible permanently, so
the same question doesn't get asked twice. Items changed since the last visit are marked.
Both installations see the same board within moments. Identity is a single name field —
with exactly two people and one shared board, a password system would protect nothing.

### REGULATION — settings _(live)_

Eight categories: **Presentation** (motion level, interface scale, accent colour, film
grain, page transitions, custom pointer), **Startup** (launch with Windows, start
minimised, close to tray, fast boot), **Archive** (filing root, additional folders to
scan, new-project template, scan on launch, move-or-copy, database port),
**Integrations** (Spotify, Twitch channel, overlay port, overlay asset folder), **Board**
(shared board configuration), **Updates** (channel, automatic check and download),
**Rehearsal** (stream test mode), and **Diagnostics** (read-only: where everything lives,
with real resolved paths, for when something goes wrong).

Settings can be **exported to a single file and re-imported**, including the board and
Spotify links, validated before anything is written so a damaged file is refused rather
than half-applied. Accessibility is treated properly: a reduced-motion setting overrides
decorative choices, and the interface can be scaled from 80% to 200%.

### CATECHISM — the built-in manual _(live)_

A full operator's manual shipped inside the application: 14 chapters covering every
department, a glossary, a complete shortcut reference, and troubleshooting. Each
department also has a **quick-guide carousel** reachable with one key from the page it
describes, plus a live cheat-sheet that lists every keyboard shortcut currently active —
generated from what the app actually does, so it cannot go out of date. A one-time
orientation tour runs on first launch.

### INTERFACE — natural-language command console _(reserved — not built)_

The one department still to come, and the piece that makes the product an "assistant"
rather than a console. Its published scope: accept plain-English instructions, turn each
into concrete reviewable operations, **preview every change before it is applied**,
execute approved operations across projects, releases and overlays, and keep a full
reversible command history. **There is currently no AI in the product at all.**

---

## 6. Capabilities that cut across the whole application

- **Keyboard-first operation.** Every department has a numbered shortcut; ARCHIVE,
  CALENDAR, AUDITORIUM and each broadcast graphic have their own chords. The shortcut
  list is generated from the app's real behaviour.
- **Runs in the background.** Closing the window sends it to the system tray by default,
  because the stream graphics must keep being served even when the window is tidied away.
  It can also launch with Windows, minimised.
- **Self-installing database.** The app downloads, installs, starts, supervises and shuts
  down its own private database. If the download is blocked during installation, the app
  fetches it itself on first launch instead — so a blocked network means a slower first
  start, never a broken installation. It cannot collide with any other database on the
  machine.
- **Honest startup.** The loading screen mirrors nine real startup stages doing real
  work, with a weighted progress meter; failures stop with a plain-English cause, a hint,
  and a retry.
- **Automatic updates**, with the channel and the automatic-download behaviour under the
  user's control, and a short "what changed" note the first time a new version runs.
- **Clean uninstall with choices.** The uninstaller asks whether to keep settings and
  whether to keep the register; project folders on disk are never touched either way, and
  an unattended uninstall keeps everything.
- **Credential handling.** The Spotify link is sealed to the machine that created it — an
  exported settings bundle restores it on a reinstall here and is unreadable anywhere
  else. The app never sees a Spotify password, and never sends chat messages.

## 7. Deliberate non-goals

These are settled decisions, worth knowing so they aren't raised as gaps:

- No accounts, permissions, multi-user support or onboarding for strangers.
- Windows only. No Mac, Linux, web or mobile versions.
- No cloud storage or sync of the music library; the only online component is the
  two-person request board.
- No second music library inside the listening room — the ARCHIVE is the single
  catalogue.
- Calendar entries are not auto-generated from project data, on purpose.
- Not for sale. It is an internal tool for one practice.

## 8. What's outstanding

| Item                                                                    | Status                                                                                             |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **INTERFACE** — natural-language command console                        | Specified and routed, not built. This is the "assistant" half of the product.                      |
| **THE DOCKET** — live request queue overlay                             | Specified, not built.                                                                              |
| **Release scheduling / promotion planning**                             | Previously existed, removed during the archive redesign; to be re-specified.                       |
| **Distribution metadata** (ISRC, UPC, label, copyright, platform links) | Not modelled yet; waiting on the scheduling work above.                                            |
| Manual screenshots                                                      | An outstanding shot list exists; missing images show a captioned placeholder rather than breaking. |

## 9. Dependencies and risks a delivery plan should account for

1. **Third-party accounts are the user's to provide.** The now-playing graphic needs a
   Spotify developer application; the chat-driven graphics need a Twitch channel; the
   shared board needs a Firebase project. None of these are set up by the app.
2. **First-run download size.** The official database package is large (~805 MB
   downloaded, ~80 MB kept on disk). A self-hosted trimmed copy is supported and would
   materially improve first-run experience.
3. **Installer signing.** Until the installer is code-signed, Windows SmartScreen will
   warn on every download.
4. **Single-platform, single-maintainer.** One developer, one operator. There is no
   bus-factor mitigation, and none is planned.
5. **Scope is intentionally open-ended.** The product's stated goal — "replace every
   other app" — means departments keep being added rather than the scope settling. That
   is the brief, not scope creep, but it should be planned for as continuous delivery
   rather than a finish line.

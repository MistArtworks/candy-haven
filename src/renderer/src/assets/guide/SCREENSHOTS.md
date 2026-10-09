# Screenshots

Every image the CATECHISM references, listed from the Markdown itself: what it
shows and where it is used. 132 files: 126 captures, 4 copies of one of
those under a second name for the orientation tour, and two supplied photographs.

**Drop a file in this folder and it is available.** `lib/guide-assets.ts` globs
the directory at build time and resolves each image by filename, so there is
no import and no registry entry. A name with no file renders a captioned
`CAPTURE PENDING` plate instead, so a chapter can be written before its picture
is taken.

## How these were taken

|          |                                             |
| -------- | ------------------------------------------- |
| Format   | PNG                                         |
| Window   | 1600 x 1000, on a display at 100% scaling   |
| Accent   | crimson                                     |
| Motion   | full                                        |
| UI scale | 1.0                                         |
| Pointer  | native, so no drawn reticle lands in a shot |

Full-window shots keep the title bar and the rail. Crops are tight to the
panel or dialog, with nothing behind them.

They were taken from a copy of the console with a profile of its own: its own
folder and its own archive, filled with a made-up practice (projects, releases,
artists, entries), made-up website visitors in CONTACT and SERVICES, and a
made-up board in DISPATCH. Nothing on any of them is real, and nothing real was
read or written to make them.

Rules worth keeping for the next ones:

- **Sample data only.** No real visitor, enquiry, board item or project. This
  repository is public.
- **No secrets.** REGULATION's INTEGRATIONS and BOARD are shot with no Spotify
  client id, no token and no password on screen.
- **Paths and ports as an installation's.** A copy run beside the real console
  takes other ports and lives in another folder; the shots carry the usual ones
  (`27917`, `27918`, `%APPDATA%\candy-haven`).
- **Nothing a development build adds.** The NEXUS field picker and CATECHISM's
  **Rehearse first run** are hidden.
- **AUDITORIUM last.** Once a file is admitted, the transport bar stays along
  the foot of every page.
- **Recent sets from made-up preferences.** RECENT and the strip's Recent
  projects read a sample Ableton `Preferences.cfg` pointed at the sample
  library, never the PC's own, and opening a set is caught so Live never
  starts.

The two photographs, `practice-01-altar.png` and `practice-02-vault.png`, are
not captures. They are Candy Heist playing, gradient-mapped onto the console
ramp because the originals are stage-lit green; DARKROOM's default ramp was
recovered from them.

## Every image

| Filename                         | Shows                                                                                              | Used in                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `archive-01-lenses.png`          | STACKS on a genre shelf (PERSONAL › TECH HOUSE), in ICONS                                          | `docs/archive.md`, `guides/archive.md`                                                  |
| `archive-02-board.png`           | ALL in the BOARD view, each project in its stage column                                            | `docs/archive.md`, `guides/archive.md`                                                  |
| `archive-03-intake.png`          | INTAKE: what is on disk on the left, two marked; the shelves on the right                          | `docs/archive.md`, `docs/getting-started.md`, `guides/archive.md`                       |
| `archive-04-dossier.png`         | A project's dossier on OVERVIEW: stage, credits, tags and notes                                    | `docs/archive.md`, `guides/archive.md`                                                  |
| `archive-05-setup.png`           | The setup gate on a fresh installation. Crop                                                       | `docs/getting-started.md`                                                               |
| `archive-07-stage.png`           | The dossier's STAGE strip. Crop                                                                    | `docs/archive.md`                                                                       |
| `archive-11-tags.png`            | Manage tags. Crop                                                                                  | `docs/archive.md`                                                                       |
| `archive-12-rename-dialog.png`   | Renaming a project: the new name and what changes on disk. Crop                                    | `docs/archive.md`, `guides/archive.md`                                                  |
| `archive-13-rename-in-use.png`   | A rename refused while Live holds the project open. Crop                                           | `docs/archive.md`                                                                       |
| `archive-14-rename-taken.png`    | A rename refused because the name is taken. Crop                                                   | `docs/archive.md`                                                                       |
| `archive-15-rename-pencil.png`   | The pencil beside a project name in its dossier. Crop                                              | `docs/archive.md`                                                                       |
| `archive-16-project-menu.png`    | A project's right-click menu, Rename among it                                                      | `docs/archive.md`                                                                       |
| `archive-17-renamed.png`         | The renamed project in the register                                                                | `docs/archive.md`                                                                       |
| `archive-18-temporary.png`       | New project, TEMPORARY chosen: no shelf, category or colour. Crop                                  | `docs/archive.md`, `guides/archive.md`                                                  |
| `archive-19-new-project.png`     | New project as it opens, FILED chosen. Crop                                                        | `docs/archive.md`                                                                       |
| `archive-20-recent-menu.png`     | RECENT in the masthead, its sets dropped down: one outside the archive, one not found. Crop        | `docs/archive.md`, `guides/archive.md`                                                  |
| `archive-21-recent.png`          | The RECENT lens: a set outside the archive above the register, in ICONS                            | `docs/archive.md`                                                                       |
| `artists-01-roster.png`          | The roster                                                                                         | `docs/artists.md`, `guides/artists.md`                                                  |
| `artists-02-add.png`             | Add an artist, with a name typed. Crop                                                             | `docs/artists.md`, `guides/artists.md`                                                  |
| `artists-03-record.png`          | An artist's record: releases, then projects. Crop                                                  | `docs/artists.md`, `guides/artists.md`                                                  |
| `auditorium-01-stage.png`        | A file admitted and held part-way in, on WAVEFORM                                                  | `docs/auditorium.md`, `guides/auditorium.md`                                            |
| `auditorium-02-presets.png`      | The PRESET panel. Crop                                                                             | `docs/auditorium.md`, `guides/auditorium.md`                                            |
| `auditorium-03-zoom.png`         | The band wound in to about a second. Crop                                                          | `docs/auditorium.md`                                                                    |
| `auditorium-04-popout.png`       | The popout window                                                                                  | `docs/auditorium.md`, `guides/auditorium.md`                                            |
| `calendar-01-month.png`          | MONTH, with a month of entries and follow-ups                                                      | `docs/calendar.md`, `guides/calendar.md`                                                |
| `calendar-02-agenda.png`         | AGENDA, follow-ups among the entries                                                               | `docs/calendar.md`                                                                      |
| `calendar-04-entry.png`          | Filing an entry. Crop                                                                              | `docs/calendar.md`, `guides/calendar.md`                                                |
| `calendar-05-day-list.png`       | A day's list: an entry and a follow-up, with Add an entry. Crop                                    | `docs/calendar.md`, `guides/calendar.md`                                                |
| `calendar-06-week.png`           | WEEK, follow-ups hanging at their times                                                            | `docs/calendar.md`, `guides/calendar.md`                                                |
| `colophon-01-reserved.png`       | COLOPHON, coming soon                                                                              | `docs/colophon.md`, `guides/colophon.md`                                                |
| `contact-01-inbox.png`           | The inbox, one message open                                                                        | `docs/contact.md`, `guides/contact.md`                                                  |
| `contact-02-message.png`         | One message: details, Reply by email, status and note. Crop                                        | `docs/contact.md`, `guides/contact.md`                                                  |
| `darkroom-01-plate.png`          | A photograph on the plate, graded on the defaults                                                  | `docs/darkroom.md`, `guides/darkroom.md`                                                |
| `darkroom-02-ramp.png`           | The RAMP panel. Crop                                                                               | `docs/darkroom.md`, `guides/darkroom.md`                                                |
| `discography-01-catalogue.png`   | The catalogue, on CATALOGUE                                                                        | `docs/discography.md`, `guides/discography.md`                                          |
| `discography-02-raise.png`       | Raise a release, filled in. Crop                                                                   | `docs/discography.md`, `guides/discography.md`                                          |
| `discography-03-tracks.png`      | A release's TRACKS while editing. Crop                                                             | `docs/discography.md`, `guides/discography.md`                                          |
| `discography-04-record.png`      | A release's record                                                                                 | `docs/discography.md`, `guides/discography.md`                                          |
| `discography-08-status.png`      | A release's Status: draft, announced or out. Crop                                                  | `docs/discography.md`                                                                   |
| `dispatch-01-board.png`          | The board, one item open                                                                           | `docs/dispatch.md`, `guides/dispatch.md`                                                |
| `dispatch-02-door.png`           | Signed out: the sign-in band across the page                                                       | `docs/dispatch.md`, `guides/dispatch.md`                                                |
| `dispatch-03-thread.png`         | An item's thread and the ruling controls. Crop                                                     | `docs/dispatch.md`                                                                      |
| `dispatch-04-file.png`           | Filing a new item. Crop                                                                            | `docs/dispatch.md`, `guides/dispatch.md`                                                |
| `dispatch-05-marks.png`          | Candy's view: NEW, a reply count, NOW RESOLVED, 3 on the rail                                      | `docs/dispatch.md`, `guides/dispatch.md`                                                |
| `dispatch-06-notice.png`         | A notice in the console: Mist commented, with Open                                                 | `docs/dispatch.md`                                                                      |
| `leads-01-list.png`              | LEADS, its own department: Follow-ups due, then the leads                                          | `docs/leads.md`, `guides/leads.md`, `guides/orientation.md`                             |
| `leads-02-due.png`               | The Follow-ups due panel. Crop                                                                     | `docs/leads.md`                                                                         |
| `leads-03-sheet.png`             | A lead's sheet: temperature, logging, history, follow-ups                                          | `docs/leads.md`, `guides/leads.md`                                                      |
| `leads-04-slider.png`            | The temperature slider. Crop                                                                       | `docs/leads.md`                                                                         |
| `leads-05-steps.png`             | The temperature as steps. Crop                                                                     | `docs/leads.md`                                                                         |
| `leads-06-pinned.png`            | A temperature set by hand, with Back to automatic. Crop                                            | `docs/leads.md`                                                                         |
| `leads-07-log.png`               | Logging an interaction, a suggestion typed in full. Crop                                           | `docs/leads.md`                                                                         |
| `leads-08-history.png`           | Interactions with quiet spells between them. Crop                                                  | `docs/leads.md`                                                                         |
| `leads-09-snooze.png`            | An overdue follow-up with its snooze choices. Crop                                                 | `docs/leads.md`                                                                         |
| `leads-10-task.png`              | Adding a follow-up. Crop                                                                           | `docs/leads.md`                                                                         |
| `leads-11-edit.png`              | A lead's details, in Edit                                                                          | `docs/leads.md`                                                                         |
| `leads-12-add.png`               | Add a lead. Crop                                                                                   | `docs/leads.md`                                                                         |
| `leads-13-convert.png`           | Make an opportunity. Crop                                                                          | `docs/leads.md`                                                                         |
| `leads-14-board.png`             | OPPORTUNITIES, the board by stage, on LEADS                                                        | `docs/leads.md`, `guides/leads.md`                                                      |
| `leads-15-opportunity.png`       | An opportunity's sheet                                                                             | `docs/leads.md`                                                                         |
| `leads-16-stages.png`            | The stage strip. Crop                                                                              | `docs/leads.md`                                                                         |
| `leads-17-delete.png`            | A lead's sheet, asking before Delete lead                                                          | `docs/leads.md`, `guides/leads.md`                                                      |
| `lore-01-chapters.png`           | CHAPTERS as LIST, with published, changed and draft chapters                                       | `docs/lore.md`, `guides/lore.md`                                                        |
| `lore-02-new-chapter.png`        | The new chapter row. Crop                                                                          | `docs/lore.md`                                                                          |
| `lore-03-planet-picker.png`      | Choosing a planet for a chapter. Crop                                                              | `docs/lore.md`                                                                          |
| `lore-04-write.png`              | WRITE, side by side                                                                                | `docs/lore.md`, `guides/lore.md`                                                        |
| `lore-05-format-bar.png`         | The format bar, with a hint showing. Crop                                                          | `docs/lore.md`                                                                          |
| `lore-06-preview.png`            | WRITE, full preview                                                                                | `docs/lore.md`, `guides/lore.md`                                                        |
| `lore-07-publish-warning.png`    | The first-publish warning. Crop                                                                    | `docs/lore.md`                                                                          |
| `lore-08-published.png`          | A published chapter in the editor. Crop                                                            | `docs/lore.md`                                                                          |
| `lore-09-order.png`              | The order bar, with a new order to publish. Crop                                                   | `docs/lore.md`                                                                          |
| `lore-10-conflict.png`           | A publish conflict. Crop                                                                           | `docs/lore.md`                                                                          |
| `lore-11-planets.png`            | PLANETS, a planet open in the maker                                                                | `docs/lore.md`, `guides/lore.md`                                                        |
| `lore-12-add-layer.png`          | Add layer. Crop                                                                                    | `docs/lore.md`                                                                          |
| `lore-13-layer-settings.png`     | A layer's settings. Crop                                                                           | `docs/lore.md`                                                                          |
| `lore-14-cards.png`              | CHAPTERS as CARDS, each chapter with its planet                                                    | `docs/lore.md`                                                                          |
| `lore-15-orbit.png`              | CHAPTERS as ORBIT, the first chapter in the middle                                                 | `docs/lore.md`, `guides/lore.md`                                                        |
| `nexus-01-landing.png`           | The landing, on THE GATE                                                                           | `docs/nexus.md`, `guides/nexus.md`                                                      |
| `nexus-02-overview.png`          | The diagnostic grid, after Descend                                                                 | `docs/nexus.md`, `guides/nexus.md`, `guides/orientation.md`                             |
| `nexus-03-follow-ups.png`        | The follow-ups card on the landing. Crop                                                           | `docs/nexus.md`, `guides/nexus.md`                                                      |
| `nexus-04-folded.png`            | The follow-ups card folded to its mark. Crop                                                       | `docs/nexus.md`                                                                         |
| `observatory-01-catalogue.png`   | The desk: the kit, and THE CONCORD on the bench with a vote running                                | `docs/observatory.md`, `guides/observatory.md`                                          |
| `observatory-02-card.png`        | A bench's browser source row. Crop                                                                 | `docs/observatory.md`, `guides/observatory.md`                                          |
| `overlay-chorus-console.png`     | THE CHORUS's page                                                                                  | `docs/observatory.md`                                                                   |
| `overlay-concord-console.png`    | THE CONCORD's page, a vote running in rehearsal                                                    | `docs/observatory.md`, `guides/observatory.md`                                          |
| `overlay-muster-console.png`     | THE MUSTER's page, a call open in rehearsal                                                        | `docs/observatory.md`                                                                   |
| `overlay-selection-scene.png`    | RESONANCE SELECTION's page, petitions on the ring                                                  | `docs/observatory.md`                                                                   |
| `practice-01-altar.png`          | Supplied photograph, not a capture                                                                 | `guides/orientation.md`                                                                 |
| `practice-02-vault.png`          | Supplied photograph, not a capture                                                                 | `docs/overview.md`                                                                      |
| `rail-01-search.png`             | The rail's search, settings typed. Crop                                                            | `docs/overview.md`                                                                      |
| `rail-02-pinned.png`             | The rail with two pinned pages, and COMMUNITY pinned first. Crop                                   | `docs/overview.md`                                                                      |
| `regulation-01-categories.png`   | REGULATION on PRESENTATION                                                                         | `docs/regulation.md`, `guides/regulation.md`                                            |
| `regulation-02-archive.png`      | REGULATION on ARCHIVE, Keep temporary projects for at the foot                                     | `docs/regulation.md`                                                                    |
| `regulation-03-integrations.png` | INTEGRATIONS, with no client id in it. Crop                                                        | `docs/regulation.md`                                                                    |
| `regulation-04-board.png`        | REGULATION on BOARD, with Notify me                                                                | `docs/regulation.md`                                                                    |
| `regulation-05-diagnostics.png`  | DIAGNOSTICS. Crop                                                                                  | `docs/regulation.md`                                                                    |
| `regulation-06-strip.png`        | REGULATION on QUICK STRIP                                                                          | `docs/regulation.md`, `docs/strip.md`, `guides/regulation.md`                           |
| `regulation-07-startup.png`      | REGULATION on STARTUP, At launch on QUICK STRIP                                                    | `docs/regulation.md`, `docs/strip.md`                                                   |
| `regulation-08-leads.png`        | REGULATION on LEADS                                                                                | `docs/leads.md`, `docs/regulation.md`, `guides/regulation.md`                           |
| `regulation-09-temporary.png`    | Keep temporary projects for, and Open the temporary folder. Crop                                   | `docs/regulation.md`                                                                    |
| `regulation-10-notify.png`       | BOARD's Notify me. Crop                                                                            | `docs/regulation.md`                                                                    |
| `regulation-11-directory.png`    | REGULATION on DIRECTORY: pinned pages and the categories                                           | `docs/regulation.md`, `guides/regulation.md`                                            |
| `releases-01-list.png`           | RELEASES: every release as the website has it                                                      | `docs/releases.md`, `guides/releases.md`                                                |
| `releases-02-covers.png`         | Covers and tapes, as sent to the website                                                           | `docs/releases.md`, `guides/releases.md`                                                |
| `services-01-enquiries.png`      | DJ enquiries, one open                                                                             | `docs/services.md`, `guides/services.md`                                                |
| `services-02-enquiry.png`        | One enquiry. Crop                                                                                  | `docs/services.md`, `guides/services.md`                                                |
| `services-03-producer.png`       | PRODUCER, a 1-1 session open                                                                       | `docs/services.md`, `guides/services.md`                                                |
| `services-04-offerings.png`      | OFFERINGS, started from the website’s list, one service changed                                    | `docs/services.md`, `guides/services.md`                                                |
| `services-05-write-up.png`       | A service’s photo and write-up, side by side with the website’s reading                            | `docs/services.md`                                                                      |
| `services-06-first-publish.png`  | The first publish, asking first. Crop                                                              | `docs/services.md`                                                                      |
| `services-07-hours.png`          | HOURS: the week, days off and the rules, up to date                                                | `docs/services.md`, `guides/services.md`                                                |
| `services-08-move.png`           | Moving a session a day later. Crop                                                                 | `docs/services.md`, `guides/services.md`                                                |
| `strip-01-panel.png`             | The quick strip, Panel: an overdue follow-up first, then the pins, Recent projects first, and Quit | `docs/getting-started.md`, `docs/overview.md`, `docs/strip.md`, `guides/orientation.md` |
| `strip-02-today.png`             | Today, opened: follow-ups first, then the day                                                      | `docs/strip.md`                                                                         |
| `strip-03-ways.png`              | Choosing how a project pin opens                                                                   | `docs/strip.md`                                                                         |
| `strip-04-group.png`             | A group's pins, dropped down from its icon                                                         | `docs/strip.md`                                                                         |
| `strip-05-website.png`           | Open a website, with where to pin it                                                               | `docs/strip.md`                                                                         |
| `strip-06-follow-up.png`         | A follow-up opened from a reminder, with its actions                                               | `docs/strip.md`                                                                         |
| `strip-07-log.png`               | Logging and completing a follow-up from the strip                                                  | `docs/strip.md`                                                                         |
| `strip-08-quit.png`              | Quit armed after one press                                                                         | `docs/overview.md`, `docs/strip.md`                                                     |
| `strip-09-horizontal.png`        | The Horizontal look, a follow-up on its today chip                                                 | `docs/strip.md`                                                                         |
| `strip-10-options.png`           | A pin's options, inside a group                                                                    | `docs/strip.md`                                                                         |
| `strip-11-temporary.png`         | New project from the strip, TEMPORARY chosen                                                       | `docs/strip.md`                                                                         |
| `strip-12-recent.png`            | Recent projects, its sets dropped down from its pin on the strip                                   | `docs/strip.md`                                                                         |
| `telemetry-01-vitals.png`        | TELEMETRY                                                                                          | `docs/telemetry.md`, `guides/telemetry.md`                                              |
| `telemetry-02-cores.png`         | PER-CORE LOAD. Crop                                                                                | `docs/telemetry.md`, `guides/telemetry.md`                                              |
| `welcome-03-rail.png`            | Copy of `nexus-01-landing`                                                                         | `docs/overview.md`, `guides/orientation.md`                                             |
| `welcome-04-archive.png`         | ARCHIVE, STACKS at the top of the tree                                                             | `guides/orientation.md`                                                                 |
| `welcome-05-observatory.png`     | Copy of `observatory-01-catalogue`                                                                 | `guides/orientation.md`                                                                 |
| `welcome-06-auditorium.png`      | Copy of `auditorium-01-stage`                                                                      | `guides/orientation.md`                                                                 |
| `welcome-07-regulation.png`      | Copy of `regulation-01-categories`                                                                 | `guides/orientation.md`                                                                 |
| `welcome-08-documentation.png`   | CATECHISM, on THE CONSOLE. Take it last                                                            | `guides/orientation.md`                                                                 |

## Adding one

Drop the file here and reference it from any Markdown document under
`src/renderer/src/features/catechism/content/`:

```markdown
![a-short-name.png](a-short-name.png)
```

Name it `<scope>-<nn>-<topic>.png`, in kebab-case: the department, `welcome`
for the orientation tour, or `overlay-<name>` for a broadcast source.

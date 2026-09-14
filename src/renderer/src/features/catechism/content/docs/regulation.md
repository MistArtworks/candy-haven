# REGULATION

Operator settings, grouped into eight categories. The category lives in the URL,
so a link can point at one and the back gesture walks the groups rather than
leaving the department.

![regulation-01-categories.png](regulation-01-categories.png)

`Ctrl+,` opens this department from anywhere, as it does in every other
application on the desktop.

## PRESENTATION

Motion, interface scale and the accent this console draws with.

| Setting             | Effect                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Motion**          | `full`, `reduced` or `off`. `reduced` keeps state changes legible but removes ambient movement; `off` disables transitions wholesale |
| **Interface scale** | `0.8` to `2.0`. Scales the whole console, not just text                                                                              |
| **Accent**          | `crimson` or `gold`. Shifts every interactive affordance                                                                             |
| **Grain**           | `0` to `1`. The film grain over the whole console                                                                                    |
| **Page transition** | `sweep`, `fade` or `off`. How a department arrives. **Off by default**                                                               |
| **Pointer**         | `reticle` or `native`. Which pointer the console draws. **`reticle` by default**                                                     |

> The accent setting does not touch the boot orb, which stays crimson. It is the
> focal object, and the palette reserves that colour for focal points.

**Off by default**, and deliberately. A transition is pleasant the first ten
times and then sits between you and the page you asked for, and this console is
walked through all day. Turn it on if you want the ceremony.

`sweep` passes a crimson mark across the field as the department changes — the
outgoing page recedes, the mark crosses, the incoming one is set behind it.
`fade` is a plain handover. `off` changes instantly.

**Page transition** is taste; **Motion** is accessibility, and where they
disagree Motion wins.

Setting Motion to `off` disables the transition whatever this is set to, and the
control says so rather than disappearing.

### THE RETICLE

On by default. It was switched off for 1.11.1, after a version in which it hid
the system arrow and drew nothing in its place; that fault is fixed and the mark
draws, so it is back on.

On `reticle`, the console hides the system arrow and draws its own pointer: a
survey instrument rather than a cursor. It tracks, acquires a target, and
stamps. The geometry is the console’s own mark reduced to something that reads
at 22 pixels.

| Over                         | The mark                                     |
| ---------------------------- | -------------------------------------------- |
| Anything at rest             | Ring and cardinal ticks, leaning into travel  |
| A button or link             | Corner brackets close around it               |
| A line of text               | The ring collapses to a caret                 |
| Something disabled           | Struck through, drained to concrete           |
| A surface wanting an exact point | A gapped crosshair                       |
| Something draggable          | A segmented ring                              |

Nothing had to be annotated for any of that. The mark reads whatever the
interface already says the cursor should be, so every control that exists is
covered and so is every one added later.

`native` hands the arrow back. Setting **Motion** to `off` does too, and the
control says so — the instrument is entirely movement.

The title bar keeps the system cursor whatever is set here. The window drag
region swallows mouse events before the renderer sees them, so there is nothing
there to draw from.

## STARTUP

Whether this console starts with the machine, and what closing it means.

- **Launch at startup** — registers the application with Windows.
- **Start minimised** — launches to the tray rather than to a window.
- **Close to tray** — the close button hides the window instead of quitting.
  On by default, because overlays served to OBS should survive you tidying your
  desktop.
- **Fast boot** — shortens the boot cinematic. The stages still run; only the
  presentation is abbreviated.

## ARCHIVE

![regulation-02-archive.png](regulation-02-archive.png)

Where projects are filed, and the local database that holds the register.

| Setting              | Effect                                                     |
| -------------------- | ---------------------------------------------------------- |
| **Filing root**      | The directory your shelves live in. Required               |
| **Satellite roots**  | Further directories to scan for work                       |
| **Project template** | A folder copied when a new project is created              |
| **Scan on launch**   | Re-reads the filing root at startup                        |
| **Intake mode**      | `move` or `copy`. See the ARCHIVE chapter                  |
| **Port**             | The loopback port the database answers on. Default `27917` |
| **Executable path**  | Override the located `mongod`                              |

Changing the port restarts the database. Changing the filing root does not move
any files — it re-points the console at a different tree.

## INTEGRATIONS

![regulation-03-integrations.png](regulation-03-integrations.png)

Accounts and services the broadcast kit reads from.

- **Spotify client id** — required by NOW TRANSMITTING. Create an application in
  the Spotify developer dashboard and paste its client id here, then use **Link**
  to authorise. The token is held by the main process; the password never
  crosses into the console.
- **Twitch channel** — the channel chat is read from. Read-only ingest; the
  console never sends messages.
- **Overlay port** — where the broadcast server answers. Default is claimed
  upward if taken.
- **Overlay asset path** — a directory of your own images for overlays to draw.

## BOARD

![regulation-04-board.png](regulation-04-board.png)

The shared database behind DISPATCH. Paste the whole configuration snippet the
Firebase console shows — it is parsed rather than requiring you to pick the JSON
out of it.

There is no account to create inside Candy Haven. See the DISPATCH chapter for
why identity works the way it does.

## UPDATES

Release channel and how new versions arrive.

- **Channel** — which releases this installation is offered.
- **Check automatically** — looks for an update in the background at startup.
- **Download automatically** — fetches it without asking.

An update is applied on the next launch, and what changed is shown once when the
new version first runs.

## REHEARSAL

Test mode, for exercising the broadcast kit without a live audience. Turn it on
to check an overlay's layout, cues and timings before a broadcast.

## DIAGNOSTICS

![regulation-05-diagnostics.png](regulation-05-diagnostics.png)

Where this installation keeps its files, and what it is running on. Nothing here
is editable — it is the page to read from when something is wrong, and the paths
are the real resolved ones rather than templates.

| Field            | Use                                   |
| ---------------- | ------------------------------------- |
| **User data**    | Settings, logs, archive data          |
| **Log file**     | The current session's log             |
| **Archive data** | The database's own directory          |
| **Versions**     | Candy Haven, Electron, Chromium, Node |

## Export and import

**Export** in the masthead writes everything this department holds to a single
`.zip`, after asking where to put it:

| Inside the zip  | Is                                                     |
| --------------- | ------------------------------------------------------ |
| `settings.json` | Every setting on every category above                  |
| `firebase.json` | The board configuration, if one is attached            |
| `spotify.dat`   | The Spotify link, if one is made                       |
| `manifest.json` | What wrote it, when, and which of the above are inside |

**Import** reads one back. Settings are validated before anything is written,
so a damaged or hand-edited file is refused rather than half-applied, and a
bundle from an older build is migrated by the same defaults that migrate the
settings file itself. The notice afterwards says exactly what was restored —
worth reading, because whether the board and the Spotify link came across is
not visible on the page the way the settings are.

> **The zip holds credentials.** Your Spotify client id, the Twitch channel and
> the board account are all in it. Keep it somewhere private; do not commit it.

One thing it cannot carry. `spotify.dat` is sealed against the machine and the
account that wrote it, so it restores perfectly on a reinstall **here** and is
unreadable anywhere else — carried to another machine, the room simply asks to
be linked again. Everything else is portable.

This is not a backup of your work. It is configuration only; the **archive** —
projects, stages, tags and notes — is a database and is not in here.

## Uninstalling

The uninstaller asks what to keep, with two boxes, both ticked:

- **Keep my settings** — everything on this page, and the credential files.
- **Keep my archive** — the register: projects, stages, tags, notes, volumes and
  releases.

Clear a box and that part is removed. Leave both and a later reinstall comes
back exactly as you left it.

Your project folders on disk are never touched either way, whatever is ticked.
A silent uninstall keeps both, so an unattended removal can never take an
archive with it.

## The orientation tour

Shown once, on a first launch, and again only when the guides are rewritten
enough to be worth re-reading. Dismissing it is what marks it read.

There is no control to bring it back, and that is deliberate rather than an
omission — everything it covers is in these chapters at more length, and each
department's **Quick guide** button is always available. Nothing is behind the
tour that is not also in front of it.

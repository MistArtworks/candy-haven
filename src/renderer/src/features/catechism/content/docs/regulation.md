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
| **Interface scale** | `80%` to `200%`. Scales the whole console, not just text. Set in a dialog: see below                                                 |
| **Accent**          | `crimson` or `gold`. Shifts every interactive affordance                                                                             |
| **Grain**           | `0` to `1`. The film grain over the whole console                                                                                    |
| **Page transition** | `sweep`, `fade` or `off`. How a department arrives. **Off by default**                                                               |
| **Pointer**         | `reticle` or `native`. Which pointer the console draws. **`reticle` by default**                                                     |
| **Fast boot**       | Skips the hold at a finished boot screen and enters the console on its own, rather than waiting for a key or a click                 |

> The accent setting does not touch the boot orb, which stays crimson. It is the
> focal object, and the palette reserves that colour for focal points.

### Interface scale

1. Press **Adjust** beside the current scale.
2. Pick one of the steps Windows itself offers, or slide to any value between.
   A sample scales as you choose; the console around it holds still.
3. Press **Apply** to scale the console, or **Cancel** to leave it.

It is a dialog rather than a slider on the page because the scale is the
window's own zoom: a slider wired straight to it would rescale itself, and slide
out from under the pointer, while it was being dragged.

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

| Over                             | The mark                                     |
| -------------------------------- | -------------------------------------------- |
| Anything at rest                 | Ring and cardinal ticks, leaning into travel |
| A button or link                 | Corner brackets close around it              |
| A line of text                   | The ring collapses to a caret                |
| Something disabled               | Struck through, drained to concrete          |
| A surface wanting an exact point | A gapped crosshair                           |
| Something draggable              | A segmented ring                             |

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

- **Open the vestibule first** — a small window opens ahead of the console
  offering two things: a new project, or the console proper. Creating one there
  files it, copies your template set and opens it in Ableton without the console
  ever loading, then leaves the application in the tray. On by default. Turn it
  off and launching goes straight to the console. A sign-in launch never shows
  it either way — the point of starting with the machine is that the archive and
  the overlay server are up, not that you are asked a question.
- **Launch at sign-in** — registers the console to start when you sign in to
  Windows.
- **Start in the tray** — a sign-in launch comes up in the tray rather than on
  screen. Only means anything once launch at sign-in is on, so the control is
  disabled until then; opening the console yourself always shows it.
- **Close retires to the tray** — the close button hides the window instead of
  quitting, so overlays served to OBS survive you tidying your desktop. On by
  default. `Alt+F4` and Quit on the tray icon always quit regardless — an
  application that refuses the operating system's own close is one you cannot
  get rid of.

## ARCHIVE

![regulation-02-archive.png](regulation-02-archive.png)

Where projects are filed, and the local database that holds the register. Two
panels: what you set, and what the daemon reports.

| Setting                      | Effect                                                                     |
| ---------------------------- | -------------------------------------------------------------------------- |
| **Filing root**              | The directory your shelves live in. Reported here, not set                 |
| **Project template**         | A folder copied when a new project is created                              |
| **Other locations**          | Further directories to scan for work. Read only, nothing is filed into one |
| **When taking a project in** | `MOVE` or `COPY`. See the ARCHIVE chapter                                  |
| **Re-index on launch**       | Walks the filing root and every other location again at startup            |

The filing root is chosen once, at ARCHIVE's own setup gate — this page only
reports it, and deliberately has no button that would change it: repointing
the root would not move any files, so there is nothing here that would only
pretend to.

Beneath the settings, a read-only report of the daemon itself — state, the
port it actually bound (`27917` by default), its own version, where its
runtime was resolved from, how many times the supervisor has restarted it
this session, and the round-trip of the last ping — with **Restart archive**
and **Reveal data directory** underneath.

## INTEGRATIONS

![regulation-03-integrations.png](regulation-03-integrations.png)

Accounts and services the broadcast kit and the website inbox read from.

- **Spotify client id** — required by NOW TRANSMITTING. Create an application in
  the Spotify developer dashboard and paste its client id here, then use **Link**
  to authorise. The token is held by the main process; the password never
  crosses into the console.
- **Twitch channel** — the channel chat is read from. Read-only ingest; the
  console never sends messages.
- **Website address** — where CONTACT and SERVICES check in, and where LORE
  publishes. Leave it empty for
  the default, shown in the field: the live website when installed, the
  development server on this machine (`http://localhost:3000`) when run from
  source. Another address is another website, with a copy of its own.

The broadcast server's own port is a setting the main process holds and binds
without asking the renderer — a compromised renderer should not get to choose
what the application listens on — so there is no control for it here.
OBSERVATORY's own addresses already carry the resolved port; changing it means
editing the settings file directly.

## BOARD

![regulation-04-board.png](regulation-04-board.png)

The shared database behind DISPATCH, and the sign-in that CONTACT, SERVICES
and LORE use as well.

1. In the Firebase console, copy the web app's whole configuration snippet.
2. Paste it into **Firebase config**. It is parsed, so the code around the JSON
   can come with it.
3. Press **Attach**.

The panel then reports the **Project**, who is **Signed in as**, and the
board's **State**, with **Sign out** beneath. A Firebase web config is not a
secret: it ships inside every web app that uses one, and the database's rules
are what keep the board to its two accounts.

There is no account to create inside Candy Haven. See the DISPATCH chapter for
why identity works the way it does.

## UPDATES

Release channel and how new versions arrive.

The panel reports the **current version** and the **channel** this installation
is offered releases from, and the updater's state beside its label.

1. Press **Check for updates**. An installed copy also checks on its own at
   startup.
2. When one is found, press **Download**. By default it downloads on its own
   too, so it is often already there.
3. Press **Restart and install**, or leave it: an update that has downloaded is
   applied on the next launch either way.

What changed is shown once, when the new version first runs. A copy run from
source cannot update itself, and the panel says so.

## REHEARSAL

Test mode, for exercising the broadcast kit without a live audience.

Turn **Test mode** on and broadcast features run without the service they
depend on: THE CONCORD and THE MUSTER open with no Twitch channel set, and three
overlays grow a **Simulator** that fills them with synthetic votes, entries and
petitions. See OBSERVATORY. Turn it off before going live, because a poll that
counts nothing looks exactly like one that works.

## DIAGNOSTICS

![regulation-05-diagnostics.png](regulation-05-diagnostics.png)

Where this installation keeps its files, and what it is running on. Nothing here
is editable — it is the page to read from when something is wrong, and the paths
are the real resolved ones rather than templates.

| Field            | Use                                                      |
| ---------------- | -------------------------------------------------------- |
| **User data**    | Settings, logs, archive data                             |
| **Log file**     | The current session's log                                |
| **Archive data** | The database's own directory                             |
| **Locale**       | The operating system locale Candy Haven is running under |

Candy Haven, Electron, Chromium and Node versions are one gesture away
instead — NEXUS's own RUNTIME panel, not repeated here.

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

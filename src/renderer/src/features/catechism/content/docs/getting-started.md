# Commissioning

What to set up on a fresh installation, in the order that avoids doubling back.
Steps 1 and 2 are required before the ARCHIVE will draw anything at all. The
rest are optional and depend on what you intend to use.

## The first launch

The first thing Candy Haven shows is THE QUICK STRIP: a small window in the
bottom right of the main screen, on top of everything else. That is the
default under REGULATION → STARTUP → **At launch**, and the console is one
click from it.

![strip-01-panel.png](strip-01-panel.png)

### How to reach the console from the strip

1. Press the pin called **The console**. Or press **More** (the three dots)
   and choose **Open the console**.
2. If Haven is still starting, the console opens on the boot screen. Press
   **Enter console**, or any key, once the sequence completes.
3. The orientation tour opens over the console, once. Page through it with
   `←` and `→`, and close it with `Escape`. Everything in it is in these
   chapters as well.

The strip steps aside while the console is on screen, and comes back when you
close the console or minimise it. Closing the console does not quit Haven:
the power button at the end of the strip does, on a second press.

> Until the archive is set up, the strip's **New project** says so: "The
> archive isn't set up yet: choose where projects are filed in the console
> first." Step 1 is how.

If you would rather see the console at every launch, set **At launch** to
**CONSOLE**. **VESTIBULE** opens a small launcher instead, with a new project
and the console as its main doors.

## 1. Establish the archive

![archive-05-setup.png](archive-05-setup.png)

The filing root is the directory the archive builds in. Until it is chosen,
ARCHIVE shows a setup gate rather than an empty register — a deliberate choice,
because an empty ARCHIVE and an unconfigured one look identical and mean
completely different things. The gate sits inert at the foot of the ARCHIVE
page rather than blocking it, so you can look around before filling it in.

1. Open [ARCHIVE](/archive) directly. REGULATION only reports the filing root
   once it exists — it has no way to set it.
2. Choose an **archive location**. It does not need to hold your projects
   already: everything the archive creates lives inside one `Candy Haven`
   directory here, so nothing of yours is intermixed with ours. Your music
   folder is a reasonable choice.
3. Choose a **project template** — an Ableton set copied into every project you
   create. Both a location and a template are required before the gate clears.
4. Optionally add any directories your projects are already in. Nothing is
   moved yet; they are read only, and everything found is ready to file once
   the register opens.
5. Press **Establish**. The gate reads back what it will create first, under
   **What gets created**.

```
D:\Music                    <- archive location
└── Candy Haven             <- everything the app made, kept in one place
    └── Projects
        ├── Electronic      <- a category
        │   ├── Halftime    <- a genre
        │   │   └── Ossuary <- a project
        │   └── Drum and Bass
        └── Collaborations
```

> Chosen once, at the gate. REGULATION reports the filing root but cannot
> change it — repointing it would not move what is already filed, so there is
> no button there that would only pretend to.

## 2. Confirm the archive is running

Open [NEXUS](/). The line beneath the wordmark reads `All systems resonant.`
and **ARCHIVE** reads `ONLINE` when the database is up. If it does not,
**Descend** to the diagnostic grid, which names the fault in the **01 ARCHIVE**
panel's _Last event_ field.

The most common first-run case is the MongoDB runtime still downloading. That is
expected and self-resolving: the installer fetches it, and if that was blocked
the application provisions it itself on first launch, with resume support.

The strip reads the same state beside who is signed in: `Archive online` once
it is up.

## 3. Bring existing work into the register

![archive-03-intake.png](archive-03-intake.png)

If you have projects on disk that are not under the filing root, INTAKE is how
they get in.

1. Add the directory your projects are in, if the gate did not already have
   it: REGULATION → ARCHIVE → **Other locations** → **Add**.
2. Open ARCHIVE and select the **INTAKE** lens. **ON DISK**, on the left, lists
   what it found that the register does not know.
3. On the right, **INTO THE ARCHIVE**, open the shelf the work belongs on.
4. Tick the projects to take (Ctrl-click to add, Shift-click for a run), and
   press **File N into** the shelf. Or drag them onto it.

Whether intake moves or copies is set in REGULATION under ARCHIVE. **Move** is
the default, and it is the right default — two copies of a project is how you
end up spending an evening mixing the wrong one.

## 4. Attach the broadcast kit

Only needed if you intend to run overlays.

| Overlay                 | Needs                                                 |
| ----------------------- | ----------------------------------------------------- |
| NOW TRANSMITTING        | A Spotify client id, set in REGULATION → INTEGRATIONS |
| THE CONCORD, THE MUSTER | A Twitch channel, set in REGULATION → INTEGRATIONS    |
| RESONANCE SELECTION     | Nothing, unless you want chat-filed petitions         |
| INTERVAL, CONVENING     | Nothing                                               |

Then add each one to OBS as a Browser source. The
[OBSERVATORY](/catechism?chapter=observatory) chapter has the exact steps.

## 5. Attach the shared board

Only if you are the second operator. DISPATCH needs a shared Firebase project,
configured in REGULATION under **BOARD** by pasting the whole snippet the
Firebase console shows. There is no account to create inside Candy Haven.

Signing in on DISPATCH also opens CONTACT, SERVICES, LORE and RELEASES, which
use the same sign-in.

## 6. Make the strip yours

Optional, and worth ten minutes. A new strip starts with six pins: **New
project**, **Open a website**, **The console**, **Archive**, **Discography**
and **Calendar**. Change them to what you open every day.

1. Drop a file or a folder on the strip from Explorer to pin it. A folder pin
   lists what is in it beside the strip; a file opens with whatever Windows
   opens it with.
2. Open REGULATION → QUICK STRIP (the strip's gear goes straight there). Under
   **Pins**, **Stack…** and **Project…** find an ARCHIVE stack or project by
   name, **File…** and **Folder…** pick one from disk, and a department, a
   website or one of the strip's actions can be added too. **New group**
   starts a group, one icon that drops down the pins in it.
3. Right-click a pin on the strip to rename it, move it, put it in a group or
   take it off.
4. Choose a **Look**: `PANEL`, `HORIZONTAL` or `VERTICAL`.
5. Turn on **Launch at sign-in** under STARTUP if you want the strip on screen
   from the moment the PC starts.

## 7. Leads, if you want them

Also optional. LEADS, under COMMUNITY, keeps a light record of the people you
want to work with, and **OPPORTUNITIES** beside it for the work that comes of
them.

1. Open [LEADS](/leads) and press **Add a lead**. Only the name is needed.
2. A new lead starts frozen, with a high-priority follow-up called "First
   interaction", due when you say (now, unless you change it).
3. Open REGULATION → LEADS to look over the predefined interactions and their
   points, how fast a quiet lead cools, and **Remind me**, which is on.

From then on, overdue follow-ups lead the strip's Today, sit in the corner of
the NEXUS landing, and show in CALENDAR.

## A reasonable first session

1. Set the filing root.
2. Create one category and one genre under it, so the tree has a shape.
3. File one project you are actually working on.
4. Open its dossier and set its stage honestly.
5. Open AUDITORIUM and play its latest bounce.
6. Pin that project to the strip, so tomorrow it is one click away.

That exercises the filing tree, the register, the pipeline, the listening room
and the strip in about five minutes, and it will tell you quickly whether the
filing root is pointed where you meant.

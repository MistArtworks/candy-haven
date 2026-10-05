# When something is wrong

Ordered roughly by how often each comes up. Most faults in this console announce
themselves in words — the place to start is usually the sentence already on
screen rather than a setting.

## The ARCHIVE shows a setup gate

The filing root is not set, or the directory it points at is gone.

Open REGULATION → **ARCHIVE** and check **Filing root**. If it points at a drive
that is not plugged in, plug it in — the gate reports "root has gone" separately
from "never configured" precisely so you are not sent to re-pick a root that is
perfectly fine.

## A project will not file

The notice names the project and the reason. The three common ones:

**"Something called … is already in that folder."** — you should not see this
any more; a collision now files as `… (2)` and the notice says it renamed. If you
do see it, the destination holds a thousand projects of that name, which is a
different problem.

**"That project is in use by another program."** — Live has the set open, or
Explorer is sitting inside the folder. Close both and retry.

**"That project folder is no longer on disk."** — the register is out of step.
Run a scan (`Ctrl`+`R`).

**"A scan is already running."** — filing and scanning move the same files, so
one waits for the other. Let it finish.

## A project is marked MISSING

The register holds a record whose directory is no longer where it was. Usually
something was moved or renamed outside Candy Haven.

Run a scan — a move within the watched roots is detected and the record follows
it. If the folder really is gone, delete the record.

The dossier's two open actions are refused while a project is missing, because
launching a set that is not there produces an OS error naming a path.

## Tempo or key looks wrong on a project

The analysis was read by an older version, or the set has changed in a way the
incremental scan did not notice.

`Ctrl`+`Shift`+`R` re-reads **every** set regardless of timestamps. It is slower
than a normal scan on purpose.

Note that key is absent for sets saved before Live 12 introduced one — that
shows as `—` rather than a guess.

## Startup feels slow

Open NEXUS and read **02 BOOT REPORT → Slowest stage**. It names the stage
rather than making you guess.

- `archive-provision` — the database runtime is downloading. Expected on a first
  run, and it resumes if interrupted.
- `archive-schema` — collections and indexes are being reconciled.
- `harmonics` — the archive health check.

**Fast boot** under REGULATION → PRESENTATION skips the hold at the end of the
boot screen. The stages still run; only the wait for a key is gone.

## The archive says OFFLINE

Nothing that reads the register will work. Read **01 ARCHIVE → Last event** on
NEXUS — that field is where a failure explains itself.

Then, in order:

1. REGULATION → ARCHIVE → **Restart archive**.
2. Check the port is not taken by something else. The default is `27917`,
   deliberately off MongoDB's own `27017`.
3. Check **Runtime source** on NEXUS. If it reads `NOT RESOLVED`, the database
   binary was never found — the installer's download may have been blocked, in
   which case the app provisions it itself on next launch.

A **restart count** above zero on a healthy installation is worth noticing. The
supervisor recovers from crashes, but it should not be having to.

## An overlay shows nothing in OBS

Work down this list:

1. Does the OBSERVATORY masthead say **Server offline**? Then press **Restart
   server**.
2. With OBS open, does it still say **Awaiting a source**? Then the source is
   not connected — the URL is wrong. Copy it again from the bench rather than
   correcting it by hand.
3. Is the source's width and height the canvas its address row quotes?
4. Is **Shutdown source when not visible** unchecked? If it is checked, state is
   lost on every scene change.
5. If the overlay draws on a black slab over your scene, it is not transparent:
   turn **Transparent** on in that overlay's own panel.

**Guides on**, in the strip above the board, adds `?guides=1` to every address
the desk hands over. Turn it off and copy again before going live.

## NOW TRANSMITTING is blank

It hides itself when nothing is playing — that is intended, not a fault.

If something _is_ playing: check REGULATION → INTEGRATIONS has a Spotify client
id and that **Link** has been used to authorise. Authorisation can lapse; re-link
and it resumes.

## Chat is not registering votes or entries

1. Is the Twitch channel set in REGULATION → INTEGRATIONS? Chat ingest is
   read-only and needs the channel name, not an account.
2. For THE CONCORD, check the **vote syntax**. On `COMMANDED`, a bare `2` does
   not count. On `BARE NUMERAL`, `!vote 2` does not.
3. The parser refuses ambiguous messages rather than guessing. A message with
   several numbers in it is not a vote.
4. One vote or entry per citizen — a second from the same person replaces or is
   refused rather than adding.

## DISPATCH will not load

**"That does not look like a Firebase config."** — paste the whole snippet the
Firebase console shows, including the surrounding code. It is parsed; you do not
need to extract the JSON.

**"That address and password do not match an account."** — the two accounts are
real Firebase logins, address and password both, so a typo in either produces
this one message rather than naming which half was wrong.

**"That account is not on the board."** — Firebase accepted the sign-in, but the
account is neither of the two the database rules admit. Sign out and use the
right one.

## A GPU reading says UNAVAILABLE

Not a fault. Windows does not expose GPU utilisation without performance
counters, and this console will not draw `0%` for something it cannot measure.
An absent reading must never be mistaken for an idle one.

## Motion is making the console hard to use

REGULATION → PRESENTATION → **Motion**:

- `reduced` keeps state changes legible but removes ambient movement and grain.
- `off` disables transitions wholesale.

If it is only the **department change** that bothers you, that has its own
control beside Motion. **Page transition** is `off` by default — if a mark is
crossing the field as you walk the rail, something has turned it on. `fade`
keeps a quiet handover instead, and the rest of the console's movement is left
alone either way.

**Grain** is separately adjustable to zero, and **Interface scale** runs from
0.8 to 2.0 if the issue is size rather than movement.

## The orientation tour will not come back

By design. It is shown once per guide revision and dismissing it marks it read.

Nothing is lost. Every department's **Quick guide** button is always available
and covers the same ground for that department, and these chapters cover all of
it at more length. `F1` opens the guide for wherever you are.

## The quick strip has gone

It was hidden, or switched off, and Haven is still running.

1. Right-click Candy Haven's tray icon and choose **Show the Quick Strip**.
2. Or, in the console, open REGULATION → **QUICK STRIP** and switch **Show the
   strip** back on, then **File changes**.

If it is on but you can't see it, it may be folded to the logo alone, or sat on
a screen that's no longer connected. **Back to the bottom right**, in the same
category, brings it back to its starting corner. While the console is on screen
the strip stands aside by design; minimise the console and it returns.

## Reminders never appear

Both kinds of reminder are Windows notifications, and only come while Candy
Haven is running.

1. Check the switch for the kind that's quiet:
   - CALENDAR entries: REGULATION → **QUICK STRIP** → **Reminders** must not be
     `OFF`, and the entry needs a start time; an all-day entry has nothing to
     remind before.
   - Follow-ups: REGULATION → **LEADS** → **Remind me** must be on.
2. In Windows, open **Settings → System → Notifications** and make sure
   notifications are on for Candy Haven.
3. Check **Do not disturb** (Focus): while it's on, notifications go quietly to
   the notification centre instead of appearing.

A follow-up made already due, like a new lead's first interaction due now,
doesn't remind in the sitting it was made in, by design. It shows as overdue on
the strip, in NEXUS and in LEADS, and the next time Haven opens it's counted.

## A follow-up still says overdue after snoozing it

By design. **Snooze** only quiets its reminders until then; the follow-up is
still past its due time, so it still reads overdue, now with **Snoozed to** and
when. To actually move it, open it (**Edit**) and give it a new due time. A new
time also clears the snooze, so the new time reminds you afresh.

**Dismiss** is the same: no more reminders, but the follow-up stays open until
it's ticked off.

## A reminder's popup says "Done already, or no longer here."

The follow-up was completed, removed or archived after the notification came:
from the console, from another popup, or because its lead was archived. There
is nothing left to do about it. **All of today** opens the strip's Today list
for what's still open.

## LEADS says the archive is not connected

LEADS, OPPORTUNITIES and their follow-ups live in the archive, so they can't be
read or written while it's down. NEXUS says why in plain words, and **The
archive says OFFLINE** above covers what to do. Once the archive is back, the
leads come back with it; nothing was lost.

## A rename is refused

The rename dialog says why, and nothing on disk has moved.

**"That project is in use by another program."** — Ableton Live has the set
open, or an Explorer window is inside the project's folder. Close both, then
press **Rename** again.

**"Something called … is already on that shelf."** — another project or folder
has that name. Choose another, or rename the other one first.

**"This project already has a set called …"** — one of the project's other sets
already has the new name. Choose another, or rename that set in Ableton.

## Quit didn't quit

By design: the strip's power button asks twice. The first press turns it
crimson and says **Press again to quit Candy Haven**; a second press within
three seconds quits. Wait longer and it settles back. **Quit Candy Haven** on
the tray icon or in the strip's **More** menu quits in one press.

## Where the logs are

REGULATION → **DIAGNOSTICS** lists the real resolved paths for this
installation: user data, the log file and the archive's own directory, with the
locale. **Open user data** opens the folder. The versions being run are on
NEXUS, in **03 RUNTIME**.

The log is where a failure that has scrolled past still exists. Filing failures
record what was refused and why.

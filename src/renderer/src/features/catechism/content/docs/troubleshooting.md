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

**Fast boot** under REGULATION → STARTUP shortens the cinematic. The stages still
run; only the presentation is abbreviated.

## The orb is dark, or the archive says OFFLINE

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

1. Does the OBSERVATORY masthead say **Serving**? If not, **Restart server**.
2. Does **Attached** count your source? If it reads `0` with OBS open, the source
   is not connected — the URL is wrong.
3. Is the source's width and height the canvas the card quotes?
4. Is **Shutdown source when not visible** unchecked? If it is checked, state is
   lost on every scene change.
5. For a `panel` overlay, is `?transparent=1` on the URL?

Append `?guides=1` to draw the safe area while you position it, and take it off
before going live.

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

**"That password does not match either account."** — there are two accounts and
one password each. The password is what identifies you, so a typo reads as
neither account rather than as a wrong password for a named one.

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

## Where the logs are

REGULATION → **DIAGNOSTICS** lists the real resolved paths for this
installation: user data, the log file, the archive's own directory, and the
versions being run.

The log is where a failure that has scrolled past still exists. Filing failures
record what was refused and why.

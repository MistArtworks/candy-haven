# NEXUS

## The landing

![nexus-01-landing.png](nexus-01-landing.png)

The suspended orb reports the live state of the archive — the database every
other department reads through. It is the fastest health check the console has:
if the orb is steady, the installation is sound.

The version and the last boot's duration are set beneath it.

## The overview

![nexus-02-overview.png](nexus-02-overview.png)

One scroll down is the diagnostic grid. Five panels, numbered as everything here
is numbered.

- **01 ARCHIVE** — state, where the runtime came from, the data path, latency.
- **02 BOOT REPORT** — how long the last start took, and its slowest stage.
- **03 RUNTIME** — Candy Haven, Electron, Chromium and Node versions.
- **04 UPDATE CHANNEL** — what you are running and what is available.
- **05 DEPARTMENTS** — the register, and whether each is in service or reserved.

> When startup starts feeling slow, the **slowest stage** field in the boot
> report is the first thing worth reading. It names the stage rather than making
> you guess.

# NEXUS

The landing, then the overview. Two movements on one page: something that states
what this installation is, and the numbers underneath it.

## The landing

![nexus-01-landing.png](nexus-01-landing.png)

The suspended orb carries the live state of the archive — the database every
other department reads through. It is not a spinner.

| Orb reads | Archive state                                 |
| --------- | --------------------------------------------- |
| Steady    | `online` — the register is available          |
| Pulsing   | `starting` or `connecting` — work in progress |
| Warm      | `degraded` — up, but something is wrong       |
| Dark      | `offline` or `error` — nothing will load      |

The version and the last boot's duration are set beneath it. One gesture
downward reaches the numbers.

## The overview

![nexus-02-overview.png](nexus-02-overview.png)

Five panels.

### 01 ARCHIVE

| Field              | Meaning                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------- |
| **State**          | The daemon's current state                                                              |
| **Runtime source** | Where `mongod` was found — installer, user data, system, path, or a configured override |
| **Data path**      | Where the database keeps its files                                                      |
| **Latency**        | Round-trip of the most recent ping                                                      |
| **Last event**     | The most recent thing the archive said. Where a failure explains itself                 |
| _aside_            | How many times the supervisor has restarted the daemon this session                     |

A non-zero restart count on a healthy installation is worth investigating. The
supervisor recovers from crashes, but it should not be having to.

### 02 BOOT REPORT

How long the last start took, how many of the nine stages completed, and — most
usefully — the **slowest stage**.

When startup begins to feel slow, that field is the first thing to read. It
names the stage rather than making you guess, and the nine stages do genuinely
different work:

```
runtime            resolve paths, create directories
configuration      load and validate settings
archive-binary     locate mongod
archive-provision  download the MongoDB runtime (only if missing)
archive-daemon     claim a port, start mongod
archive-link       open the driver connection
archive-schema     reconcile collections and indexes
services           configure the updater, dispatch an update check
harmonics          health-check the archive
```

`archive-provision` taking a long time on a first run is expected — it is
downloading the database runtime.

### 03 RUNTIME

Candy Haven, Electron, Chromium and Node versions, and whether this is a
packaged build or a development one.

### 04 UPDATE CHANNEL

What you are running, what is available, and the updater's current state.

### 05 DEPARTMENTS

The register of departments, each marked **IN SERVICE** or **RESERVED**, and
each a link. A reserved department is routed and specified but not yet built.

> The boot screen is not a timed animation — it mirrors the real state machine
> above, weighted by stage, with skipped stages removed from the denominator. A
> failure halts it with a structured error, an operator-facing hint and a retry.

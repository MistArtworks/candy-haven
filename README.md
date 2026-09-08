# Candy Haven

Production assistant and content operations console for the Nayara universe.

Candy Haven is a Windows desktop application built on Electron. It is the operator
console for a music production practice: Ableton project management, release
pipelines, stream overlay control, and a natural-language command interface —
all backed by a private, application-owned MongoDB instance.

This repository currently contains the **application foundation**: the boot
sequence, the console shell, the design system, and the full main-process
service layer. Feature departments are routed and specified but not yet
commissioned.

---

## Design language

The interface follows the world brief in [`info/theme-aesthetic.md`](info/theme-aesthetic.md)
and the reference boards in `info/img ref/`. Three rules drive most decisions:

1. **One focal object per view.** Every reference board centres a single
   suspended crimson object in a vast symmetrical field. The boot screen has its
   orb; each page has at most one `focal` panel.
2. **Five materials, no more.** Obsidian, concrete, brushed gold / aged brass,
   crimson glass, alabaster. Crimson is the only saturated colour and is
   reserved for focal points and live state. No blues, greens or primaries.
3. **Institutional typography.** Uppercase, wide tracking, numbered sections.
   The console reads as a department of a bureaucracy, not a consumer app.

The palette lives in [`src/renderer/src/styles/base/_theme.scss`](src/renderer/src/styles/base/_theme.scss)
as CSS custom properties, sampled directly from the reference artwork.

---

## Architecture

```
src/
├── main/                      Electron main process
│   ├── app/                   Boot sequence, window management
│   ├── core/                  Logging, paths, errors, async utilities
│   ├── ipc/                   Typed IPC router and handlers
│   └── services/              Settings, archive (MongoDB), updates
├── preload/                   contextBridge — the only ipcRenderer consumer
├── shared/                    Contracts shared by all three processes
│   ├── domain/                Zod schemas + zod-free constants
│   └── ipc/                   Channel contract and public API surface
└── renderer/src/              React application
    ├── app/                   Router, providers, stores
    ├── components/            Design system primitives
    ├── features/              One directory per department
    ├── layouts/               Console shell
    ├── motion/                Shared animation vocabulary
    └── styles/                Sass tokens, mixins, theme
```

### The IPC boundary

Every cross-process call is declared once in
[`src/shared/ipc/contract.ts`](src/shared/ipc/contract.ts). That single
declaration drives three consumers:

- the **main-process router**, which validates inputs *and* outputs at runtime
  and wraps every result in a success/failure envelope, so a renderer call can
  never crash the main process;
- the **preload bridge**, which refuses any channel not in the contract;
- the **renderer**, whose call signatures are derived from the same schemas.

Adding a channel is one edit; every consumer stays type-checked against it.

### Domain modules are split in two

`boot.ts` holds zod schemas; `boot.constants.ts` holds the stage table and
factory functions with no zod import. The renderer imports constants as values
and schemas as types only. This keeps the schema library out of the renderer
bundle entirely — worth about 170 kB and, more usefully, it enforces that
validation happens at the boundary rather than in the UI.

### State in the renderer

Two mechanisms, split by direction of data flow:

- **Server-pushed state** (boot progress, archive health, update status, window
  state) flows into a Zustand store via a single subscriber, `SystemBridge`.
- **Request/response data** uses TanStack Query, which also drives the in-flight
  state of action buttons.

---

## The boot sequence

The boot screen is not a timed animation. It mirrors a real state machine in
[`src/main/app/boot-sequence.ts`](src/main/app/boot-sequence.ts), where each of
the nine stages performs actual work:

| Stage | Work performed |
| --- | --- |
| `runtime` | Resolve application paths, create directories |
| `configuration` | Load and validate operator settings |
| `archive-binary` | Locate `mongod` |
| `archive-provision` | Download the MongoDB runtime *(only if missing)* |
| `archive-daemon` | Claim a free loopback port, start `mongod` |
| `archive-link` | Open the driver connection |
| `archive-schema` | Reconcile collections and indexes |
| `services` | Configure the updater, dispatch a background update check |
| `harmonics` | Health-check the archive |

Progress is weighted by stage, and skipped stages are removed from the
denominator, so the meter reflects real remaining work. Failures halt the
sequence with a structured error, an operator-facing hint, and a retry action.

---

## The embedded archive (MongoDB)

Candy Haven owns a private MongoDB instance. It is never a system service:

- bound to `127.0.0.1` only, on port **27917** by default (deliberately off
  MongoDB's 27017 so it cannot collide with a system install);
- data lives in `%APPDATA%\candy-haven\archive\data`;
- the daemon is supervised — crashes trigger bounded automatic restarts, and
  shutdown is protocol-level first so WiredTiger closes cleanly.

### How the runtime is delivered

The NSIS installer downloads MongoDB during installation
([`build/installer.nsh`](build/installer.nsh) →
[`build/scripts/install-archive-runtime.ps1`](build/scripts/install-archive-runtime.ps1)),
extracting only `bin/` minus debug symbols — roughly 80 MB on disk.

That step is **non-fatal by design**. If it fails, the installer still succeeds
and the application provisions the runtime itself on first launch, with resume
support and SHA-256 verification. A blocked download degrades to a slower first
start, never a broken installation.

Discovery order at launch: operator-configured path → installer-provided →
app-provisioned → system install → `PATH`.

> **Note on download size.** The pinned official archive is ~805 MB because
> MongoDB ships debug symbols in it. To serve a trimmed, self-hosted archive
> instead, set `CANDY_HAVEN_MONGO_URL` and `CANDY_HAVEN_MONGO_SHA256`, or edit
> `PINNED_RELEASE` in
> [`src/main/services/archive/mongo-release.ts`](src/main/services/archive/mongo-release.ts).
> Nothing else needs to change.

---

## Development

```bash
npm install
npm run dev          # launch with HMR
npm run typecheck    # both tsconfig projects
npm run lint
npm run build:win    # produce the NSIS installer in release/
```

Requires Node 20.19+ and Windows.

### Useful environment variables

| Variable | Effect |
| --- | --- |
| `CANDY_HAVEN_MONGO_URL` | Override the MongoDB archive source |
| `CANDY_HAVEN_MONGO_SHA256` | Expected digest for the above |
| `FORCE_DEV_UPDATE_CONFIG=1` | Exercise the updater against `dev-app-update.yml` without packaging |

---

## Adding a department

Feature sections are already routed to a reserved-state page that lists their
commissioning scope. To bring one online:

1. Build the feature under `src/renderer/src/features/<name>/`.
2. Swap its route in [`src/renderer/src/app/router.tsx`](src/renderer/src/app/router.tsx).
3. Flip `implemented: true` in [`src/shared/domain/navigation.ts`](src/shared/domain/navigation.ts).
4. Add any collections and indexes to
   [`src/main/services/archive/schema.ts`](src/main/services/archive/schema.ts).
5. Declare new IPC channels in [`src/shared/ipc/contract.ts`](src/shared/ipc/contract.ts)
   and implement them in `src/main/ipc/register-handlers.ts`.

The navigation rail, page transitions and titlebar pick the section up
automatically from the shared registry.

---

## Release configuration

Auto-update is wired through `electron-updater` against a generic feed. Before
the first release, set a real URL in both
[`electron-builder.yml`](electron-builder.yml) (`publish.url`) and
[`dev-app-update.yml`](dev-app-update.yml), and sign the installer — Windows
SmartScreen will otherwise warn on every download.

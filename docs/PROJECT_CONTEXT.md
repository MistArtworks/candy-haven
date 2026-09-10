# Candy Haven — Project Context

> **Purpose of this file.** A complete, self-contained briefing so a fresh
> conversation can add a feature without re-deriving the architecture. Read this
> top to bottom before writing code. Where it says "non-negotiable", treat it as
> a hard constraint the user has already decided.
>
> Last updated: 2026-09-09. Five of six departments delivered; INTERFACE is the
> only one still reserved. TRANSMISSIONS was **removed** in the ARCHIVE rework
> and will be respecified — see §10.

---

## 1. What this is

Candy Haven is a **Windows-only Electron desktop application** built for a music
producer. It is two things at once:

1. a **personal assistant** for their production practice, and
2. a **content operations console** — Ableton project management, release
   pipelines, stream overlay control, and a natural-language command interface.

It is backed by a **private, application-owned MongoDB instance** (never a system
service). The app is styled as an institutional terminal from a fictional
universe; see §3.

**Current state:** the foundation and five of the six departments are shipped —
NEXUS, ARCHIVE, OBSERVATORY, TELEMETRY, REGULATION. **INTERFACE** is the only
department still reserved, and THE DOCKET the only reserved overlay.

TRANSMISSIONS (release and promotional scheduling) was **deleted** during the
ARCHIVE rework of 2026-09-09, on the operator's instruction, because the release
model it read from no longer exists. A replacement will be specified separately.
Do not resurrect the old one: its service, domain, hooks, components and six IPC
channels were removed deliberately.

Note for anyone reading an older copy of this file: the department table in §10
was stale for several releases, listing ARCHIVE and OBSERVATORY as reserved long
after they shipped. `src/shared/domain/navigation.ts` is the source of truth;
when the two disagree, the registry is right and this file needs updating.

---

## 2. Decisions already made — do not re-litigate

The user chose each of these explicitly over alternatives that were offered.
Don't propose reversing them unless asked.

| Decision    | Choice                                                   | Notes                                                                                |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Platform    | **Windows only**                                         | NSIS installer. No macOS/Linux code paths.                                           |
| Database    | **MongoDB, downloaded by the installer at install time** | Not bundled. The official Windows archive is ~805 MB because it ships debug symbols. |
| Styling     | **All-custom SCSS**, no utility framework                | CSS Modules + a Sass token layer.                                                    |
| Animation   | **GSAP + motion (ex-framer-motion) + anime.js**          | Each used where it is genuinely best; see §7.                                        |
| three.js    | **Wanted later, not now**                                | `src/renderer/src/three/` was removed; reintroduce when asked.                       |
| Scaffolding | Official `npm create @quick-start/electron`              | The user asked for this specifically.                                                |
| Auto-update | **electron-updater**, generic provider                   | User ships updates frequently.                                                       |

### Environment gotcha — this will waste your time if you don't know it

The user's VS Code / Claude Code shell sets **`ELECTRON_RUN_AS_NODE=1`**. Any
Electron app launched from it runs as plain Node, so `require('electron').app`
is `undefined` and startup dies with:

```
TypeError: Cannot read properties of undefined (reading 'isPackaged')
  at @electron-toolkit/utils/dist/index.cjs
```

This is **not an application bug**. Launch with the variable stripped:

```bash
env -u ELECTRON_RUN_AS_NODE npx electron-vite dev      # or: preview
```

Also: `npm i -D electron@<ver>` did not run Electron's postinstall here once.
If `node_modules/electron/dist/` is missing, run
`node node_modules/electron/install.js`.

### Second gotcha — the shell eats backslashes in heredocs

Writing files via `bash << 'EOF'` **collapses `\\` to `\`** in this environment,
even in a quoted heredoc. That silently corrupts:

- Windows path literals (`'C:\\Program Files'` → `'C:Program Files'`)
- regex escapes (`/\\/g` → `/\/g`, a syntax error)
- `'\\n'` inside strings → a literal newline

**Use the Write or Edit tool for any file containing backslashes.** This bit the
project twice, including once in a throwaway test script that made `nvidia-smi`
appear broken when the shipped code was fine.

---

## 3. The world and the visual language

The design brief is **`info/theme-aesthetic.md`** and five reference boards live
in **`info/img ref/*.png`** (each 8–11 MB; downscale before reading them). There
is also `info/lore.md` with the full universe summary.

Style: **"Esoteric Retrofuturist Brutalism"** — an occult bureaucracy outside of
time. Named touchstones: Loki's TVA production design (the clearest influence),
Dune, Warhammer 40k, Mass Effect character elongation.

### Three rules the whole codebase enforces

1. **One focal object per view.** Every reference board centres a single
   suspended crimson object in a vast symmetrical field. The boot screen has its
   orb; each page has **at most one** `focal` Panel.
2. **Five materials only** — obsidian, concrete, brushed gold / aged brass,
   crimson glass, alabaster. **Crimson is the only saturated colour** and is
   reserved for focal points, live state, and destructive actions. No blues,
   greens, or bright primaries. Ever.
3. **Institutional typography** — uppercase, wide letter-spacing, numbered
   sections. It reads as a government department, not a consumer app.

Review question for any new UI: _does this introduce a sixth colour, or a second
focal object?_ If yes, it's wrong.

### In-world naming

The UI uses lore names for real things. Keep this consistent:

| UI term                     | Actually means                                           |
| --------------------------- | -------------------------------------------------------- |
| **The Archive**             | The embedded MongoDB instance                            |
| **Resonance / harmonics**   | System health, sync, connection                          |
| **Department**              | A navigable section of the app                           |
| **Operator**                | The user                                                 |
| **Sonoalchemy**             | The in-world science; used in chrome and the boot screen |
| **Reserved / commissioned** | Not-yet-built vs shipped feature                         |

---

## 4. Stack

```
Electron 44.2.0   ·  React 19.2   ·  Vite 7.2 (electron-vite 5)
TypeScript 5.9    ·  Sass (sass-embedded) + CSS Modules
MongoDB driver 7  ·  zod 4.5  ·  zustand 5  ·  TanStack Query 5
react-router-dom 7 (HashRouter)  ·  GSAP 3.15  ·  motion 13  ·  anime.js 4
electron-updater 6.8  ·  electron-log 5.4  ·  yauzl 3.4  ·  electron-builder 26
```

Node ≥ 20.19. Zero npm audit vulnerabilities as of last check.

### Scripts

```bash
npm run dev          # HMR dev (prefix with: env -u ELECTRON_RUN_AS_NODE)
npm start            # electron-vite preview (runs the built output)
npm run typecheck    # both tsconfig projects — ALWAYS run this
npm run lint         # eslint; must be 0 errors
npm run format       # prettier
npm run build        # typecheck + build
npm run build:win    # NSIS installer into release/
```

**Definition of done for any change:** `npm run typecheck` clean, `npx eslint .`
clean (0 errors), `npx electron-vite build` succeeds. Run `npx eslint . --fix`
before finishing — this shell writes CRLF and prettier is configured `endOfLine: lf`,
so expect line-ending warnings otherwise.

---

## 5. Repository layout

```
candy-haven/
├── docs/PROJECT_CONTEXT.md      ← this file
├── info/                         design brief + reference boards + lore
├── build/
│   ├── installer.nsh             NSIS customInstall / customUnInstall macros
│   └── scripts/*.ps1             install/remove the MongoDB runtime
├── electron.vite.config.ts       three builds: main, preload, renderer
├── electron-builder.yml          Windows/NSIS packaging
├── dev-app-update.yml            updater feed for unpackaged testing
└── src/
    ├── main/                     Electron main process
    │   ├── index.ts              entry: single-instance, lifecycle, shutdown
    │   ├── app/
    │   │   ├── boot-sequence.ts  THE boot state machine (see §8)
    │   │   └── window-manager.ts frameless window, persisted geometry
    │   ├── core/                 logger, paths, errors, async, emitter
    │   ├── ipc/
    │   │   ├── router.ts         typed + validated IPC boundary
    │   │   └── register-handlers.ts  all handlers + event bridges
    │   └── services/
    │       ├── container.ts      composition root
    │       ├── archive/          MongoDB: locate, provision, supervise, schema
    │       ├── projects/         register, scanner, .als reader, provisioner
    │       ├── stacks/           the filing tree — real directories on disk
    │       ├── volumes/          albums / EPs / compilations (metadata only)
    │       ├── releases/         RELEASES folders + their deliverables
    │       ├── settings/         file-backed settings
    │       ├── telemetry/        host vitals sampler + GPU probe
    │       └── update/           electron-updater wrapper
    ├── preload/index.ts          contextBridge — ONLY ipcRenderer consumer
    ├── shared/                   imported by all three processes
    │   ├── constants.ts
    │   ├── domain/               zod schemas + zod-free constants (see §6)
    │   └── ipc/{contract,api}.ts
    └── renderer/src/
        ├── App.tsx               boot→console handover
        ├── app/{router,store,providers}
        ├── components/           design system (chrome, nav, primitives, sigil, feedback)
        ├── features/             one directory per department
        ├── layouts/ConsoleLayout.tsx
        ├── hooks/
        ├── lib/format.ts
        ├── motion/transitions.ts
        └── styles/{abstracts,base,global.scss}
```

Path aliases (configured in `electron.vite.config.ts` **and** both tsconfigs):
`@main/*`, `@shared/*`, `@renderer/*`.

---

## 6. Architecture — the parts that matter

### 6.1 The IPC boundary

Every cross-process call is declared **once** in
`src/shared/ipc/contract.ts`. That single declaration drives three consumers:

- **`src/main/ipc/router.ts`** validates the input _and_ the output against the
  schema at runtime, and wraps every result in a success/failure envelope. A
  renderer call therefore can never crash the main process, and errors cross as
  structured data (`code`, `message`, `hint`, `recoverable`) rather than strings.
- **`src/preload/index.ts`** refuses any channel not in the contract, and
  rehydrates serialized errors into real `Error` objects.
- **the renderer** derives its call signatures from the same schemas.

Adding a channel is one edit to `contract.ts`, one handler in
`register-handlers.ts`, one method on `CandyHavenApi` in `shared/ipc/api.ts`,
and one line in the preload bridge.

**Channel groups** (see `contract.ts` for the authoritative list — it has grown
well past what is worth mirroring here): `runtime` · `window` · `boot` ·
`archive` · `settings` · `update` · `telemetry` · `projects` · `transmissions` ·
`rite` · `concord` · `chat` · `timer` · `nowplaying` · `overlay` · `shell` ·
`dialog`.

**Current push events:** `boot:progress` · `archive:status` · `update:status` ·
`telemetry:sample` · `projects:scan` · `rite:state` · `concord:state` ·
`chat:status` · `timer:state` · `nowplaying:state` · `overlay:info` ·
`window:state`

Note that not every department has one. TRANSMISSIONS deliberately has no push
channel: nothing changes its schedule except the operator working in this
console, so a subscription would be a socket held open to be told about changes
this window just made. It relies on query invalidation instead.

The renderer surface is exposed as **`window.candy`** (typed by
`src/preload/index.d.ts`). No component ever touches `ipcRenderer`.

### 6.2 Domain modules are split in two — important

Files come in pairs:

- **`<name>.ts`** — zod schemas and `z.infer` types. Imported by main/preload.
- **`<name>.constants.ts`** — factory functions, lookup tables, thresholds, with
  **no zod import**. Imported by the renderer as _values_.

The renderer imports constants as values and schemas **type-only** (`import type`,
which is erased at compile time). This keeps zod entirely out of the renderer
bundle — worth ~170 kB, and more usefully it enforces that validation happens at
the boundary, not in the UI.

Existing pairs: `boot`, `archive`, `telemetry`. Plus `settings.merge.ts`, a
zod-free merge shared by main and renderer so the two can't disagree about what
a patch means.

**If you add a domain module, follow this split.**

### 6.3 Renderer state — two mechanisms, split by direction

- **Server-pushed state** → `src/renderer/src/app/store/system.store.ts`
  (zustand). Written by exactly one subscriber, `SystemBridge`, mounted above
  the router. Holds boot snapshot, archive status, update status, settings,
  window state, and the `shellPhase`.
- **Request/response data** → TanStack Query (`useRuntimeInfo`), which also
  drives in-flight state on action buttons.

`SystemBridge` subscribes **before** fetching initial snapshots so no event is
missed, then skips hydrating any channel a live push has already claimed —
otherwise a slow snapshot response could roll fast-moving boot state backwards.

**Telemetry deliberately does NOT live in the store.** It is subscribed by the
Telemetry page only (`useTelemetry`), so sampling stops when you navigate away.

### 6.4 Settings are local-first — read this before touching them

The renderer store is the **source of truth** for settings; the main process is a
persistence sink. `useApplySettings()` merges each patch into the store
immediately, then persists in the background (optionally debounced per key).
**Server responses are not applied at all.**

This is deliberate. The original design applied the main process's _response_ to
each write, which made the UI hostage to response ordering: adjusting one control
while another write was still in flight applied a response that predated the
newer change, visibly reverting it. Changing the accent and then dragging the
grain slider was enough to hit it. Not applying responses removes the race
entirely. Failed writes reconcile by refetching.

```ts
const applySettings = useApplySettings()
applySettings({ appearance: { accent: 'gold' } })
applySettings({ appearance: { grain: 0.4 } }, { debounceMs: 200, key: 'grain' })
```

### 6.5 Services

`src/main/services/container.ts` is the composition root. Services are
constructed once and **passed explicitly** — nothing reaches for a global.
`disposeServiceContainer` tears down in reverse order with each step isolated,
because it runs on the quit path.

---

## 7. Design system

### 7.1 Palette (`src/renderer/src/styles/base/_theme.scss`)

58 CSS custom properties, sampled from the reference artwork. Never hard-code a
colour; always use a variable.

```
obsidian   900 #08080a · 800 #0c0c0c · 700 #111011 · 600 #171517
surface        #131113 · raised #1a171a · sunken #0a090b
concrete   700 #3b372f · 600 #554e42 · 500 #6f6656 · 400 #8a8071
alabaster  600 #8f7d63 · 500 #b69e7c · 400 #cdb994 · 300 #ddcfb2
brass      700 #45351f · 600 #5e472c
gold       500 #976b30 · 400 #b98b47 · 300 #d2a961 · 200 #e3c286
crimson    900 #24090a · 800 #43120f · 700 #5e1a16 · 600 #7a1e1a · 500 #a32b23 · 400 #c4453a

text       primary #ddcfb2 · secondary #8a8071 · muted #5a544a · faint #3d3931
line       rgba(182,158,124,.12) · strong .26 · gold rgba(210,169,97,.34)
accent     → crimson-500 (re-pointed to gold-500 under [data-accent='gold'])
```

Runtime theme switches are driven by attributes on `<html>`, set by
`useThemePreferences()`: `data-motion="full|reduced|off"` and
`data-accent="crimson|gold"`, plus `--ch-grain-opacity`.

### 7.2 Sass layer

Every stylesheet begins `@use 'abstracts' as *;`. This resolves via the
`loadPaths` entry in `electron.vite.config.ts`. **Do not use `additionalData`** —
it would inject the import into the abstracts index itself and create a circular
`@use`.

Available: `space(n)` (4px grid), `z('name')`, `breakpoint('sm|md|lg|xl')`,
`rem(px)`; mixins `label()`, `readout()`, `hairline()`, `panel()`, `focus-ring()`,
`motion-safe`, `truncate`, `visually-hidden`, `window-drag`, `window-no-drag`,
`above()`, `below()`.

Tokens: `$titlebar-height: 40px`, `$rail-width: 232px`,
`$ease-out-expo/in-expo/in-out/instrument`, `$duration-instant|fast|base|slow|cinematic`,
`$radius-control: 2px` (corners are square by default — brutalism).

### 7.3 Primitives (`src/renderer/src/components/`)

| Component             | Use                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `Panel`               | The standard slab container. Props: `label`, `index`, `aside`, `focal`, `flush`, `animated`. |
| `PageHeader`          | Section masthead: numbered label, purpose line, rule, epigraph, actions.                     |
| `Field` / `FieldGrid` | Labelled readout; grid supports 1–4 columns.                                                 |
| `Button`              | `variant: primary\|ghost\|danger`, `size: sm\|md`, `busy`.                                   |
| `Meter`               | Linear progress with quarter ticks; `null` value = indeterminate sweep.                      |
| `StatusDot`           | Square state indicator; **always pass `label`** — never colour alone.                        |
| `Sigil`               | The four-point Sonoalchemy star (used in titlebar, Nexus hero).                              |
| `Logomark`            | The real brand mark — a galaxy vortex, from `assets/Logo.svg`.                               |
| `ErrorBoundary`       | Top-level render guard with a reload action.                                                 |
| `Portal`              | Renders into `document.body`. **Required for every overlay a page draws** — see below.       |

`Logomark` inlines the SVG path rather than importing the file, so it can be
driven by `currentColor`. **If the artwork changes, re-copy the `d` attribute
from `src/renderer/src/assets/Logo.svg`.**

#### Interface scale

`appearance.uiScale` (0.8–2.0) is applied as **Electron's zoom factor**, via
`webFrame.setZoomFactor()` in the preload bridge. It is Windows' display scaling
for this one window: text, controls, spacing, borders and artwork all move
together.

**Do not reimplement this as a CSS variable on the root font size.** That was
tried first and does not work here: `label()` and `readout()` — the two mixins
that draw nearly every institutional label and mono readout in the console —
take a **raw pixel** size, so only body copy scaled and the setting looked half
broken. Fixing that properly would mean converting every call site of both
mixins; scaling the frame gets everything for one line.

Two details that are load-bearing:

- It is set in the **preload**, not over IPC. `webFrame` is renderer-side and
  preload runs in the renderer, so it applies directly with no round trip. It is
  the only thing on that bridge that does not go through a channel.
- It is re-asserted on **every hydration**, not only on change, because Chromium
  remembers a zoom factor per origin across reloads — otherwise a reload can
  come back at whatever the last session left rather than at what is stored.

The control lives behind `ScaleDialog` rather than inline, and that is not
ceremony: a slider wired straight to the zoom factor rescales the page _while it
is being dragged_, so the slider slides out from under the pointer. The dialog
holds the console still and scales a sample instead, using CSS `zoom` — which
reflows exactly as the frame's zoom will, unlike `transform: scale()`, which
would resample a 100% layout and misrepresent both line breaks and hairlines.

#### `position: fixed` does not work inside a page — use `Portal`

`ConsoleLayout` animates each page with `pageVariants`, which moves `y`, `scale`
and `filter`. Motion leaves those inline once settled, and a **transform or a
filter makes an element the containing block for every `position: fixed`
descendant**. An overlay rendered by a page therefore resolves `inset: 0`
against the page, not the viewport: the backdrop covers only the page box and
the sheet centres on it.

It is not a CSS bug and no amount of `z-index` or `inset` fixes it. Wrap the
overlay in `<Portal>`. This already bit the project once — every ARCHIVE
overlay (dossier, setup gate, context menu, all four dialogs) was mispositioned.
The context menu was the worst case: it positions at `clientX`/`clientY`, which
are viewport coordinates, so it opened away from the cursor.

`UnsavedBar` solves the same problem differently, by being a sibling of the page
wrapper — available only to the layout, which owns it.

Portalling does not break `AnimatePresence`: the component stays in the React
tree and only the DOM node moves, so exit animations still run.

### 7.4 Grid convention — non-negotiable

Page grids are `repeat(6, minmax(0, 1fr))` with `align-items: stretch`, and
`Panel` has `height: 100%`. **Panels fill their grid cell.** Declare spans with
**explicit classes** (`.span2`, `.span3`, `.span6`), never positional
`nth-child` rules — those fought the responsive overrides on specificity and
silently changed layout when a panel was reordered.

### 7.5 Animation — which library for what

- **motion** — React enter/exit, page transitions, shared-layout (the rail's
  active marker uses `layoutId`). Vocabulary lives in `motion/transitions.ts`:
  `pageVariants`, `gridVariants`, `panelVariants`, `bootExitVariants`,
  `consoleEnterVariants`.
- **GSAP** — precisely sequenced multi-element timelines. Used for the boot
  entrance cinematic.
- **anime.js** — SVG stroke/stagger work. Used for the boot ring's tick
  stagger and completion pulses.
- **Canvas 2D** — the boot `ResonanceWeb` plexus (~88 nodes, hundreds of lines
  per frame — retained-mode DOM falls over here).

Always gate decorative motion on `useAnimationsEnabled()` or the `motion-safe`
mixin, which respect both the OS setting and the in-app preference.

### 7.6 Charts

Governed by the `dataviz` skill's method. What was decided:

- Charts here are **single-series**, so no legend — the tile's label names it.
- **Sequential ramp = one hue, gold, light→dark**, verified monotonic in OKLab
  lightness (`brass-700 → gold-200`).
- **Crimson is status-only and never a ramp step.** It sits mid-ramp
  (L≈0.565, essentially identical to gold-500's 0.562), so as a ramp step it
  would be ambiguous. It always ships with a text label
  (`NOMINAL` / `ELEVATED` / `CRITICAL`).
- Sparklines are **zero-anchored**, never cropped to the data range.
- Hover layer on every plot (crosshair + tooltip on lines, per-mark on bars);
  the current value is _also_ always rendered as text.
- 2px lines via `vector-effect: non-scaling-stroke`, 2px surface gaps between
  adjacent bars, recessive grid.

Note: the skill's `validate_palette.js` checks **categorical** palettes. Feeding
it a sequential ramp plus a status colour produces spurious FAILs — its own
scope note says so. For a sequential ramp, check lightness monotonicity; for a
status colour, check contrast.

---

## 8. The boot sequence

`src/main/app/boot-sequence.ts` is a real observable state machine. **The boot
screen is not a timed animation** — every stage does actual work, and the
renderer mirrors the state.

| #   | Stage               | Work                                                           |
| --- | ------------------- | -------------------------------------------------------------- |
| 1   | `runtime`           | Resolve paths, create directories                              |
| 2   | `configuration`     | Load + validate settings                                       |
| 3   | `archive-binary`    | Locate `mongod`                                                |
| 4   | `archive-provision` | Download the MongoDB runtime _(conditional — only if missing)_ |
| 5   | `archive-daemon`    | Claim a free loopback port, spawn `mongod`                     |
| 6   | `archive-link`      | Open the driver connection                                     |
| 7   | `archive-schema`    | Reconcile collections + indexes                                |
| 8   | `services`          | Configure updater, dispatch a background update check          |
| 9   | `harmonics`         | Health-check the archive                                       |

Progress is **weighted** per stage, and skipped stages are removed from the
denominator so the meter reflects real remaining work. The rolling log is
carried **on the snapshot** (bounded to 200 entries) so a renderer that
subscribes late gets the full history in one call. Failures halt with a
structured error, an operator-facing hint, and a retry action.

Typical boot on the dev machine: **~1.8–2.9 s**.

To add a stage: add the id to `BOOT_STAGE_IDS` and a definition to `BOOT_STAGES`
in `boot.constants.ts`, then add a runner in `createRunners()`. The runner map is
typed `Record<BootStageId, StageRunner>`, so a missing runner is a compile error.

### Boot screen composition

`BootScreen.tsx` — monolithic slabs, corner labels, masthead, focal orb, stage
readout, meter, log tail, enter affordance. Inside `BootRing.tsx`:

- `ResonanceWeb` — the canvas plexus, behind the mark, spins up while running
- `Logomark` — the brand vortex, rotating (9 s while running, 26 s at rest,
  frozen + crimson on failure)
- an SVG ring of **one tick per boot stage**, plus a weighted progress arc
- the orb: crimson glass with a gold rim at ready

Things tried and rejected (don't reintroduce): a sacred-geometry mandala using
`mix-blend-mode: screen` (washed the crimson orb to grey haze), and a dark
drop-shadow under the mark (the user called it "lame" — the plexus supplies
depth instead).

---

## 9. The Archive (MongoDB)

Owned entirely by the app. Never a system service.

- Bound to **`127.0.0.1` only**, port **27917** by default — deliberately off
  MongoDB's 27017 so it cannot collide with a system install. Verified in
  practice: the dev machine runs a system MongoDB on 27017 untouched.
- dbpath: `%APPDATA%\candy-haven\archive\data`
- Supervised: crashes trigger bounded auto-restarts (max 3, linear backoff).
  Shutdown is **protocol-level first** (`{ shutdown: 1 }`) so WiredTiger closes
  cleanly, then process termination as fallback.
- Port claiming scans upward from the configured port (32 attempts).

### How the runtime is delivered

The NSIS installer downloads MongoDB during installation
(`build/installer.nsh` → `build/scripts/install-archive-runtime.ps1`),
extracting only `bin/` minus debug symbols — ~80 MB on disk.

That step is **non-fatal by design**. If it fails, installation still succeeds
and the app provisions the runtime itself on first launch (stage 4), with resume
support and SHA-256 verification. A blocked download degrades to a slower first
start, never a broken install.

Discovery order: operator-configured path → installer-provided → app-provisioned
(userData) → system install (`Program Files\MongoDB\Server\*`) → `PATH`.

**Pinned release** is in `src/main/services/archive/mongo-release.ts`
(8.0.29 + SHA-256). The official archive is ~805 MB. To serve a trimmed
self-hosted one, set `CANDY_HAVEN_MONGO_URL` / `CANDY_HAVEN_MONGO_SHA256` or
edit `PINNED_RELEASE` — nothing else changes.

Zip extraction uses **yauzl** with our own path sanitising (`safeJoin` rejects
absolute paths, drive letters and `..`), extracting only needed members rather
than unpacking 800 MB.

### Collections (`src/main/services/archive/schema.ts`)

`projects` · `project_versions` · `archive_folders` · `archive_volumes` ·
`releases` · `overlays` · `command_history` · `events` · `migrations`

**Schema version 2** (`applyMigrations`) drops `projects`, `archive_folders`,
`releases`, `release_assets`, `transmission_tasks` and `unlinked_media` once, on
first boot of a build newer than the ARCHIVE rework. Files on disk are never
touched — only the database — and the register rebuilds from a rescan in
seconds. Bump `SCHEMA_VERSION` and add a branch there for the next such change.

Indexes are declared declaratively in `INDEX_PLAN` and reconciled every boot
(`createIndexes` is idempotent). Index failures are logged but **do not abort
boot** — a stale index conflict should degrade performance, not lock the operator
out. `command_history` has a 90-day TTL.

Access the db from a service via `archive.getDb()`, which throws a structured
`AppError` if not connected.

---

## 10. Departments

Registry: **`src/shared/domain/navigation.ts`** — the single source of truth for
routes, labels, order, and shipped status. The rail, titlebar, page transitions
and Nexus all read from it.

| #   | Id            | Path           | Status      | Purpose                                                |
| --- | ------------- | -------------- | ----------- | ------------------------------------------------------ |
| 1   | `nexus`       | `/`            | **shipped** | Operational overview and system state                  |
| 2   | `archive`     | `/archive`     | **shipped** | Project registry, production pipeline, releases        |
| 3   | `observatory` | `/observatory` | **shipped** | Stream overlays and live selection rites served to OBS |
| 4   | `interface`   | `/interface`   | reserved    | Natural-language command console                       |
| 5   | `telemetry`   | `/telemetry`   | **shipped** | Host vitals: processor, memory, graphics, storage      |
| 6   | `regulation`  | `/regulation`  | **shipped** | Operator settings, archive control, update channel     |

Note the OBSERVATORY overlay named **`transmission`** (singular, NOW
TRANSMITTING — the Spotify now-playing surface) is unrelated to the deleted
department and is still shipped. Do not conflate them.

Reserved sections render `ReservedPage` with a commissioning scope list (defined
inline in `src/renderer/src/app/router.tsx`) — deliberately not an empty page, so
the shape of the finished product is legible.

### To commission a department

1. Build the feature under `src/renderer/src/features/<name>/`.
2. Swap its route in `src/renderer/src/app/router.tsx`.
3. Flip `implemented: true` in `src/shared/domain/navigation.ts`.
4. Add collections/indexes to `src/main/services/archive/schema.ts`.
5. Declare IPC in `src/shared/ipc/contract.ts`; implement in
   `src/main/ipc/register-handlers.ts`; add to `shared/ipc/api.ts` + preload.

The rail, transitions and titlebar pick it up automatically.

**TELEMETRY is the best reference implementation** — it exercises a service, a
push channel with subscribe/unsubscribe, a domain split, charts, and a full page.

### ARCHIVE specifics

Reworked 2026-09-09. The department now **makes** structure rather than
discovering it, and that inversion explains most of its design.

**Setup is a gate, not a setting.** With no filing root and no project template,
`ArchivePage` renders `SetupGate` and nothing else. There is no useful
half-configured state: the department creates directories and copies files, so
it cannot honestly draw a workspace before it knows where the workspace is.

**On disk.** One `filingRoot` holds one `Candy Haven` wrapper. It defaults to
the **OS music folder** (`app.getPath('music')`), surfaced to the setup gate as
`ArchiveSetupState.suggestedRoot`, and the operator can change it. It is
deliberately _not_ their Ableton projects directory: where the archive builds
and where work already lives are different questions, and an earlier build that
conflated them buried the archive inside someone else's folder structure and
forced both onto one disk. Existing project folders are added as
`satelliteRoots` — scanned, never written to.

Inside the wrapper:

```
Candy Haven\
  EDM\                          GENRE  (depth 0)
    Undertow Project\           PROJECT — allowed directly in a genre
    Melodic Bass\               FOLDER (depth 1+) — optional subdivision
      Solstice Project\         PROJECT — the Ableton project folder itself
        Solstice.als            template copy, renamed
        Samples\  Backup\       Ableton's
        WIPS\ MIX & MASTER\ STEMS\ GRAPHICS\ MARKETING\ REFERENCES\
  RELEASES\                     reserved; never a genre, skipped by the scan
    Solstice\  MASTER\ ART\ COPY\
  RECYCLE BIN\                  reserved; deleted projects, skipped by the scan
    Undertow Project\
```

`RESERVED_WRAPPER_DIRECTORIES` holds both reserved names. They are refused as
genre names and excluded from the scan walk. The bin **must** stay excluded:
indexing it would resurrect every deleted project as a live record on the next
launch.

The project folder **is** the Ableton project folder. That keeps the scanner's
definition — "a folder directly containing a `.als`" — true, which is why
provisioning needed no scanner change at all.

**Folder kind is derived from depth, never stored.** `folderKindAtDepth`:
0 = genre, below that = plain folder. Moving a folder changes what it is, and a
stored `kind` would eventually disagree with where the folder sits.

The kind is a **naming distinction only** — nothing behaves differently at one
depth than another. **Any folder may hold projects**, including a genre. An
earlier build named depth 1 a SUB-GENRE and required every project to sit in
one; the client rejected that as needless complexity, so `MIN_PROJECT_DEPTH` and
`canHoldProjects` are gone. Do not reintroduce a mandatory level.

**Four objects, three of which touch disk.**

| Object     | Directory?          | Owner                 |
| ---------- | ------------------- | --------------------- |
| Folder     | yes, real           | `stacks.service.ts`   |
| Project    | yes, real           | `projects.service.ts` |
| **Volume** | **no — metadata**   | `volumes.service.ts`  |
| Release    | yes, under RELEASES | `releases.service.ts` |

A VOLUME (album / EP / compilation) deliberately owns no directory. A track's
place on disk is already spoken for by the shelf it is filed on, and making an
album a second real hierarchy would put the two permanently at war. Membership
lives on the _project_ (`volumeId` + `trackNumber`), never as a list on the
volume — one source of truth.

_Invariant:_ `category ∈ {album, ep, compilation}` ⟺ attached to a volume of
that same kind. Enforced in `reconcileCategory`, not only in the UI.

**Releases copy, never move.** The project stays filed under its genre; the
master, cover and canvas are duplicated into `RELEASES/<title>/`. Moving them
would leave the genre tree full of holes the moment anything shipped.

**Disk first, database second**, everywhere both are touched. A failed
filesystem operation leaves the database untouched and the operator sees a
refusal; the reverse order would let the app believe in a directory that does
not exist.

**Deleting is two stages, and no single action destroys anything.**

| Channel            | What it does                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `projects:forget`  | Drops the record. Files untouched; the next scan finds it again.                                          |
| `projects:trash`   | Moves the folder into `RECYCLE BIN/`. **Record is kept**, with `trashedAt` and `trashedFrom`.             |
| `projects:restore` | Moves it back to `trashedFrom`, then re-files it from its landing path.                                   |
| `projects:purge`   | Refused unless already binned. Sends the folder to the _OS_ recycle bin, then drops the record.           |
| `stacks:delete`    | Moves a **folder** into the bin with its whole subtree — descendant folders and every project under them. |
| `stacks:restore`   | Brings that subtree back, re-parenting from wherever it lands.                                            |

Folders go to the bin too. `stacks:delete` used to lift the contents up to the
parent and remove the emptied directory behind a two-step confirmation — the
safest thing available before the archive had a bin, but the shelf vanished
irreversibly and the dialog's "nothing is deleted from disk" was not quite true
of the directory itself. The whole subtree now moves intact, so an occupied
folder is no longer a hazard and the second confirmation is gone. `trashedFrom`
on each folder and project is what lets a restore rebuild the original shape
rather than flattening it into one directory.

The archive owns its bin rather than using Windows' directly because Windows'
cannot be browsed or restored from inside this application — "restore that
project" would otherwise mean telling the operator where to click in Explorer.
Restoring falls back to the filing root when the original shelf has gone;
coming back unfiled is one drag to fix, whereas refusing would strand the
project in the bin forever.

A binned project is excluded from every count and query. `matches()` compares
trashed-ness in _both_ directions, so nothing leaks either way, and `reconcile`
never marks a binned project missing even though the scan cannot see it.

Deleting a folder never deletes its contents — they are lifted to the parent.
Dissolving a volume frees its tracks. Dropping a release leaves its folder.

**Colour is stored verbatim.** `clampToPalette` — which folded custom hues into
the world's crimson-to-gold band — was **removed** on the operator's
instruction. The 15 presets remain, but a hand-picked colour is stored exactly
as chosen, including a green. The brief still governs the chrome; this licence
covers operator-assigned tile colours only. See `isHexColour` in
`stacks.constants.ts`. **Do not reinstate the clamp.**

**Six lenses:** STACKS, UNFILED, VOLUMES, RELEASES, ALL, BIN. `unfiled` replaced
a `loose` lens that selected projects belonging to no _volume_ — redundant,
because the category chips already express "everything that is not an album
track", whereas "not on a shelf" cannot be expressed any other way and is the
question actually asked.

**The layout is a source and a destination, side by side.** Panel 01 is the
browser (`.browserCell`, four columns wide and two rows tall); panels 02
UNORGANISED and 03 INDEXING stack beside it. That arrangement fixes a real
failure: the unfiled projects used to be listed in the register _underneath_ the
folder tiles, so opening a genre to drag something into it re-filtered that
register to "what is already in this genre" — nothing — and the list being
dragged from disappeared. UNORGANISED now runs its own query and ignores the
lens, the open folder and every filter. The browser draws no register at the
root of the tree, because "filed here" at the root means "filed nowhere", which
is what UNORGANISED already shows.

**ICONS is the default view, and in STACKS it is one grid.** `PROJECT_VIEW_MODES`
is `list | grid | board`; `grid` is labelled ICONS. In the STACKS lens it draws
folders _and_ projects into a single `TileGrid`, the way a file browser draws a
directory — projects are objects you open, not rows you scan. The register below
the tiles is then suppressed, because it would be the same shelf drawn twice.
LIST and BOARD keep the folder tiles on top (they are navigation) and render the
projects beneath in the ledger or the kanban.

**Projects join that grid only _inside_ a folder.** At the root, "filed here"
resolves to "filed nowhere", so including them turned the top of the archive
into a wall of every unsorted project on disk. The root shows what has been
organised, and nothing else.

ICONS means the same tile in every lens. A separate cover-art card view
(`ProjectGridView`) was deleted: it read as a different kind of object from the
STACKS tiles, and for the unsorted sets this department mostly holds it drew a
grid of empty frames. `Tile.coverPath` now shows artwork _when a project has
any_ and falls back to the mark when it does not, so one component covers both
without promising art that is not there. `Artwork.tsx` went with it.

The project mark is a document with arrangement bars, deliberately _not_ a copy
of Ableton's own file icon: it marks the operator's project, and the app draws
nobody else's trademark.

**The open shelf is itself a drop target.** Tiles accept drops, but a folder
just created has no sub-folders in it, so there was nothing to aim at and the
whole panel rejected the drag. The `.browser` element handles the drop and files
into the folder currently open. `TileGrid` and `FolderTrail` both call
`stopPropagation` in their drop handlers — without it a tile drop would bubble
and file the same project twice, racing two moves of one directory.

**The scan cache is load-bearing.** The directory walk always runs in full, so
additions, deletions and moves are exact; a set whose mtime _and_ size are
unchanged is served from its stored analysis instead of being decompressed. On
the development library that is ~30 ms versus ~1.4 s. `force` re-reads
everything, for when the reader itself has changed.

## 11. TELEMETRY specifics (reference implementation)

Sampling is **reference-counted**: `telemetry:subscribe` / `telemetry:unsubscribe`,
driven by `useTelemetry()`'s mount/unmount. Nothing samples while the page is
closed — important because the GPU and disk probes spawn PowerShell.

Cadence: CPU/memory every **1 s**; GPU every 3rd tick; storage every 15th.
History window: 120 samples (2 minutes). In-flight guards prevent overlapping
probes.

- **CPU** — `os.cpus()` **deltas** (the raw values are cumulative tick counters,
  so a single read tells you nothing). First tick sets a baseline.
- **Memory** — `os.totalmem/freemem` plus `app.getAppMetrics()` working set.
- **GPU** — see below.
- **Storage** — `Win32_LogicalDisk` via PowerShell. Note a single disk
  deserialises as a **bare object, not an array**; `toArray()` handles it (and
  this is the actual case on the dev machine).

### GPU — two hard-won lessons

**1. Enumerate from WMI, not Chromium.** `app.getGPUInfo()` reports the adapter
Chromium is _rendering with_, so on a hybrid laptop it lists one GPU and hides
the other. `Win32_VideoController` is authoritative. Chromium's info is used only
to flag which adapter is active.

**2. GPU counters are per engine AND per process.** The correct aggregate is: sum
each engine type across processes, then take the **busiest engine type** — what
Task Manager reports. Naively summing every instance over-reports badly:
measured 35.7% when the busiest engine was 9.4%.

Per-adapter utilisation has no generic source (counter LUIDs can't be mapped to
adapter names), so vendor tooling is used where it exists — `nvidia-smi` for
NVIDIA, giving real load, VRAM and temperature. Non-NVIDIA adapters show
identity only, with the UI stating _"per-adapter load not reported by this
vendor"_ rather than a fabricated zero. A `usageSource` field travels with each
reading.

Also: **WMI `AdapterRAM` is a 32-bit field and caps near 4 GB** — an 8 GB card
reports 4 GB. Prefer the vendor figure.

The headline Graphics tile is labelled **System-wide** because the counter
figure spans all adapters.

---

## 12. Security posture

- `contextIsolation: true`, `nodeIntegration: false`, `webviewTag: false`. The
  preload throws if context isolation is ever disabled.
- Strict CSP in `src/renderer/index.html`; no remote scripts, styles or fonts.
  `'unsafe-inline'` for `style-src` only, required by the animation libraries.
- `shell:open-external` enforces an **allowlist** of `https:`/`http:`/`mailto:`
  so a compromised renderer can't launch arbitrary handlers.
- `will-navigate` blocks in-app navigation away from the app origin; window-open
  requests go to the OS browser.
- Zip extraction sanitises entry paths (zip-slip).
- The archive daemon is loopback-only.
- Stack traces are only serialized across IPC in development.

---

## 13. Typography

Windows 11 system faces — no webfonts, so nothing is fetched at runtime:

```
--ch-font-display: 'Bahnschrift', 'Segoe UI Variable Display', 'Segoe UI', system-ui
--ch-font-body:    'Segoe UI Variable Text', 'Segoe UI', system-ui
--ch-font-mono:    'Cascadia Mono', 'Consolas', ui-monospace
```

Display face is used uppercase with wide tracking. Note the pattern: wide
`letter-spacing` pushes text right, so centred headings get a matching
`text-indent` to re-centre.

---

## 14. Known gaps / open items

- **`publish.url` in `electron-builder.yml` is a placeholder.** Auto-update
  needs a real feed before the first release. The installer should also be code
  signed or SmartScreen will warn on every download.
- **Intel integrated GPU load is not reported.** Would need a native DXGI/PDH
  addon to map counter LUIDs to adapters, or Intel's `igcl`.
- **No tests.** No test runner is configured. Verification so far has been
  typecheck + lint + build + running the app and probing services directly.
- **three.js not installed.** Reintroduce when the user asks.
- **Renderer bundle ~1.35 MB** across four chunks (`vendor-react`,
  `vendor-motion`, `vendor-data`, app). Vendor chunks are split so
  electron-updater ships smaller deltas.
- Settings has no push channel; if a non-renderer writer ever appears, §6.4's
  local-first model needs revisiting.

---

## 15. Working style the user expects

- Industrial, scalable, intricate, intuitive. Comments explain **why**, not what
  — especially where a non-obvious choice was made.
- The user gives direct visual feedback and iterates fast. Expect notes like
  "the shadow looks lame" or "make it pop" — act on them, don't defend.
- They notice real bugs. Several were found by them (grain slider reset,
  single GPU) and several by verification (hardcoded `source: 'user-data'`,
  the GPU over-report). **Verify claims against the running system rather than
  asserting them.**
- Don't steal window focus with screenshots while they're at the keyboard;
  verify services by probing them directly instead.
- Prefer honest empty/unavailable states over fabricated values.

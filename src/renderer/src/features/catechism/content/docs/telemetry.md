# TELEMETRY

Host vitals: processor, memory, graphics and storage, and the console's own
share of them. Every figure is sampled in the main process rather than
estimated in the console, and only while this page is open.

![telemetry-01-vitals.png](telemetry-01-vitals.png)

`Ctrl`+`Shift`+`T` opens it from anywhere, and `F1` opens its quick guide.

## The panels

The three vitals across the top each carry a status word, the current reading in
large figures, a line saying what it is of, and a sparkline of where it has
recently been. The sparkline is the useful part: a processor at 60% means
nothing without knowing whether it is climbing or settling.

| Panel             | Reports                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| **Processor**     | Total utilisation across every logical core, with the processor's name                                     |
| **Memory**        | In use against installed                                                                                   |
| **Graphics**      | The busiest graphics engine across every adapter, system-wide, as Task Manager counts it                   |
| **Per-core load** | One bar per logical core                                                                                   |
| **Application**   | Candy Haven itself: its processes, uptime, its share of the whole machine's CPU, and its memory            |
| **Adapters**      | Each graphics adapter: its load, video memory, temperature, vendor and driver                              |
| **Storage**       | Free space on each local disk; the one holding the archive is marked **ARCHIVE**                           |
| **Host**          | The machine's name, its platform and release, its uptime, the processor's clock speed, and the sample rate |

### The status words

| Word         | When                                  |
| ------------ | ------------------------------------- |
| **NOMINAL**  | Below 75%                             |
| **ELEVATED** | 75% or more                           |
| **CRITICAL** | 90% or more. The figure turns crimson |

A local disk at 90% full or more turns its storage meter crimson too.

### The sparklines

Each holds the last two minutes, on a fixed axis from 0 to 100% with faint
lines at the half and the top, so a flat line means flat and not rescaled.
Hover anywhere along one for the value then, and how many seconds ago. A
sparkline says **Awaiting samples** until it has two.

## How often it samples

| Figure                                            | Every      |
| ------------------------------------------------- | ---------- |
| Processor, memory, per-core, Application and Host | Second     |
| Graphics and the adapters                         | 3 seconds  |
| Storage                                           | 15 seconds |

The status dot in the masthead says **SAMPLING 1S** once readings arrive, and
**INITIALISING** before the first.

Sampling runs only while TELEMETRY is open, and stops a moment after you leave:
reading the graphics counters and the disks starts small processes in the
background, and there is no reason to pay for them on a page nobody is looking
at. The history is kept, so coming back shows the last two minutes at once and
carries on from there.

## How to read a slowdown

1. Look at **Processor** and **Per-core load** together. A high total with even
   bars is a busy machine; one tall bar is a single stuck thread.
2. Check **Memory**. A climbing sparkline that never settles is something
   holding on to memory.
3. Look at **Application** to see how much of it is Candy Haven's own. Its CPU
   share is of the whole machine, so `0.5%` is half a percent of every core
   together.
4. During a stream, watch **Graphics**: the overlays and the visualiser draw on
   the graphics card.

## Unavailable is not zero

A figure the platform genuinely cannot report is drawn as `—` rather than as
`0`.

GPU utilisation is the usual case: without performance counters, Windows does
not expose it, and a console that drew `0%` there would be stating something it
does not know. **Graphics** then says _GPU performance counters are not
available on this system_, and **Adapters** still lists each card with what it
can report.

Per-adapter load, video memory in use and temperature come from NVIDIA's own
tool, so only NVIDIA cards report them. Other cards show their total video
memory, `n/r` for load, and `—` for temperature, and the row says _per-adapter
load not reported by this vendor_. The card Candy Haven itself draws on is
marked **RENDERING**.

> On a first visit the graphics counters take a few seconds to answer, so
> Graphics and Adapters can read as unavailable for a moment before their first
> readings arrive.

## Per-core

![telemetry-02-cores.png](telemetry-02-cores.png)

The strip draws one bar per logical core. It answers a question the total cannot:
whether load is spread across the machine or pinned to one core, which is the
difference between a busy system and a stuck thread. Hover a bar for its core
and its figure.

The bars are gold at every height, in four steps: per-core load is a shape to
read, not an alarm.

## Storage and Host

Storage lists the local fixed disks: removable, network and optical drives are
left out. Each shows its free space, and the disk holding the archive's data is
marked **ARCHIVE**, since that is the one whose filling up matters most.

Host's **Uptime** is how long Windows has been running, and **Clock** is the
processor's clock speed, not the time of day. Both uptimes on this page are in
minutes and seconds.

> Meters here animate on a near-linear curve rather than the console's usual
> expo-out. Instrument output should read as measurement, not as choreography.

# TELEMETRY

Host vitals: processor, memory, graphics and storage, and the console's own
share of them. Every figure is sampled live in the main process rather than
estimated in the console.

![telemetry-01-vitals.png](telemetry-01-vitals.png)

## The panels

The three vitals across the top each carry a current reading, a meter, and a
sparkline of where it has recently been. The sparkline is the useful part: a
processor at 60% means nothing without knowing whether it is climbing or
settling.

| Panel             | Reports                                                              |
| ----------------- | -------------------------------------------------------------------- |
| **Processor**     | Total utilisation                                                    |
| **Memory**        | In use against installed                                             |
| **Graphics**      | The busiest graphics engine across every adapter, system-wide        |
| **Per-core load** | One bar per logical core                                             |
| **Application**   | Candy Haven itself: its processes, uptime, CPU share and memory      |
| **Adapters**      | Each graphics adapter: its load, memory, temperature, vendor, driver |
| **Storage**       | Free space on each volume; the one holding the archive is marked     |
| **Host**          | The machine, its platform and release, its uptime and clock          |

A volume past 90% full turns its meter crimson.

## How to read a slowdown

1. Look at **Processor** and **Per-core load** together. A high total with even
   bars is a busy machine; one tall bar is a single stuck thread.
2. Check **Memory**. A climbing sparkline that never settles is something
   holding on to memory.
3. Look at **Application** to see how much of it is Candy Haven's own.
4. During a stream, watch **Graphics**: the overlays and the visualiser draw on
   the graphics card.

## Unavailable is not zero

A metric the platform genuinely cannot report renders as **unavailable** rather
than as `0`.

GPU utilisation is the usual case: without performance counters, Windows does
not expose it, and a console that drew `0%` there would be stating something it
does not know. **Graphics** then says so, and **Adapters** still lists each card
with what it can report; a load that is not reported reads `n/r`. An absent
reading must never be mistaken for an idle one.

## Per-core

![telemetry-02-cores.png](telemetry-02-cores.png)

The strip draws one bar per logical core. It answers a question the total cannot:
whether load is spread across the machine or pinned to one core, which is the
difference between a busy system and a stuck thread.

> Meters here animate on a near-linear curve rather than the console's usual
> expo-out. Instrument output should read as measurement, not as choreography.

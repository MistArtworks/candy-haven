# TELEMETRY

Host vitals: processor, memory, graphics and storage. Every figure is sampled
live in the main process rather than estimated in the console.

![telemetry-01-vitals.png](telemetry-01-vitals.png)

## The tiles

Each vital carries a current reading, a meter, and a sparkline of where it has
recently been. The sparkline is the useful part — a processor at 60% means
nothing without knowing whether it is climbing or settling.

| Vital         | Reports                                                |
| ------------- | ------------------------------------------------------ |
| **Processor** | Total utilisation, and per-core on the strip below     |
| **Memory**    | In use against installed                               |
| **Graphics**  | Adapter, and utilisation where the platform reports it |
| **Storage**   | Free against total, for the volume the archive is on   |

## Unavailable is not zero

A metric the platform genuinely cannot report renders as **unavailable** rather
than as `0`.

GPU utilisation is the usual case: without performance counters, Windows does
not expose it, and a console that drew `0%` there would be stating something it
does not know. An absent reading must never be mistaken for an idle one.

```
GRAPHICS
  Adapter        NVIDIA GeForce RTX 4070
  Utilisation    UNAVAILABLE      <- not measured, not idle
  Memory         3.1 / 12.0 GB
```

## Per-core

![telemetry-02-cores.png](telemetry-02-cores.png)

The strip draws one bar per logical core. It answers a question the total cannot:
whether load is spread across the machine or pinned to one core — which is the
difference between a busy system and a stuck thread.

> Meters here animate on a near-linear curve rather than the console's usual
> expo-out. Instrument output should read as measurement, not as choreography.

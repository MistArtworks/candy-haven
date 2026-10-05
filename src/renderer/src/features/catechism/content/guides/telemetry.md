# TELEMETRY

## Host vitals

![telemetry-01-vitals.png](telemetry-01-vitals.png)

Processor, memory, graphics and storage, sampled every second in the main
process while this page is open. Each vital carries a status word, the reading,
and a sparkline of the last two minutes.

**NOMINAL** below 75%, **ELEVATED** from 75%, **CRITICAL** from 90%, when the
figure turns crimson. A disk 90% full turns crimson too.

## Per-core

![telemetry-02-cores.png](telemetry-02-cores.png)

One bar per logical core. A high total with even bars is a busy machine; one
tall bar is a single stuck thread.

## Unavailable is not zero

A figure the platform can't report is drawn as `—`, never as `0`. GPU load
without performance counters is the usual case, and per-adapter load,
temperature and video memory in use are reported for NVIDIA cards only.

`Ctrl`+`Shift`+`T` opens TELEMETRY from anywhere.

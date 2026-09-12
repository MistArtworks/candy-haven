# TELEMETRY

## Host vitals

![telemetry-01-vitals.png](telemetry-01-vitals.png)

Every figure is sampled live in the main process — processor, memory, graphics
and storage. The tiles carry the current reading and a sparkline of where it has
been.

## Unavailable is not zero

A metric the platform genuinely cannot report renders as **unavailable** rather
than as `0`. GPU utilisation without performance counters is the usual case.

That distinction is worth knowing: an absent reading should never be mistaken
for an idle one, and this department will not draw a flat line it cannot
actually measure.

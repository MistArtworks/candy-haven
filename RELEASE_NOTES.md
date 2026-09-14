A fix for the pointer disappearing, and the missing DARKROOM chapter.

## The pointer comes back

1.11.0 shipped THE RETICLE turned **on** by default. It hid the system cursor and, on a good number of machines, drew nothing in its place — which left no pointer at all, including no pointer to reach the setting that turns it off.

It is now **off by default**. If you are on 1.11.0 and have lost your cursor, it comes back on update; you can also reach REGULATION with `Ctrl` `,` from the keyboard and set **PRESENTATION → Pointer** to `NATIVE`.

The instrument itself is unchanged and still there to turn on. It should not have shipped switched on before it was finished, and it will stay opt-in until it reliably draws.

## DARKROOM has a chapter

The department shipped in 1.8.0 with no documentation at all. CATECHISM now carries a full chapter: the plate, the tone stage, the curve, the ramp, why the default ramp is the console's own palette ladder, and why the whole grade is a 768-byte lookup table rather than work done per pixel.

## Also documented

**THE RETICLE** in REGULATION → PRESENTATION, including what the mark does over each kind of control and why the title bar keeps the system arrow.

**The countdown sound** in OBSERVATORY: the ticking clock, the separate arrival sounds, and the note that CONVENING ships with its cues off.

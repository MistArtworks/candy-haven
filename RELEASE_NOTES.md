THE RETICLE draws, and is on by default again.

## The pointer that was never there

1.11.0 shipped THE RETICLE on by default. It hid the system cursor and drew nothing in its place, which left no pointer at all. 1.11.1 turned it off so you had an arrow again, and said it would stay opt-in until it reliably drew.

The cause was not the default. The mark decides what to draw by reading the cursor the interface already asks for — `pointer` over a button, `not-allowed` over a disabled one, `text` over a line of prose. That is what lets it cover every control in the console without a single one being annotated for it, and it is the best idea in the feature.

But the same stylesheet writes `none` over every one of those cursors, because that is how the system arrow gets hidden in the first place. So the mark read "no cursor here" across the entire interface and stood itself down, everywhere. Both halves were working exactly as written; they simply cancelled each other out.

It now reads the interface's own cursors with that mask lifted off one element at a time, for the length of a single measurement. Nothing is annotated, and nothing flickers.

## What you get

The arrow is hidden and the instrument is drawn in its place: a ring with cardinal ticks that leans into its direction of travel, corner brackets that close around a button, a caret over a line of text, a strike through anything disabled, a gapped crosshair where an exact point is wanted, and one crimson stamp on a click.

The focal dot at the centre sits exactly where Windows says the pointer is, with no spring on it at all. Only the ring lags, and the lag is the point.

## If you are updating from 1.11.1

**The `NATIVE` setting is stored, and a stored setting still wins.** If you switched Pointer to `NATIVE` to get your cursor back, you will need to switch it to `RETICLE` to see any of this. A fresh install comes up with it on.

To turn it off: `Ctrl` `,` opens REGULATION from anywhere, then PRESENTATION → Pointer → `NATIVE`. Setting Motion to `off` hands the arrow back too, since the instrument is entirely movement.

The title bar keeps the system cursor whatever you set. The window drag region swallows mouse events before the console ever sees them, so there is nothing there to draw from.

## Also

CATECHISM's REGULATION chapter is corrected: the reticle is documented as on by default, with a line on why it went off and what brought it back.

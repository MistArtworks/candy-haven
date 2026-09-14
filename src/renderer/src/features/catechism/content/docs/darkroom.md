# DARKROOM

Grade photographs onto the console's own palette, and export them.

It exists because the rest of this application is built on five materials and
one saturated colour, and a photograph dropped into that world arrives speaking
a different language. DARKROOM is where a likeness is developed before it is
shown.

## The plate

Open a photograph and it fills the plate, graded live at full resolution. There
is no proxy and no preview quality setting, because there is nothing to trade:
dragging a control does not touch a pixel until the next frame is drawn.

That is not an optimisation, it falls out of what a grade actually is. Exposure,
contrast, levels, gamma and the curve all act on **luminance alone** — they are
a 256-step map. The gradient ramp turns luminance into colour, which is another
256-step map. Composed, the entire treatment is a single table of 768 bytes, and
moving a slider rebuilds it in 256 steps whatever the size of the image.

## TONE

The luminance stage, applied in this order.

| Control         | Range     | What it does                                          |
| --------------- | --------- | ----------------------------------------------------- |
| **Exposure**    | −3 … +3   | Stops. It multiplies light, so each step is a doubling |
| **Contrast**    | −100 … +100 | Pivots on mid grey                                  |
| **Black point** | 0 … 1     | Luminance at or below this becomes black              |
| **White point** | 0 … 1     | Luminance at or above this becomes white              |
| **Gamma**       | 0.1 … 4   | The midtones. Above 1 lifts them, below 1 crushes them |

## CURVE

A freeform tone curve, applied last in the luminance stage — after everything in
TONE and before any colour is chosen. Both axes run 0 to 1, input against
output.

## RAMP

Where luminance becomes colour. The ramp is a list of stops, each a colour and a
position along the scale from black to white, and every pixel takes the colour
its brightness lands on.

Two controls sit with it:

- **Amount** — how much of the mapped result to keep against the original. At 1
  the photograph is entirely in the ramp's colours; below that the original
  shows through.
- **Saturation** — applied after the map, so it acts on the graded colour rather
  than on what the photograph arrived with.

### The default ramp is the console's own ladder

It is not an invention. The two photographs in this manual — the altar and the
vault — were graded by hand outside this repository, and the shipped ramp was
recovered from them: obsidian through the crimsons, into the brasses and golds,
out at alabaster. The values are the theme's own, verbatim.

So a photograph graded on the defaults lands in the same palette as everything
else the console draws, and the rest of the ramp is yours to move.

## Exporting

The graded image is written out at full resolution, through the same arithmetic
the plate is drawn with. There is no second code path and no "export quality" —
what you are looking at is what is written.

## Why it is head-less underneath

Nothing in the grade imports React or the DOM. The same functions build the
preview, build the export, and can be run against the reference photographs to
prove the shipped preset really is the treatment those images received. A
department whose whole job is a colour claim should be able to demonstrate the
claim.

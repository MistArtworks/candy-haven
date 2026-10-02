# DARKROOM

Grade photographs onto the console's own palette, and export them.

![darkroom-01-plate.png](darkroom-01-plate.png)

It exists because the rest of this application is built on five materials and
one saturated colour, and a photograph dropped into that world arrives speaking
a different language. DARKROOM is where a likeness is developed before it is
shown.

## How to grade a photograph

1. Press **Open image**, or drop a photograph onto the plate. It lands on the
   console ramp straight away; everything after that is adjustment.
2. In **TONE**, work from the top: exposure first, then the black and white
   points, gamma and contrast. Double-click a control to put that one back;
   **Rest** puts the whole panel back.
3. Shape the **CURVE** if the tones need more than that.
4. Move the **RAMP** if the colours should land differently.
5. Hold the pointer down on the plate to see the original, and let go to see
   the grade again.
6. Press **Export** and choose where to save it. **Reset grade** starts again
   from the defaults.

## The plate

Open a photograph and it fills the plate, graded live at full resolution. There
is no proxy and no preview quality setting, because there is nothing to trade:
dragging a control does not touch a pixel until the next frame is drawn.

That is not an optimisation, it falls out of what a grade actually is. Exposure,
contrast, levels, gamma and the curve all act on **luminance alone** — they are
a 256-step map. The gradient ramp turns luminance into colour, which is another
256-step map. Composed, the entire treatment is a single table of 768 bytes, and
moving a slider rebuilds it in 256 steps whatever the size of the image.

Beneath the plate: the file's name, its size in pixels, and the reminder that
holding the pointer down compares.

## TONE

The luminance stage, top to bottom in the order it is applied.

| Control         | Range       | What it does                                           |
| --------------- | ----------- | ------------------------------------------------------ |
| **Exposure**    | −3 … +3 EV  | Stops. It multiplies light, so each step is a doubling |
| **Black point** | 0 … 100%    | Luminance at or below this becomes black               |
| **White point** | 0 … 100%    | Luminance at or above this becomes white               |
| **Gamma**       | 0.1 … 4     | The midtones. Above 1 lifts them, below 1 crushes them |
| **Contrast**    | −100 … +100 | Pivots on mid grey                                     |

The order is the conventional one, and the panel is drawn in it so you can see
why a control did what it did: exposure acts on light, so it goes first; the
black and white points then decide what counts as black and white; gamma
reshapes what is left between them; contrast pivots on mid grey; and the curve
has the last word.

Beneath them sit **Saturation** and **Amount**, which act on the colour stage
rather than on luminance. See RAMP.

## CURVE

A freeform tone curve, applied last in the luminance stage — after everything in
TONE and before any colour is chosen. Both axes run 0 to 1, input against
output, drawn over the photograph's own histogram, so the straight diagonal is
no change at all.

- Click the line to add a point, and drag it to shape the curve.
- Drag a point off the square to remove it. The two ends stay, because they
  anchor black and white.
- **Straighten** puts the line back.

## RAMP

![darkroom-02-ramp.png](darkroom-02-ramp.png)

Where luminance becomes colour. The ramp is a list of stops, each a colour and a
position along the scale from black to white, and every pixel takes the colour
its brightness lands on. Shadows are on the left, highlights on the right.

1. Click the bar to add a stop. It is born the colour the ramp already is at
   that point, so nothing changes until you move it.
2. Drag it along the bar.
3. Pick its colour from the palette beneath: the console's own colours, and
   only those.
4. **Remove** takes the selected stop off; a ramp keeps at least two.
   **Console ramp** puts the default back.

Two controls in TONE act on this stage:

- **Amount** — how much of the mapped result to keep against the original. At
  100% the photograph is entirely in the ramp's colours; below that the
  original shows through.
- **Saturation** — applied after the map, so it acts on the graded colour rather
  than on what the photograph arrived with. 100% leaves it alone.

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

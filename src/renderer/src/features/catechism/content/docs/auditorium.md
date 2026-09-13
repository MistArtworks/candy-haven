# AUDITORIUM

The listening room. One file at a time, played and rendered visible.

![auditorium-01-stage.png](auditorium-01-stage.png)

There is no library here on purpose. The ARCHIVE catalogues your audio, and a
second register of the same material would immediately disagree with it. This
department answers one question, which is what a file sounds like.

## Admitting a file

Three ways in:

1. **Admit a file** in the masthead, which browses.
2. Drag a file onto the stage.
3. From a project's dossier in the ARCHIVE — its files open here.

Supported formats are whatever Chromium decodes: `wav`, `aiff`, `flac`, `mp3`,
`m4a`, `ogg`, `opus` and friends.

The status in the masthead reads `NO FILE`, `HELD` when something is loaded but
paused, and `SOUNDING` while it plays.

## The four presets

![auditorium-02-presets.png](auditorium-02-presets.png)

Four renderings of the same signal. They are presentations rather than analyses
— pick whichever tells you what you are listening for.

### WAVEFORM — the whole file, end to end

Two readings stacked, at two scales.

The **band** across the top is the window: the envelope of a few seconds of
file, peak amplitude per column, drawn as the signal actually is rather than
mirrored from one number. The played side is at weight and the coming side held
back, so where you are and what is about to happen are one reading.

The **strip** along the bottom is the whole file at a glance, with a lit box
showing which part of it the band above is looking at. It is the only thing in
the room that says where the window is in the file, which is the one thing a
zoomed render cannot tell you about itself.

Both are coloured by **frequency content** — crimson where the low end is
carrying, gold where it is not — so a drop and a breakdown are different colours
and the arrangement is legible without playing it.

**Scroll over the render to zoom**, or `Ctrl` with the up and down arrows. The
span is continuous: wind it in to a third of a second and you are looking at one
hit, wind it out and it stops at the whole file with the playhead travelling
across it.

Press anywhere on either to move the playhead — on the band you are pointing at
the window, on the strip at the whole file — and drag to scrub.

This is the only preset that has to decode the whole file first, which is why it
is the one that takes a moment on a long track.

### SPECTRUM — frequency content, as it passes

Frequency domain on a **logarithmic axis**, so an octave occupies the same width
wherever it falls — bass on the left, air on the right.

The filled body is the smoothed reading and the line above it the instantaneous
one. **Where the two part is a transient.** That is the reading to watch for
when you are checking whether a snare is cutting through.

### SPECTRAL — frequency against time, scrolling

A spectrogram. Each column is one moment of the spectrum, low frequencies at the
bottom, brightness standing for level — so the last half-minute of the mix is
legible at once and a stack of harmonics reads as a stack.

Built from playback rather than from a survey, so it fills as the file runs.
Good for hearing out resonances, noise and mastering artefacts.

### STATIC — the mark alone

No analysis. The mark holds and breathes on its own clock, lit by the transport
but not driven by it.

For when the console is on a second screen and the movement is a distraction.

## The transport

| Control      | Does                                        |
| ------------ | ------------------------------------------- |
| Play / pause | `Space` also works                          |
| Seek         | Press anywhere on the stage, and drag       |
| Level        | The output level for this room only         |
| `SPAN`       | Where the zoom has got to. Click to fit all |

![auditorium-03-zoom.png](auditorium-03-zoom.png)

**Zoom by scrolling over the render.** There used to be five fixed steps here —
four, eight, sixteen and thirty seconds, and ALL — and they were replaced rather
than added to, because the step you want is always between two of the ones on
offer. `SPAN` reports where the wheel has got to and takes a click to fit the
whole file, and another to come back.

Winding the span in reads the file at **higher resolution** rather than
stretching what is already drawn, so a transient inspected closely is really the
transient rather than an interpolation of one.

## The file's particulars

Drawn plain around the stage, because the stage is the single focal object this
view is allowed:

`FORMAT` · `LENGTH` · `SIZE` · `ADMITTED` · `FILED AT` · `POSITION`

## The popout

![auditorium-04-popout.png](auditorium-04-popout.png)

**Pop out** detaches the player into its own window, which can be pinned above
everything else. That is the configuration this department was actually built
for: the room on a second monitor, or floating over a DAW, while you work.

Every window is told which file the room is on, so the mini player in the
console chrome stays in step with the popout and with the page.

> The mini player in the title bar is a sibling of the console shell rather than
> part of any page — what is playing is a property of the installation, not of
> whichever department you happen to be looking at.

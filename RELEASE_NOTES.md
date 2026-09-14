Two new overlays and a set of knobs for every one of them. OBSERVATORY gains a standing frame for the whole broadcast, a stream-starting scene, and — at last — a way to change how any of it is drawn.

## THE GATE

The stream-starting scene: a causeway running to a colossal ribbed portal, a shaft of light standing in its aperture, and the procession still walking toward it. The NEXUS landing field, put to work.

It is the only overlay that **replaces** a capture rather than dressing one — a stream that has not started has nothing behind it to dress — so it is the one source that does not want **Transparent** ticked in OBS.

Down the right runs a band held for a chat capture, and unlike everywhere else in the kit it is **painted rather than left clear**. The scene is what your audience is looking at while they wait, and chat over bare artwork is unreadable. Two colours are yours to pick and the third stop is always transparent, so the band fades out whatever you choose and the causeway still runs out of the frame.

The marque sits beside the band rather than centred, because the portal is the one thing in the composition that has to stay unobstructed.

| Setting                | What it does                                                    |
| ---------------------- | --------------------------------------------------------------- |
| **Title**              | The marque, set low and left                                     |
| **Second line**        | A quieter line beneath it                                        |
| **Band width**         | The share of the frame held for chat. Zero removes it            |
| **Top / lower colour** | The two stops of the band's gradient                             |
| **Band strength**      | How present the band is overall                                  |

## THE ENCLOSURE

A standing frame for the whole broadcast. Gold registration brackets at the four corners, one obsidian plinth along the bottom carrying your marque, and a single crimson pip for when you are live.

Nothing runs along the edges, and that is the design rather than an omission — this is on screen for hours at a stretch, so the frame has to say where the boundary is without spending it. Roughly 96% of the canvas stays unobstructed and the centre is fully transparent, so it dresses a capture rather than replacing one.

The pip is dark until you declare the broadcast live, so the frame carries no colour at all in its resting state. Append `?guides=1` while cutting the scene to outline the inset the brackets sit on; the guide never appears on air.

## Knobs on everything

Every overlay shipped with a tuned layout and no way to touch it. All six now carry the same three controls in their **PRESENTATION** panel.

| Knob          | Range    | What it moves                                        |
| ------------- | -------- | ---------------------------------------------------- |
| **Scale**     | 0.5–2.0× | The whole layout                                     |
| **Type size** | 0.5–2.0× | Text only, on top of scale. Spacing follows the type  |
| **Opacity**   | 10–100%  | The whole surface                                    |

They are multipliers, not measurements. The style or theme you picked decides what the overlay looks like and these nudge it from there — a cranked-up PLATE is still a PLATE — which is why **Reset to preset** returns them to `1.00×` rather than to a remembered value.

Two overlays add one of their own. **NOW TRANSMITTING** gets a **Cover size**, because the artwork and the text compete for the same room in all four styles and making the whole plate bigger is a different request. **THE MUSTER** gets an **Instruction size**, because that line is the only thing on the broadcast written for the audience rather than for you.

Opacity composes with whatever an overlay already does of its own accord: NOW TRANSMITTING still fades out between tracks, at your level rather than instead of it.

Everything defaults to `1.00×`, so a scene you cut before this update renders exactly as it did.

## THE MUSTER tells people how to file

The corner widget never showed the filing instruction at all. A viewer could watch the roll fill and never learn they could add to it.

Both the full scene and the widget now draw it, and they draw it **while resting as well as while a call is open** — somebody arriving between calls is exactly the person who needs the command before the next one opens. The widget's type is larger throughout for the same reason: it is read across a room, not over your shoulder.

## Fixed

- Every canvas overlay restored its transparency to fully opaque partway through drawing a frame. Harmless until opacity became a setting; now the field behind the muster roll, THE CONCORD's casting halo and the selection ring's plates all return to the level you set instead of discarding it.

A stream-starting scene, and knobs for every overlay in the kit. OBSERVATORY gains THE GATE — and, at last, a way to change how any of the broadcast kit is drawn.

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

- THE GATE turned black after switching away from its scene in OBS and back. Resizing a scene clears its canvas, and only the animation loop ever repainted it — but `requestAnimationFrame` does not run while a page is hidden, and OBS stops pumping frames for a scene that is not live, so the canvas was cleared at exactly the moment nothing was going to redraw it. Scenes now repaint when their page comes back.
- Every canvas overlay restored its transparency to fully opaque partway through drawing a frame. Harmless until opacity became a setting; now the field behind the muster roll, THE CONCORD's casting halo and the selection ring's plates all return to the level you set instead of discarding it.

A fix for THE GATE going black in OBS.

## THE GATE stays drawn

Switching away from the scene holding THE GATE and coming back left the source black.

Resizing a scene clears its canvas, and until now only the animation loop ever repainted it. That is safe in the console, where the loop never stops and a cleared canvas refills within milliseconds. A browser source breaks both halves of that: `requestAnimationFrame` does not run while a page is hidden, and OBS composites offscreen and stops pumping frames for a scene that is not live. Coming back resizes the surface — so the canvas was cleared at exactly the moment nothing was going to redraw it.

Scenes now repaint when their page comes back, and again if the graphics context is lost and restored. The repaint happens immediately rather than waiting on the next animation frame, because a stalled animation frame is the fault being recovered from.

Nothing else has changed. If you are coming from 1.9.0, everything in 1.10.0 — THE GATE, the knobs on every overlay, and THE MUSTER's filing instruction — arrives with this.

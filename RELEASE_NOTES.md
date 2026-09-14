A be-right-back screen, the console's own pointer, sound under the countdowns — and a fix for overlay settings that were never being read back.

## Your overlay settings stay put

Every overlay came up at its defaults on each launch, whatever you had configured. The settings were being written the whole time; nothing was ever reading them.

A boot-ordering fault. The archive connects and reconciles its schema early, but is not marked *online* until the last stage of boot — and every overlay restores its stored settings in between. Those reads were waiting for "online", so each one came back empty and each overlay fell back to defaults. Writes afterwards worked, which is why the settings looked absent rather than wrong.

THE CONCORD, RESONANCE SELECTION, THE MUSTER, NOW TRANSMITTING and both countdowns all restore now. CALENDAR was waiting behind the same gate and is fixed with them.

## THE SURVEY

Be right back: a barred spiral seen from above and to one side, turning, with the resonance plexus threaded through the disc.

The same page and the same settings as THE GATE — marque, second line, chat band, gradient and knobs — with a different field behind it. Which one you get is decided by the address, the way the two countdowns share a page and differ by theirs. It starts on **BACK SHORTLY**.

Like the gate it is a scene rather than furniture, so it does not want **Transparent** ticked.

## THE RETICLE

The console draws its own pointer: a survey instrument rather than an arrow. It tracks, acquires a target, and stamps. The geometry is the console's own mark reduced to something legible at 22 pixels.

Seven states, and no component had to be annotated for any of them — the mark reads whatever the interface already says the cursor should be, so everything that exists is covered and so is everything written later.

**REGULATION → PRESENTATION → Pointer** switches between the reticle and the system arrow, and it is reachable from the keyboard. Setting motion to `OFF` hands the arrow back too; the instrument is entirely movement.

## Sound under the countdowns

A clock ticks beneath both timers while they run, and each one arrives at something of its own: a bass figure when INTERVAL runs out, a granular impact when CONVENING reaches zero.

**Ticking clock** is its own setting, separate from the cues. Turning the chimes off says you do not want interrupting at the one-minute mark; it says nothing about whether a clock should be audible underneath.

One caveat worth knowing: CONVENING ships with **Audio cues** off, because nothing should warn an audience it is nearly time. The impact needs that setting on.

## Fixed

- Overlay settings were never restored on launch. See above.
- Every canvas overlay restored its transparency to fully opaque partway through drawing a frame. Harmless until opacity became a setting.

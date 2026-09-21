/**
 * Whether this window was opened past the boot screen.
 *
 * Set by the main process when THE VESTIBULE hands over to the console after a
 * boot that already succeeded. The sequence is finished and its log scrolled
 * past in the vestibule's status rail, so replaying the cinematic and asking
 * the operator to click "Enter console" would be asking them to acknowledge
 * something they watched a second ago.
 *
 * Read from `location.search` at module scope, like `readPopoutIntent`, and for
 * the same reason: the console routes with `HashRouter`, so anything after the
 * `#` belongs to the router and is not readable until React has mounted. This
 * decides the shell's *initial* phase, which is a value the store needs before
 * the first render — seeding it in an effect instead would paint one frame of
 * boot screen and then tear it down, which reads as a flash.
 *
 * A failed or still-running boot withholds the flag, so the console lands on
 * the boot screen with its readout and its retry exactly as it always has. See
 * main/app/window-manager.ts.
 */
export function enteredFromVestibule(): boolean {
  return new URLSearchParams(window.location.search).get('entered') === '1'
}

/**
 * The frame zoom THE VESTIBULE was built around.
 *
 * That window is laid out to the pixel against a fixed, unresizable frame, so
 * it cannot apply the stored interface scale the way every other window does —
 * at 1.25 the composition overflowed the frame and `overflow: hidden` took the
 * bottom door off. The main process sizes the frame to the operator's scale,
 * capped at what the display holds, and passes the scale it settled on here.
 *
 * Read from `location.search` at module scope for the same reason as
 * `enteredFromVestibule`, and defaulted to 1 so a document opened without the
 * parameter — a reload from devtools, say — still draws at a sane size.
 */
export function fittedScale(): number {
  const raw = Number(new URLSearchParams(window.location.search).get('scale'))
  return Number.isFinite(raw) && raw > 0 ? raw : 1
}

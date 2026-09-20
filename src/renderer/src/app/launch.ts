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

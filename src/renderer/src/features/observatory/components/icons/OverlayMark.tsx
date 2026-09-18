import type { ReactNode } from 'react'

/**
 * One mark per overlay in the broadcast kit.
 *
 * ## Why the kit gets marks at all
 *
 * The board asks an operator to tell eleven overlays apart at a glance, and
 * their names deliberately do not help: `THE MUSTER`, `THE CONCORD` and
 * `THE DOCKET` are in-world titles that say nothing about shape. A drawn mark
 * says *numbered list*, *turning ring*, *bar tally*, *corner brackets* before
 * any label is read, which is half the answer to "what does this do" arriving
 * for free. It is also the half that survives peripheral vision mid-broadcast.
 *
 * ## The family rule
 *
 * A third family beside `ArchiveIcon` (64×48 tiles) and `ArchiveGlyph` (16×16
 * inline marks), and the split is the same arithmetic one recorded there:
 * these sit at 20–24px in a board row, so they are drawn on a **24×24 field**
 * where a 1.5 nominal stroke lands near a full device pixel.
 *
 * Everything else is shared with both, because the brief governs all three:
 * **square corners**, structure expressed as ribbing or repetition, **one
 * solid element carrying the emphasis**, and colour taken entirely from
 * `currentColor` so a mark inherits whatever text sits beside it. That last
 * point is what keeps this from introducing a sixth colour — there is no fill
 * or stroke literal anywhere below.
 *
 * No icon set is imported, for the reason `ArchiveIcon` records: every set on
 * offer is drawn with rounded corners, and one soft object would be the only
 * thing on the page the eye caught.
 *
 * Circles and ellipses are permitted here where they are not in the ARCHIVE
 * families, because three of these overlays *are* round objects — a ring that
 * turns, a record that spins, a galaxy seen at an angle. Drawing a turning ring
 * as a square would be a worse breach of the brief than drawing a curve: the
 * rule is about corners on built structure, and the reference boards are full
 * of concentric rings and suspended spheres.
 */
export type OverlayMarkName =
  | 'muster'
  | 'selection'
  | 'concord'
  | 'transmission'
  | 'interval'
  | 'convene'
  | 'enclosure'
  | 'gate'
  | 'survey'
  | 'chorus'
  | 'docket'

export interface OverlayMarkProps {
  name: OverlayMarkName
  className?: string
}

export function OverlayMark({ name, className }: OverlayMarkProps): ReactNode {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      focusable="false"
    >
      {renderMark(name)}
    </svg>
  )
}

function renderMark(name: OverlayMarkName): ReactNode {
  switch (name) {
    case 'muster':
      /*
       * A framed roll: three credited rows inside a border.
       *
       * The frame is what separates this from THE CHORUS below, which draws
       * the same rows against a bare left rule. The distinction is real rather
       * than decorative — a muster is a *bounded* list that fills to a ceiling
       * and closes, and a chat feed is an unbounded one that scrolls. At 24px
       * the presence or absence of an enclosure is the only silhouette
       * difference available to say that.
       */
      return (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" />
          <rect x="6.5" y="7" width="2.5" height="2.5" fill="currentColor" stroke="none" />
          <path d="M11 8.25h6.5" />
          <rect x="6.5" y="11.75" width="2.5" height="2.5" />
          <path d="M11 13h6.5" />
          <rect x="6.5" y="16.5" width="2.5" height="2.5" />
          <path d="M11 17.75h4" />
        </>
      )

    case 'selection':
      /*
       * A graduated ring under a fixed pointer.
       *
       * The pointer is the solid element, and it is the load-bearing half of
       * the drawing: a bare ring reads as a dial or a loading state, while a
       * ring with a mark above it reads as a thing that stops somewhere. The
       * four ticks are the field it stops on.
       */
      return (
        <>
          <circle cx="12" cy="13" r="7.25" />
          <circle cx="12" cy="13" r="2.75" />
          <path d="M9.25 1.75h5.5L12 5.75z" fill="currentColor" stroke="none" />
          <path d="M12 5.75v2M12 18.25v2M5.75 13h-2M20.25 13h-2" />
        </>
      )

    case 'concord':
      /*
       * A tally: bars rising from a left axis, the winning one solid.
       *
       * Bars of *unequal* length is what makes it a count rather than a list —
       * three equal rows would be indistinguishable from the muster's roll.
       */
      return (
        <>
          <path d="M4.25 3.5v17" />
          <rect x="4.25" y="5.5" width="10" height="3.25" />
          <rect x="4.25" y="10.5" width="15.5" height="3.25" fill="currentColor" stroke="none" />
          <rect x="4.25" y="15.5" width="6" height="3.25" />
        </>
      )

    case 'transmission':
      /*
       * A record: a disc with a solid spindle and one groove.
       *
       * Concentric like RESONANCE SELECTION above and read differently because
       * of where the solid sits — a filled centre is a spindle, a solid mark
       * outside the ring is a pointer. The groove is the third circle, which
       * is what stops it reading as a target.
       */
      return (
        <>
          <circle cx="12" cy="12" r="8.25" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </>
      )

    case 'interval':
      /*
       * Split plates — the face this countdown actually defaults to.
       *
       * Two engraved digit plates with the hinge line across them, and the
       * spent plate filled. Drawing each clock as its own default face is what
       * tells the two apart on the board, which is the exact confusion the
       * deck's `timerRole` note records: two blocks, both reading `05:00`,
       * both offering Start.
       */
      return (
        <>
          <rect x="2.75" y="6.5" width="8" height="11" />
          <rect x="13.25" y="6.5" width="8" height="11" fill="currentColor" stroke="none" />
          <path d="M2.75 12h8M13.25 12h8" />
        </>
      )

    case 'convene':
      /*
       * Harmonic pulse — CONVENING's own default face.
       *
       * Rings emitted outward from a solid core, drawn as arcs opening to the
       * right so it reads as *emission* rather than as the concentric
       * stillness of the two round marks above.
       */
      return (
        <>
          <circle cx="7" cy="12" r="2" fill="currentColor" stroke="none" />
          <path d="M11.25 7.5a6 6 0 0 1 0 9" />
          <path d="M15 4.75a10 10 0 0 1 0 14.5" />
          <path d="M18.75 2a14 14 0 0 1 0 20" />
        </>
      )

    case 'enclosure':
      /*
       * What it literally is: four registration brackets and one plinth.
       *
       * Nothing along the edges, exactly as the overlay draws it — the mark is
       * a miniature of the frame rather than a symbol for it, which is
       * available here and almost nowhere else in the kit.
       */
      return (
        <>
          <path d="M3.5 8V3.5H8M16 3.5h4.5V8M20.5 14v4.5H16M8 18.5H3.5V14" />
          <rect x="7.5" y="19.5" width="9" height="2.5" fill="currentColor" stroke="none" />
        </>
      )

    case 'gate':
      /*
       * A ribbed portal with the shaft of light standing in its aperture.
       *
       * Square-shouldered rather than arched, which is both the brief's corner
       * rule and the actual scene: the reference boards' portals are
       * monolithic slabs, not cathedral arches. The solid beam is the focal
       * object, as it is in the scene itself.
       */
      return (
        <>
          <path d="M3.5 21V6.5h17V21" />
          <path d="M7 21V10h10v11" />
          <rect x="10.75" y="12.5" width="2.5" height="8.5" fill="currentColor" stroke="none" />
        </>
      )

    case 'survey':
      /*
       * A barred spiral seen from above and to one side.
       *
       * The ellipse is the inclination, the solid bar is the galactic bar, and
       * the two arcs are the arms trailing off it. The bar is what separates
       * this from every other round mark in the kit — it is the one whose
       * emphasis runs *through* the circle rather than sitting at its centre
       * or on its rim.
       */
      return (
        <>
          <ellipse cx="12" cy="12" rx="9.25" ry="6" />
          <rect
            x="8.5"
            y="10.75"
            width="7"
            height="2.5"
            fill="currentColor"
            stroke="none"
            transform="rotate(-12 12 12)"
          />
          <path d="M15.5 10.25a5.5 5.5 0 0 1 2.25 3.5" />
          <path d="M8.5 13.75a5.5 5.5 0 0 1-2.25-3.5" />
        </>
      )

    case 'chorus':
      /*
       * A register: rows against a bare left rule, the newest one marked.
       *
       * The same rows as the muster and deliberately unenclosed — see that
       * mark's note. The solid tick is on the *top* row because the overlay
       * puts its one crimson mark on the newest entry, so the mark and the
       * broadcast agree about which end is live.
       */
      return (
        <>
          <path d="M3.5 3.5v17" />
          <rect x="6.5" y="5.25" width="2.5" height="2.5" fill="currentColor" stroke="none" />
          <path d="M11 6.5h9.5" />
          <path d="M6.5 11.25h3M11 11.25h7" />
          <path d="M6.5 16h3M11 16h9" />
          <path d="M6.5 20.25h3M11 20.25h5" />
        </>
      )

    case 'docket':
      /*
       * A queue: the entry in hand, the entries waiting, the one discharged.
       *
       * The struck row is the only place in the family a line crosses a shape,
       * and it earns it — "marks the entry in progress and strikes those
       * discharged" is the overlay's own scope, and a queue with nothing
       * struck is just a list.
       */
      return (
        <>
          <rect x="3.5" y="3.75" width="17" height="4.5" fill="currentColor" stroke="none" />
          <rect x="3.5" y="10.25" width="17" height="4.5" />
          <rect x="3.5" y="16.75" width="17" height="4.5" />
          <path d="M5.75 19h12.5" />
        </>
      )
  }
}

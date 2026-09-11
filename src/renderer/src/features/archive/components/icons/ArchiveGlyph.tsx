import type { ReactNode } from 'react'

/**
 * The ARCHIVE's small marks: panel headings, inline actions, row affordances.
 *
 * A second family beside `ArchiveIcon`, and the split is about scale rather
 * than taste. Those marks are drawn on a 64×48 field for tiles rendered at
 * 72px; at the 12–14px a heading wants, a 1.5 stroke on a 64-unit field
 * resolves to about a third of a pixel and disappears. These are drawn on a
 * 16×16 field so the same nominal weight lands near a full pixel — the family
 * rule is "hairline at 1.5 *in field units*", not a fixed device width.
 *
 * Everything else is shared with the large marks, because the brief governs
 * both: **square corners**, structure expressed as ribbing, one solid element
 * carrying the emphasis, and colour taken entirely from `currentColor` so a
 * glyph inherits whatever the text beside it is using. No icon set is pulled
 * in, for the reason recorded on `ArchiveIcon` — every set on offer is drawn
 * with rounded corners, and a single soft object on the page would be the one
 * thing the eye caught.
 *
 * Diagonals are permitted and used (the tag's point, the nib, the cross).
 * The rule the brief actually states is about *corners*, and the folder mark
 * has had a diagonal shoulder since the first build.
 */
export type ArchiveGlyphName =
  // Objects
  | 'tag'
  | 'note'
  | 'index'
  | 'waveform'
  | 'disk'
  | 'history'
  | 'duration'
  | 'master'
  | 'set'
  | 'layers'
  | 'image'
  | 'alert'
  | 'shelf'
  | 'loose'
  | 'bin'
  | 'seal'
  | 'scan'
  // Actions
  | 'favourite'
  | 'pin'
  | 'edit'
  | 'cross'
  | 'plus'

export interface ArchiveGlyphProps {
  name: ArchiveGlyphName
  className?: string
}

export function ArchiveGlyph({ name, className }: ArchiveGlyphProps): ReactNode {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      focusable="false"
    >
      {renderGlyph(name)}
    </svg>
  )
}

function renderGlyph(name: ArchiveGlyphName): ReactNode {
  switch (name) {
    case 'tag':
      /*
       * A pennant with a solid eyelet.
       *
       * Square at the spine and pointed at the tip — the pointed end is what
       * separates a tag from the note leaf beside it in the same panel row,
       * which at this size is the only silhouette difference available.
       */
      return (
        <>
          <path d="M2 3 H9 L14 8 L9 13 H2 Z" fill="currentColor" fillOpacity="0.16" />
          <rect x="4.25" y="6.75" width="2.5" height="2.5" fill="currentColor" stroke="none" />
        </>
      )

    case 'note':
      /*
       * A leaf of writing — rules, not the arrangement bars the project mark
       * carries. A note *is* text, which is exactly the thing `ArchiveIcon`'s
       * project mark deliberately refuses to draw for a `.als`.
       */
      return (
        <>
          <path d="M3 2 H13 V14 H3 Z" fill="currentColor" fillOpacity="0.14" />
          <path d="M5.5 5.5 H10.5 M5.5 8 H10.5 M5.5 10.5 H8.5" opacity="0.75" />
        </>
      )

    case 'index':
      // A card index: leading tabs against ruled entries. Used wherever the
      // subject is the register itself rather than anything in it.
      return (
        <>
          <rect x="2" y="3" width="2.5" height="2.5" fill="currentColor" stroke="none" />
          <rect x="2" y="6.75" width="2.5" height="2.5" fill="currentColor" stroke="none" />
          <rect x="2" y="10.5" width="2.5" height="2.5" fill="currentColor" stroke="none" />
          <path d="M6.5 4.25 H14 M6.5 8 H14 M6.5 11.75 H12" opacity="0.75" />
        </>
      )

    case 'waveform':
      // Uneven bars on a baseline, the same device the project mark uses at
      // tile size — a set read as a shape.
      return (
        <>
          <path d="M3 10 V6 M5.5 12 V4 M8 11 V7 M10.5 13.5 V2.5 M13 10 V6" />
          <path d="M2 15 H14" opacity="0.5" strokeWidth="1" />
        </>
      )

    case 'disk':
      // A plate in its housing, with the solid spindle mark. Square, because
      // nothing in this interface is a rounded drive bay.
      return (
        <>
          <path d="M2 3 H14 V13 H2 Z" fill="currentColor" fillOpacity="0.12" />
          <path d="M2 8 H14" opacity="0.6" />
          <rect x="10.5" y="9.75" width="2" height="2" fill="currentColor" stroke="none" />
        </>
      )

    case 'history':
      // The one circular glyph, and it earns it: a dial is what a record of
      // elapsed time looks like, and the disc marks already establish that
      // circles belong to this family.
      return (
        <>
          <circle cx="8" cy="8" r="6" fill="currentColor" fillOpacity="0.1" />
          <path d="M8 4.25 V8 L10.75 9.75" />
        </>
      )

    case 'duration':
      /*
       * A dial with a filled sector: a *span* of time, as against `history`'s
       * hands, which mark points in it. The two are near neighbours on
       * purpose — both are clocks — but the distinction is real and the
       * silhouettes differ enough at 12px to tell apart.
       *
       * Drawn beside the arrangement length in the dossier masthead, where
       * `1:36` had no unit to carry. Tempo can say BPM; a duration has no
       * two-letter unit that is not worse than the mark.
       */
      return (
        <>
          <circle cx="8" cy="8" r="6" fill="currentColor" fillOpacity="0.1" />
          <path d="M8 2 A6 6 0 0 1 13.2 11 L8 8 Z" fill="currentColor" stroke="none" />
        </>
      )

    case 'master':
      // A pressed plate with a solid label — the smallest form of the disc
      // marks, for the panel where the final master is chosen.
      return (
        <>
          <circle cx="8" cy="8" r="6" fill="currentColor" fillOpacity="0.14" />
          <circle cx="8" cy="8" r="3.25" opacity="0.5" strokeWidth="1" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
        </>
      )

    case 'set':
      // The project document, reduced: clipped corner plus arrangement bars.
      return (
        <>
          <path d="M3 2 H9.5 L13 5.5 V14 H3 Z" fill="currentColor" fillOpacity="0.14" />
          <path d="M9.5 2 V5.5 H13" opacity="0.7" strokeWidth="1" />
          <path d="M5.5 11.5 V9 M7.5 11.5 V7.5 M9.5 11.5 V10" strokeWidth="1.25" />
        </>
      )

    case 'layers':
      // Three leaves offset behind one another: a revision is the same set
      // again, so the mark is the same shape repeated rather than a new one.
      return (
        <>
          <path d="M5 2 H14 V11" opacity="0.35" />
          <path d="M3.5 3.5 H12.5 V12.5" opacity="0.6" />
          <path d="M2 5 H11 V14 H2 Z" fill="currentColor" fillOpacity="0.14" />
        </>
      )

    case 'image':
      // A frame with a solid sun and a ridge line — the standard cue, drawn
      // with square corners and a hard horizon.
      return (
        <>
          <path d="M2 3 H14 V13 H2 Z" fill="currentColor" fillOpacity="0.12" />
          <rect x="4" y="5" width="2.25" height="2.25" fill="currentColor" stroke="none" />
          <path d="M2 12 L6 8 L9 11 L11 9 L14 12" opacity="0.8" strokeWidth="1.25" />
        </>
      )

    case 'alert':
      // A bar and a stop, boxed. Reserved for the missing-samples panel, which
      // is the only panel in the dossier that reports a fault.
      return (
        <>
          <path d="M2 2 H14 V14 H2 Z" fill="currentColor" fillOpacity="0.12" />
          <path d="M8 4.5 V9" />
          <rect x="7" y="10.75" width="2" height="2" fill="currentColor" stroke="none" />
        </>
      )

    case 'shelf':
      // The folder silhouette at glyph scale, rib and all — the same object
      // `ArchiveIcon`'s shelf marks draw, so a lens heading and the tiles
      // under it are recognisably about the same thing.
      return (
        <>
          <path d="M2 3.5 H6.5 L8 5.5 H14 V13 H2 Z" fill="currentColor" fillOpacity="0.16" />
          <path d="M2 7.5 H14" opacity="0.7" />
        </>
      )

    case 'loose':
      // A leaf off the square: everything else in this family sits true to
      // the grid, so a tilted one reads as unfiled before it is named.
      return <path d="M4 3 L11 2 L12.5 12.5 L5.5 13.5 Z" fill="currentColor" fillOpacity="0.14" />

    case 'bin':
      // The archive's own recycle bin, not the operating system's — a
      // container things can be taken back out of. See `projects:trash`.
      return (
        <>
          <path d="M6 3.5 V2 H10 V3.5" strokeWidth="1.25" />
          <path d="M2.5 4.5 H13.5" />
          <path d="M4 4.5 V13.5 H12 V4.5" fill="currentColor" fillOpacity="0.12" />
        </>
      )

    case 'seal':
      // A folder closed with a wax seal, exactly as the large `release` mark
      // draws it: a real directory that has been sealed and handed on.
      return (
        <>
          <path d="M2 3.5 H14 V13 H2 Z" fill="currentColor" fillOpacity="0.12" />
          <path d="M2 6.5 H14" opacity="0.55" strokeWidth="1" />
          <circle cx="8" cy="10" r="2.75" fill="currentColor" fillOpacity="0.9" />
        </>
      )

    case 'scan':
      // Register corners with a sweep across them. The walk, not the result.
      return (
        <>
          <path d="M2 5 V2 H5 M11 2 H14 V5 M14 11 V14 H11 M5 14 H2 V11" />
          <path d="M2 8 H14" opacity="0.7" />
        </>
      )

    case 'favourite':
      /*
       * A diamond — a square stood on its corner, which is the only rotation
       * the brief's square-corner rule leaves available and the mark this
       * control has always used.
       *
       * It was the literal character `◆` at 9px inside a 28px button, which
       * rendered as a faint speck that read as a bullet rather than as a
       * control. Drawn, it scales with the button and takes the same
       * `currentColor` treatment as every other mark; the parent fills it
       * when the project is a favourite.
       */
      return <path d="M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z" />

    case 'pin':
      // A drawing pin seen side on: solid head, square shoulders, a shaft.
      return (
        <>
          <rect x="3.5" y="2" width="9" height="3" fill="currentColor" stroke="none" />
          <path d="M8 5 V14" />
        </>
      )

    case 'edit':
      // A nib on its stroke. The solid tip is the one filled element, so the
      // glyph reads as writing rather than as an arrow.
      return (
        <>
          <path d="M10.5 2.5 L13.5 5.5 L6 13 H3 V10 Z" fill="currentColor" fillOpacity="0.14" />
          <path d="M9 4 L12 7" opacity="0.6" strokeWidth="1" />
        </>
      )

    case 'cross':
      return <path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5" />

    case 'plus':
      return <path d="M8 2.5 V13.5 M2.5 8 H13.5" />
  }
}

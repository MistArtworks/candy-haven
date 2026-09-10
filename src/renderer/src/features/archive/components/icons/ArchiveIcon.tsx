import type { ReactNode } from 'react'

/**
 * Every mark the ARCHIVE draws for a thing you can open.
 *
 * Drawn here rather than pulled from an icon set, for the same reason the
 * console ships no icon library anywhere else: every set on offer is drawn with
 * rounded corners and even stroke weights, and this interface is built on the
 * brief's rule that corners are square and structure is expressed as ribbing.
 * A rounded folder would be the one soft object on the page.
 *
 * The whole family shares a construction so the grid reads as one system: a
 * 64×48 field, hairline outlines at 1.5, one solid element carrying the colour,
 * and fills at low alpha so a dark swatch still reads as a shape rather than a
 * hole. Colour comes from `currentColor`, which the tile sets from the record's
 * swatch — so nothing here knows anything about the palette.
 *
 * The two shelf marks are deliberately variations on one folder rather than two
 * different objects: a genre and a plain folder are the same kind of thing at
 * different depths, and both hold the same things. Only the shoulder rib
 * differs, heavier at the top of the tree. The disc marks are what genuinely
 * differ — a volume is not a place, it is a record.
 */
export type ArchiveMark =
  | 'genre'
  | 'folder'
  | 'project'
  | 'album'
  | 'ep'
  | 'compilation'
  | 'release'
  | 'add'
  | 'add-project'

export interface ArchiveIconProps {
  mark: ArchiveMark
  /** Opens the lid, marking the shelf the browser is currently standing in. */
  open?: boolean
  className?: string
}

/** The folder body every shelf mark is built on. Spans y 9–45, centred on x 32. */
const FOLDER_BODY = 'M2 9 H22 L27 15 H62 V45 H2 Z'

/**
 * The document body behind both project marks.
 *
 * Sized to sit on the same optical axis as the folder: centred on x 32 and
 * occupying the same vertical band. It was previously narrower and higher, so a
 * project tile beside a folder tile looked smaller and slightly lifted — which
 * reads as "not centred" even though both were centred in their own tiles.
 */
const DOCUMENT_BODY = 'M16 8 H40 L48 16 V45 H16 Z'
const DOCUMENT_FOLD = 'M40 8 V16 H48'

/** Centre of both bodies, where every plus mark sits. */
const PLUS = 'M32 20 V34 M25 27 H39'

export function ArchiveIcon({ mark, open = false, className }: ArchiveIconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 64 48" fill="none" aria-hidden="true" focusable="false">
      {renderMark(mark, open)}
    </svg>
  )
}

function renderMark(mark: ArchiveMark, open: boolean): ReactNode {
  switch (mark) {
    case 'add':
      return (
        <>
          {/* Dashed body: a folder that does not exist yet. */}
          <path
            d={FOLDER_BODY}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            opacity="0.7"
          />
          <path d={PLUS} stroke="currentColor" strokeWidth="2" />
        </>
      )

    case 'add-project':
      // The project mark, dashed: a set that does not exist yet. Paired with
      // `add` in the same grid, so the two must differ by silhouette rather
      // than by their label alone.
      return (
        <>
          <path
            d={DOCUMENT_BODY}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            opacity="0.7"
          />
          <path d={PLUS} stroke="currentColor" strokeWidth="2" />
        </>
      )

    case 'genre':
      // One heavy rib across the shoulder. The most solid mark in the family,
      // because a genre is the top of the tree.
      return <Folder open={open} rib={4} />

    case 'folder':
      // A lighter rib — below a genre, and claiming less than one.
      return <Folder open={open} rib={2} />

    case 'project':
      /*
       * A document holding a set, not a folder.
       *
       * The one mark that breaks the folder silhouette on purpose: in the tile
       * grid a project sits beside folders, and the operator needs to see at a
       * glance which tiles they can walk into and which open a record. The
       * clipped corner is the standard "file" cue.
       *
       * Inside it, session bars rather than text rules — a `.als` is a set, and
       * a page of writing was the wrong thing to draw. Deliberately *not* a
       * copy of Ableton's own icon: this is a mark for the operator's project,
       * not a claim to be Live's file type, and the app draws nobody else's
       * trademark. Uneven bar heights read as an arrangement at a glance and
       * stay legible at 72px.
       */
      return (
        <>
          <path
            d={DOCUMENT_BODY}
            fill="currentColor"
            fillOpacity="0.14"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d={DOCUMENT_FOLD} stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
          {/* Arrangement bars, growing then falling — a set with a shape. */}
          <path
            d="M22 37 V31 M26 37 V25 M30 37 V28 M34 37 V22 M38 37 V30 M42 37 V34"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="butt"
          />
          {/* The baseline they sit on, so the bars read as a track rather than
              as a scattering of ticks. */}
          <path d="M20 39 H44" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
        </>
      )

    case 'album':
      // A full plate: the largest disc, with a wide label ring.
      return <Disc radius={19} label={6} />

    case 'ep':
      // The same plate, smaller and with a larger label — a seven-inch beside a
      // twelve-inch, which is exactly the distinction being drawn.
      return <Disc radius={14} label={6} />

    case 'compilation':
      /*
       * Three plates, stacked and offset.
       *
       * A compilation is the one volume kind defined by *gathering* rather than
       * by length, so it is drawn as several records rather than one of a
       * different size.
       */
      return (
        <>
          <circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          <circle cx="30" cy="24" r="14" stroke="currentColor" strokeWidth="1.5" opacity="0.65" />
          <circle
            cx="36"
            cy="24"
            r="14"
            fill="currentColor"
            fillOpacity="0.16"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle cx="36" cy="24" r="5" fill="currentColor" />
        </>
      )

    case 'release':
      /*
       * A sealed package: the folder body with a wax-seal disc across it.
       *
       * Keeps the folder silhouette because a release *is* a real directory the
       * operator can open, but the seal says it has been closed and handed on —
       * which is the whole distinction between the RELEASES lens and the shelves.
       */
      return (
        <>
          <path
            d={FOLDER_BODY}
            fill="currentColor"
            fillOpacity="0.12"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M2 21 H62" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
          <circle
            cx="32"
            cy="30"
            r="9"
            fill="currentColor"
            fillOpacity="0.9"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </>
      )
  }
}

/**
 * The shared folder silhouette.
 *
 * `rib` is the only axis that distinguishes a genre from a plain folder —
 * heavier means higher in the tree — and `open` drops the lid to mark the
 * shelf the browser is standing in.
 */
function Folder({ open, rib }: { open: boolean; rib: number }): ReactNode {
  return (
    <>
      {/* The fill is the swatch at low alpha so a dark colour still reads as a
          shape rather than a hole. */}
      <path
        d={FOLDER_BODY}
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d={open ? 'M2 15 H62' : 'M2 21 H62'}
        stroke="currentColor"
        strokeWidth={open ? 1.5 : rib}
        opacity={open ? 0.5 : 1}
      />
      {open ? (
        // An open folder loses its lid: the shelf the browser is standing in.
        <path d="M8 45 L14 21 H62 L56 45 Z" fill="currentColor" fillOpacity="0.28" />
      ) : null}
    </>
  )
}

/** A record plate. `radius` sizes the disc, `label` the solid centre. */
function Disc({ radius, label }: { radius: number; label: number }): ReactNode {
  return (
    <>
      <circle
        cx="32"
        cy="24"
        r={radius}
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* The groove. Set in from the rim so it reads as pressed vinyl rather
          than as a second outline. */}
      <circle cx="32" cy="24" r={radius - 4} stroke="currentColor" strokeWidth="1" opacity="0.45" />
      <circle cx="32" cy="24" r={label} fill="currentColor" />
    </>
  )
}

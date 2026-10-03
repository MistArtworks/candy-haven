import type { ReactNode } from 'react'
import type { Glyph } from './glyphs'

/**
 * The strip's glyphs: thin line drawings in the vestibule's manner (its New
 * project tile is an aperture, not a plus), sized by the button around them.
 */

const PATHS: Record<Glyph, ReactNode> = {
  new: (
    <>
      <line x1="12" y1="4.5" x2="12" y2="19.5" />
      <line x1="4.5" y1="12" x2="19.5" y2="12" />
      <circle cx="12" cy="12" r="7.5" opacity="0.5" strokeWidth="0.9" />
    </>
  ),
  console: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" />
      <rect x="13.5" y="3.5" width="7" height="7" />
      <rect x="3.5" y="13.5" width="7" height="7" />
      <rect x="13.5" y="13.5" width="7" height="7" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="5" />
      <path d="M5 9v11h14V9" />
      <line x1="10" y1="13" x2="14" y2="13" />
    </>
  ),
  disc: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 5.5a6.5 6.5 0 0 1 6.5 6.5" opacity="0.6" />
    </>
  ),
  listen: (
    <>
      <line x1="4" y1="10" x2="4" y2="14" />
      <line x1="8" y1="7" x2="8" y2="17" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="16" y1="8" x2="16" y2="16" />
      <line x1="20" y1="11" x2="20" y2="13" />
    </>
  ),
  releases: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 15v5h16v-5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
      <rect x="7" y="12.5" width="3" height="3" fill="currentColor" stroke="none" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="6.6" />
      <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8" />
    </>
  ),
  folder: <path d="M3.5 6.5h6l2 2h9v10h-17z" />,
  // An ARCHIVE stack: the shelves it files projects on.
  stack: (
    <>
      <path d="M4 8.5l8-4 8 4-8 4z" />
      <path d="M4 12.5l8 4 8-4" />
      <path d="M4 16.5l8 4 8-4" opacity="0.6" />
    </>
  ),
  // The handle a row is dragged by.
  grip: (
    <>
      <circle cx="9" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  file: (
    <>
      <path d="M6 3.5h8l4 4v13H6z" />
      <path d="M14 3.5v4h4" />
    </>
  ),
  set: (
    <>
      <rect x="4" y="5" width="16" height="14" />
      <line x1="8" y1="9" x2="8" y2="15" />
      <line x1="12" y1="9" x2="12" y2="15" />
      <line x1="16" y1="9" x2="16" y2="15" />
    </>
  ),
  audio: (
    <>
      <path d="M9 17V6l10-2v11" />
      <circle cx="7" cy="17" r="2.5" />
      <circle cx="17" cy="15" r="2.5" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l5-4 4 3 3-2 4 3" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  page: (
    <>
      <rect x="4" y="4" width="16" height="16" />
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="9" y1="9" x2="9" y2="20" />
    </>
  ),
  door: (
    <>
      <path d="M6 20V4h9v16" />
      <path d="M15 6l4 1v13l-4-1" />
      <circle cx="12.5" cy="12" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  open: <path d="M9 6l6 6-6 6" />,
  add: (
    <>
      <line x1="12" y1="6" x2="12" y2="18" />
      <line x1="6" y1="12" x2="18" y2="12" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />
}

export function Icon({ glyph, size = 19 }: { glyph: Glyph; size?: number }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      // Inline, because the reset fills every svg (svg { fill: currentColor })
      // and a stylesheet outranks the attribute; these are line drawings.
      style={{ fill: 'none' }}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[glyph]}
    </svg>
  )
}

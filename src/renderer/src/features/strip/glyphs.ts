import type { Target } from '@shared/domain/strip'

/** Every glyph the strip draws (icons.tsx). */
export type Glyph =
  | 'new'
  | 'console'
  | 'archive'
  | 'disc'
  | 'listen'
  | 'releases'
  | 'calendar'
  | 'gear'
  | 'folder'
  | 'stack'
  | 'grip'
  | 'file'
  | 'set'
  | 'audio'
  | 'image'
  | 'link'
  | 'page'
  | 'door'
  | 'more'
  | 'open'
  | 'add'
  | 'check'

const PAGE_GLYPH: Record<string, Glyph> = {
  '/archive': 'archive',
  '/discography': 'disc',
  '/auditorium': 'listen',
  '/releases': 'releases',
  '/calendar': 'calendar',
  '/regulation': 'gear'
}

const SET_EXTENSIONS = new Set(['als', 'alp'])
const AUDIO_EXTENSIONS = new Set(['wav', 'mp3', 'flac', 'aif', 'aiff', 'ogg', 'm4a'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'psd', 'gif', 'avif'])

/** The glyph for a file, by what it is. */
export function fileGlyph(path: string): Glyph {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  if (SET_EXTENSIONS.has(extension)) return 'set'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  return 'file'
}

/** The glyph for a pin's target. */
export function targetGlyph(target: Target): Glyph {
  switch (target.kind) {
    case 'page':
      return PAGE_GLYPH[target.route.split('?')[0]] ?? 'page'
    case 'action':
      if (target.action === 'new-project') return 'new'
      if (target.action === 'add-to-today') return 'calendar'
      if (target.action === 'vestibule') return 'door'
      return 'console'
    case 'file':
      return fileGlyph(target.path)
    case 'folder':
      return 'folder'
    case 'stack':
      return 'stack'
    case 'project':
      return 'set'
    case 'link':
      return 'link'
  }
}

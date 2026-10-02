import type { LoreChapterView } from '@shared/domain/lore'
import { CHAPTER_STATUS_LABEL } from '@shared/domain/lore.constants'
import { formatRelative, timeOf } from '../lib/format'

/** What CHAPTERS says of a chapter, the same in every layout. */

export const titleOf = (view: LoreChapterView): string =>
  view.draft?.title || view.published?.title || 'Untitled'

export const lineOf = (view: LoreChapterView): string =>
  view.draft?.line || view.published?.line || ''

/** Where it stands and since when: only here and saved, or published. */
export function whereOf(view: LoreChapterView): string {
  if (view.status === 'draft') {
    const saved = timeOf(view.draft?.updatedAt ?? '')
    return `Only here${saved ? `, saved ${formatRelative(saved)}` : ''}`
  }
  const published = timeOf(view.published?.publishedAt ?? '')
  const when = published ? `Published ${formatRelative(published)}` : 'Published'
  return view.status === 'changed' ? `${when}, changed here since` : when
}

/** The status chip's word: short enough for a row or a card. */
export const statusWord = (view: LoreChapterView): string =>
  view.status === 'changed' ? 'CHANGED' : CHAPTER_STATUS_LABEL[view.status]

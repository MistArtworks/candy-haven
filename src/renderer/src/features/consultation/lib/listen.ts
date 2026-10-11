import type { Consultation, ConsultationFeedback } from '@shared/domain/consultation'
import type { InsertSpec } from '@renderer/features/auditorium/lib/useAudioEngine'
import { hasTools, heardTools, type Flips } from './track'

/*
 * How a producer's feedback is heard on the console's one transport: the
 * shared track under a key of its own, their tools in the insert slot.
 */

/** What the transport files a link's track under, to tell it is the one loaded. */
export const trackKey = (link: Pick<Consultation, 'id'>): string => `consultation:${link.id}`

/** The page for one producer's feedback on one link. */
export const producerPath = (linkId: string, feedbackId: string): string =>
  `/consultation?link=${encodeURIComponent(linkId)}&producer=${encodeURIComponent(feedbackId)}`

const NONE: Flips = new Map()

/**
 * A producer's tools for the insert slot, with any switches flipped here,
 * and the way back to their page; null when they put none on.
 */
export function insertFor(
  link: Pick<Consultation, 'id'>,
  entry: ConsultationFeedback,
  flips: Flips = NONE
): InsertSpec | null {
  return hasTools(entry)
    ? {
        key: entry.id,
        label: entry.name,
        tools: heardTools(entry, flips),
        path: producerPath(link.id, entry.id)
      }
    : null
}

import { useState, type ReactNode } from 'react'
import type { Consultation, ConsultationFeedback } from '@shared/domain/consultation'
import {
  chainIsEmpty,
  describeChain,
  formatClock,
  formatSpan,
  type Chain
} from '@shared/consult/engine'
import { usePlayback } from '@renderer/app/providers/playback'
import { notify } from '@renderer/components/feedback/notify'
import { Button } from '@renderer/components/primitives/Button'
import { formatRelative } from '@renderer/features/dispatch/lib/present'
import { plural } from '@renderer/lib/format'
import { hasTools, noteAt, toolsOf } from '../lib/track'
import { EqCurve } from './EqCurve'
import { FeedbackWaveform } from './FeedbackWaveform'
import styles from '../Consultation.module.scss'

/** How near a pin a press must land to pick its note, as a share of the track. */
const PIN_REACH = 0.006

/**
 * What the producers sent on one open link, and the track heard through it.
 *
 * One producer at a time: their moments and sections on the waveform, their
 * notes in order, and the tools they put on, in words and as the EQ's
 * curve. Playing goes through the console's one transport, with their tools
 * in its insert slot (`setInsert`), so it keeps playing on any page and the
 * bar shows whose settings are on. **As it is** and **Their settings** are
 * the A/B; any other file opened takes their settings off.
 */
export function FeedbackView({
  link,
  feedback,
  openedAt
}: {
  link: Consultation
  feedback: readonly ConsultationFeedback[]
  /** When the link was opened here: what was read since still reads NEW. */
  openedAt: number
}): ReactNode {
  const {
    elementRef,
    source,
    insert,
    playing,
    position,
    loading,
    openFrom,
    setInsert,
    setBypass,
    toggle
  } = usePlayback()
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [activeNote, setActiveNote] = useState<string | null>(null)

  const key = `consultation:${link.id}`
  const loaded = source?.key === key
  const who =
    feedback.find((entry) => entry.id === pickedId) ??
    (loaded ? feedback.find((entry) => entry.id === insert?.key) : undefined) ??
    feedback[0] ??
    null

  if (!who) return null

  const theirs = loaded && insert?.key === who.id
  const tooled = hasTools(who)
  const duration = link.durationMs / 1000
  const notes = [...who.notes].sort((a, b) => a.at - b.at)

  /** Their tools on, or off when they put none on. */
  const through = (entry: ConsultationFeedback): void => {
    setInsert(hasTools(entry) ? { key: entry.id, label: entry.name, tools: toolsOf(entry) } : null)
  }

  /**
   * Plays the track through `entry`'s tools, from `from` when given. Loads
   * it first if the transport has something else: the file it was shared
   * from when it is still here, or the copy in the bucket.
   */
  const listen = async (entry: ConsultationFeedback, from?: number): Promise<void> => {
    if (!loaded) {
      try {
        await openFrom(() => window.candy.consultation.audio(link.id), {
          home: 'consultation',
          key
        })
      } catch (cause) {
        notify.refuse(cause, { label: 'The track would not play' })
        return
      }
    }
    if (!loaded || insert?.key !== entry.id) through(entry)
    const element = elementRef.current
    if (!element) return
    if (from !== undefined) seekWhenReady(element, from)
    if (element.paused) toggle()
  }

  const pick = (entry: ConsultationFeedback): void => {
    setPickedId(entry.id)
    setActiveNote(null)
    // Listening already: hear the one picked.
    if (loaded) through(entry)
  }

  return (
    <div className={styles.feedback}>
      <div className={styles.producers} role="tablist" aria-label="Who sent feedback">
        {feedback.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === who.id}
            className={styles.producer}
            onClick={() => pick(entry)}
          >
            <span className={styles.producerHead}>
              {entry.readAt === null || entry.readAt >= openedAt ? (
                <span className={styles.markNew}>NEW</span>
              ) : null}
              <span className={styles.producerName}>{entry.name}</span>
            </span>
            <span className={styles.producerMeta}>
              {plural(entry.notes.length, 'note')}
              {hasTools(entry) ? ' · tools' : ''} · {formatRelative(entry.submittedAt)}
            </span>
          </button>
        ))}
      </div>

      <FeedbackWaveform
        waveform={link.waveform}
        duration={duration}
        notes={notes}
        active={activeNote}
        elementRef={elementRef}
        loaded={loaded}
        playing={playing}
        position={position}
        onPress={(seconds) => {
          const note = noteAt(notes, seconds, PIN_REACH * duration)
          setActiveNote(note?.id ?? null)
          void listen(who, note && note.end === null ? note.at : seconds)
        }}
      />

      <div className={styles.transport}>
        <Button
          size="sm"
          variant="primary"
          busy={loading && !loaded}
          onClick={() => (loaded ? toggle() : void listen(who))}
        >
          {loaded && playing ? 'Hold' : 'Play'}
        </Button>
        <span className={styles.clock}>
          {formatClock(loaded ? position : 0)} / {formatClock(duration)}
        </span>
        <span className={styles.spacer} />
        {tooled ? (
          <div className={styles.segmented} role="group" aria-label="Hear the track">
            <button
              type="button"
              className={styles.segment}
              data-selected={(loaded && (!theirs || insert?.bypassed)) || undefined}
              onClick={() => {
                if (theirs) setBypass(true)
                else void listen(who).then(() => setBypass(true))
              }}
            >
              As it is
            </button>
            <button
              type="button"
              className={styles.segment}
              data-selected={(theirs && !insert?.bypassed) || undefined}
              onClick={() => {
                if (theirs) setBypass(false)
                else void listen(who)
              }}
            >
              {who.name}&apos;s settings
            </button>
          </div>
        ) : (
          <span className={styles.footnote}>Notes only: no tools to hear.</span>
        )}
      </div>

      {notes.length ? (
        <ol className={styles.notes}>
          {notes.map((note) => (
            <li key={note.id} className={styles.noteItem}>
              <button
                type="button"
                className={styles.note}
                data-active={note.id === activeNote || undefined}
                onClick={() => {
                  setActiveNote(note.id)
                  void listen(who, note.at)
                }}
              >
                <span className={styles.noteWhen}>{formatSpan(note.at, note.end)}</span>
                {note.text ? <span className={styles.noteText}>{note.text}</span> : null}
                {note.chain && !chainIsEmpty(note.chain) ? <ToolLines chain={note.chain} /> : null}
              </button>
              {note.chain && note.chain.eq.length ? <EqCurve bands={note.chain.eq} /> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {who.chain && !chainIsEmpty(who.chain) ? (
        <div className={styles.block}>
          <span className={styles.sectionLabel}>On the whole track</span>
          <ToolLines chain={who.chain} />
          {who.chain.eq.length ? <EqCurve bands={who.chain.eq} /> : null}
        </div>
      ) : null}
    </div>
  )
}

/** A set of tools in words, one a line, in the order they are heard. */
function ToolLines({ chain }: { chain: Chain }): ReactNode {
  return (
    <span className={styles.tools}>
      {describeChain(chain).map((line) => (
        <span key={line} className={styles.tool}>
          {line}
        </span>
      ))}
    </span>
  )
}

/**
 * Moves the playhead once the element knows how long the track is: a track
 * just loaded has no length yet, and a seek before then is dropped.
 */
function seekWhenReady(element: HTMLAudioElement, seconds: number): void {
  const go = (): void => {
    element.currentTime = Math.min(Math.max(seconds, 0), element.duration)
  }
  if (Number.isFinite(element.duration)) go()
  else element.addEventListener('loadedmetadata', go, { once: true })
}

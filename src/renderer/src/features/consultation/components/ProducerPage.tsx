import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { Consultation, ConsultationFeedback } from '@shared/domain/consultation'
import { formatClock, type Device, type Note } from '@shared/consult/engine'
import { usePlayback } from '@renderer/app/providers/playback'
import { notify } from '@renderer/components/feedback/notify'
import { Button } from '@renderer/components/primitives/Button'
import { Panel } from '@renderer/components/primitives/Panel'
import { formatRelative } from '@renderer/features/dispatch/lib/present'
import { plural } from '@renderer/lib/format'
import { gridVariants } from '@renderer/motion/transitions'
import { insertFor, trackKey } from '../lib/listen'
import {
  WHOLE,
  hasTools,
  heardTools,
  isHeard,
  noteAt,
  pluginKey,
  scopesOf,
  toolsOf,
  type Flips
} from '../lib/track'
import { DeviceChain } from './DeviceChain'
import { FeedbackWaveform } from './FeedbackWaveform'
import { MeterRow } from './MeterRow'
import { ProducerNotes } from './ProducerNotes'
import styles from '../Consultation.module.scss'

/** How near a pin a press must land to pick its note, as a share of the track. */
const PIN_REACH = 0.006

const NONE: Flips = new Map()

/**
 * One producer's feedback on one open link, laid out as the website's page
 * laid it out for them: the track with their notes under it on the left,
 * their tools on the right, held beside it and scrolling on their own.
 *
 * Playing goes through the console's one transport, with their tools in
 * its insert slot, so it keeps playing on any page and the bar's way back
 * comes here; the meters under the waveform read it as heard. **As it is**
 * and **Their settings** are the A/B. Their tools are their chain of
 * devices, as they laid it: each switches off and on, to hear what it
 * does (what they sent is not changed, and opening another producer has
 * theirs as they left them), and the one shown folds away to a line.
 */
export function ProducerPage({
  link,
  feedback,
  producerId,
  openedAt,
  onBack,
  onPick
}: {
  link: Consultation
  feedback: readonly ConsultationFeedback[]
  producerId: string
  /** When the link was opened here: feedback read since still reads NEW. */
  openedAt: number
  onBack: () => void
  onPick: (feedbackId: string) => void
}): ReactNode {
  const {
    elementRef,
    analyserRef,
    source,
    insert,
    playing,
    position,
    loading,
    volume,
    openFrom,
    setInsert,
    retune,
    setBypass,
    toggle
  } = usePlayback()
  // Each kept for the producer it was set on: another one starts afresh.
  const [flipped, setFlipped] = useState<{ id: string; flips: Flips }>({ id: '', flips: NONE })
  const [scope, setScope] = useState<{ id: string; scope: string }>({ id: '', scope: '' })
  const [active, setActive] = useState<{ id: string; note: string | null }>({ id: '', note: null })
  const [shownDevice, setShownDevice] = useState<{ id: string; by: Record<string, string> }>({
    id: '',
    by: {}
  })
  // Kept from one producer to the next: the device view folded away.
  const [folded, setFolded] = useState(false)

  const who = feedback.find((entry) => entry.id === producerId) ?? null
  const key = trackKey(link)
  const loaded = source?.key === key

  if (!who) {
    return (
      <Panel label={link.title} index="01" focal>
        <div className={styles.detail}>
          <p className={styles.empty}>
            That feedback is not here any more: its link may have closed since.
          </p>
          <div className={styles.actions}>
            <Button size="sm" onClick={onBack}>
              Back to {link.title}
            </Button>
          </div>
        </div>
      </Panel>
    )
  }

  const theirs = loaded && insert?.key === who.id
  const tooled = hasTools(who)
  const duration = link.durationMs / 1000
  const notes = [...who.notes].sort((a, b) => a.at - b.at)
  const flips = flipped.id === who.id ? flipped.flips : NONE
  const scopes = scopesOf(who)
  const shown =
    scopes.find((option) => scope.id === who.id && option.id === scope.scope) ?? scopes[0]
  const activeNote = active.id === who.id ? active.note : null
  const shownDeviceId =
    shown && shownDevice.id === who.id ? (shownDevice.by[shown.id] ?? null) : null

  /** Their tools on, with any switches flipped here; off when they put none on. */
  const through = (entry: ConsultationFeedback): void => {
    setInsert(insertFor(link, entry, entry.id === who.id ? flips : NONE))
  }

  /**
   * Plays the track through `entry`'s tools, from `from` when given. Loads
   * it first if the transport has something else: the file it was shared
   * from when it is still here, or the copy in the website's store.
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

  const pickProducer = (entry: ConsultationFeedback): void => {
    // Listening already: hear the one picked, all of their tools on.
    if (loaded && entry.id !== who.id) setInsert(insertFor(link, entry))
    onPick(entry.id)
  }

  const playNote = (note: Note): void => {
    setActive({ id: who.id, note: note.id })
    if (scopes.some((option) => option.id === note.id)) setScope({ id: who.id, scope: note.id })
    void listen(who, note.at)
  }

  const switchDevice = (scopeId: string, device: Device, on: boolean): void => {
    const next = new Map(flips)
    // Back where they left it, it's no flip at all.
    if (on === device.on) next.delete(pluginKey(scopeId, device.id))
    else next.set(pluginKey(scopeId, device.id), on)
    setFlipped({ id: who.id, flips: next })
    // Heard at once, the A/B left where it is.
    if (theirs) retune(heardTools(who, next))
  }

  const backToTheirs = (): void => {
    setFlipped({ id: who.id, flips: NONE })
    if (theirs) retune(toolsOf(who))
  }

  const showDevice = (scopeId: string, deviceId: string): void => {
    setShownDevice((current) => ({
      id: who.id,
      by: { ...(current.id === who.id ? current.by : {}), [scopeId]: deviceId }
    }))
  }

  return (
    <div className={styles.producerPage}>
      <div className={styles.producerBar}>
        <Button
          size="sm"
          onClick={onBack}
          icon={
            <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
              <path d="M7.5 2.5 4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          }
        >
          {link.title}
        </Button>
        <div className={styles.producers} role="tablist" aria-label="Who sent feedback">
          {feedback.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === who.id}
              className={styles.producer}
              onClick={() => pickProducer(entry)}
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
      </div>

      <motion.div
        className={styles.producerGrid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <Panel
          label={`${who.name}'s notes`}
          index="01"
          focal
          className={styles.listenPanel}
          aside={<span className={styles.count}>Sent {formatRelative(who.submittedAt)}</span>}
        >
          <div className={styles.feedback}>
            <FeedbackWaveform
              waveform={link.waveform}
              duration={duration}
              notes={notes}
              active={activeNote}
              elementRef={elementRef}
              loaded={loaded}
              playing={playing}
              position={position}
              className={styles.waveformTall}
              onPress={(seconds) => {
                const note = noteAt(notes, seconds, PIN_REACH * duration)
                setActive({ id: who.id, note: note?.id ?? null })
                if (note && scopes.some((option) => option.id === note.id)) {
                  setScope({ id: who.id, scope: note.id })
                }
                void listen(who, note && note.end === null ? note.at : seconds)
              }}
            />

            <MeterRow
              // Another producer is another sound: the integrated reading starts again.
              key={who.id}
              analyserRef={analyserRef}
              live={loaded && playing}
              volume={volume}
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

            {flips.size > 0 ? (
              <p className={styles.offLine}>
                {plural(flips.size, 'device')} switched from how they left{' '}
                {flips.size === 1 ? 'it' : 'them'}.
                <button type="button" className={styles.inlineAction} onClick={backToTheirs}>
                  Back to theirs
                </button>
              </p>
            ) : null}

            <div className={styles.block}>
              <span className={styles.sectionLabel}>Notes</span>
              <ProducerNotes
                notes={notes}
                active={activeNote}
                onPlay={playNote}
                onTools={(note) => {
                  setActive({ id: who.id, note: note.id })
                  setScope({ id: who.id, scope: note.id })
                }}
              />
            </div>
          </div>
        </Panel>

        <Panel label="Their tools" index="02" className={styles.toolsPanel}>
          {shown ? (
            <div className={styles.toolsBody}>
              <div className={styles.scopes} role="group" aria-label="Where the tools are">
                {scopes.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={styles.scope}
                    aria-pressed={option.id === shown.id}
                    onClick={() => {
                      setScope({ id: who.id, scope: option.id })
                      if (option.id !== WHOLE) setActive({ id: who.id, note: option.id })
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <DeviceChain
                chain={shown.chain}
                heard={(device) => isHeard(flips, shown.id, device)}
                onSwitch={(device, on) => switchDevice(shown.id, device, on)}
                openId={shownDeviceId}
                onOpen={(deviceId) => showDevice(shown.id, deviceId)}
                folded={folded}
                onFold={setFolded}
                analyserRef={analyserRef}
                live={loaded && playing}
              />
            </div>
          ) : (
            <p className={styles.empty}>{who.name} left notes only, with no tools on the track.</p>
          )}
        </Panel>
      </motion.div>
    </div>
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

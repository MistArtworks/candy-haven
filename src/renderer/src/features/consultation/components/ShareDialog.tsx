import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { AUDIO_EXTENSIONS } from '@shared/domain/auditorium'
import type { Consultation, ConsultationStorage } from '@shared/domain/consultation'
import {
  DAY_MS,
  MAX_BPM,
  MAX_LINK_DAYS,
  MAX_MESSAGE,
  MAX_TITLE,
  MAX_TRACK_BYTES,
  MIN_BPM
} from '@shared/domain/consultation.constants'
import { formatClock } from '@shared/consult/engine'
import { Button } from '@renderer/components/primitives/Button'
import {
  Dialog,
  DialogChip,
  DialogChips,
  DialogField
} from '@renderer/components/primitives/Dialog'
import { TextArea, TextInput } from '@renderer/components/primitives/Input'
import { Meter } from '@renderer/components/primitives/Meter'
import { formatStamp } from '@renderer/features/dispatch/lib/present'
import { useShareProgress } from '@renderer/hooks/useConsultation'
import { useCopy } from '@renderer/hooks/useCopy'
import { useNow } from '@renderer/hooks/useLeads'
import { formatBytes } from '@renderer/lib/format'
import { projectHolding, stem, surveyTrack, type TrackSurvey } from '../lib/track'
import styles from '../Consultation.module.scss'

const DAYS = Array.from({ length: MAX_LINK_DAYS }, (_, index) => index + 1)

/** The track chosen, read and surveyed. */
interface Chosen extends TrackSurvey {
  path: string
  name: string
  size: number
}

type Stage = 'form' | 'sending' | 'done'

function host(origin: string): string {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

/** A refusal as a sentence: main's, with its hint already in it, or the decoder's. */
function reason(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === 'EncodingError') {
    return 'That file could not be decoded. Bounce it again, as WAV or MP3.'
  }
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Sharing a track: any bounce on this machine, chosen with the file picker
 * or dropped on the dialog. It need not be in the ARCHIVE; if it sits in a
 * project's folder, the project's tempo fills in.
 *
 * The file is checked the moment it is chosen (an audio format, 200 MB at
 * most, room left in the free storage) and refused with the reason, then
 * read and surveyed here for its length and the waveform the page draws.
 * **Share** uploads it, showing how far it has got, and opens its link; the
 * dialog ends on the link, with Copy.
 */
export function ShareDialog({
  storage,
  website,
  onClose
}: {
  storage: ConsultationStorage
  website: string
  /** With the link opened, or null when nothing was shared. */
  onClose: (shared: Consultation | null) => void
}): ReactNode {
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [reading, setReading] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [titleTyped, setTitleTyped] = useState(false)
  const [days, setDays] = useState(MAX_LINK_DAYS)
  const [bpm, setBpm] = useState('')
  const [bpmTyped, setBpmTyped] = useState(false)
  const [tempoFrom, setTempoFrom] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [stage, setStage] = useState<Stage>('form')
  const [shared, setShared] = useState<Consultation | null>(null)
  const [dragging, setDragging] = useState(false)
  /** Cancel was pressed while uploading: the refusal that follows is not news. */
  const cancelling = useRef(false)
  const progress = useShareProgress()
  const copier = useCopy()
  const now = useNow(30_000)

  const free = Math.max(0, storage.limitBytes - storage.usedBytes)
  const tempo = bpm.trim() ? Number(bpm) : null
  const tempoValid =
    tempo === null || (Number.isFinite(tempo) && tempo >= MIN_BPM && tempo <= MAX_BPM)
  const editing = stage === 'form'

  /** Checks a file, then reads and surveys it; refused with the reason at the first thing wrong. */
  const admit = async (path: string): Promise<void> => {
    setProblem(null)
    setReading(true)
    try {
      const { size } = await window.candy.consultation.check(path)
      const payload = await window.candy.auditorium.read(path)
      const survey = await surveyTrack(payload)
      setChosen({ path: payload.path, name: payload.name, size, ...survey })
      if (!titleTyped) setTitle(stem(payload.name).slice(0, MAX_TITLE))

      const project = await projectHolding(payload.path).catch(() => null)
      setTempoFrom(project?.tempo ? project.name : null)
      if (!bpmTyped) setBpm(project?.tempo ? String(Math.round(project.tempo * 100) / 100) : '')
    } catch (cause) {
      setChosen(null)
      setProblem(reason(cause))
    } finally {
      setReading(false)
    }
  }

  const choose = async (): Promise<void> => {
    const path = await window.candy.shell.selectFile({
      title: 'Choose a track to share',
      filters: [{ name: 'Audio', extensions: [...AUDIO_EXTENSIONS] }]
    })
    if (path) await admit(path)
  }

  const share = async (): Promise<void> => {
    if (!chosen || !title.trim() || !tempoValid || reading) return
    cancelling.current = false
    setProblem(null)
    setStage('sending')
    try {
      const link = await window.candy.consultation.share({
        path: chosen.path,
        title: title.trim(),
        message: message.trim(),
        days,
        bpm: tempo,
        durationMs: chosen.durationMs,
        waveform: chosen.waveform
      })
      setShared(link)
      setStage('done')
    } catch (cause) {
      setStage('form')
      if (!cancelling.current) setProblem(reason(cause))
    }
  }

  const cancel = (): void => {
    if (stage === 'sending') {
      // Once the link is being opened it is too late: the upload is done.
      if (progress?.stage === 'uploading') {
        cancelling.current = true
        void window.candy.consultation.cancelShare()
      }
      return
    }
    onClose(shared)
  }

  const drop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragging(false)
    if (!editing || reading) return
    const file = event.dataTransfer.files[0]
    const path = file ? window.candy.strip.pathOf(file) : ''
    if (path) void admit(path)
  }

  if (stage === 'done' && shared) {
    return (
      <Dialog
        title="Shared"
        subtitle={shared.title}
        width="wide"
        confirmLabel="Done"
        canConfirm
        onConfirm={() => onClose(shared)}
        onCancel={() => onClose(shared)}
      >
        <div className={styles.share}>
          <p className={styles.sharedLine}>
            The link is open until {formatStamp(shared.expiresAt)}. Send it to whoever should hear
            it: they type their name, and nothing else.
          </p>
          {shared.link ? (
            <div className={styles.linkRow}>
              <span className={styles.url}>{shared.link}</span>
              <Button
                size="sm"
                variant="primary"
                onClick={() => copier.copy('link', shared.link as string)}
              >
                {copier.copied === 'link' ? 'Copied' : 'Copy link'}
              </Button>
            </div>
          ) : null}
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      title="Share a track"
      subtitle={`For feedback, on ${host(website)}`}
      width="wide"
      busy={stage === 'sending'}
      error={problem}
      confirmLabel="Share"
      canConfirm={chosen !== null && title.trim() !== '' && tempoValid && !reading}
      footnote={`Uploads the track to the website’s storage at Vercel (${formatBytes(free)} of ${formatBytes(
        storage.limitBytes,
        0
      )} free), then opens its link on ${host(website)}. When the link closes, the website deletes the track and all its feedback; its name stays here, marked EXPIRED.`}
      onConfirm={() => void share()}
      onCancel={cancel}
    >
      <div
        className={styles.share}
        onDragOver={(event) => {
          if (!editing) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setDragging(true)
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          setDragging(false)
        }}
        onDrop={drop}
      >
        <div className={styles.drop} data-dragging={dragging || undefined}>
          {chosen ? (
            <div className={styles.chosen}>
              <span className={styles.chosenName}>{chosen.name}</span>
              <span className={styles.chosenMeta}>
                {formatBytes(chosen.size)} · {formatClock(chosen.durationMs / 1000)}
              </span>
              <span className={styles.spacer} />
              <Button size="sm" busy={reading} disabled={!editing} onClick={() => void choose()}>
                Choose another…
              </Button>
            </div>
          ) : (
            <div className={styles.dropEmpty}>
              <span className={styles.dropLine}>
                {reading ? 'Reading the track…' : 'Drop a track here, or'}
              </span>
              <Button
                size="sm"
                variant="primary"
                busy={reading}
                disabled={!editing}
                onClick={() => void choose()}
              >
                Choose a file…
              </Button>
              <span className={styles.dropHint}>
                {AUDIO_EXTENSIONS.map((extension) => extension.toUpperCase()).join(', ')}, up to{' '}
                {formatBytes(MAX_TRACK_BYTES, 0)}. Any bounce on this machine; it need not be in the
                ARCHIVE.
              </span>
            </div>
          )}
        </div>

        {stage === 'sending' ? (
          <Meter
            value={
              progress?.stage === 'uploading' && progress.total > 0
                ? progress.sent / progress.total
                : null
            }
            label={progress?.stage === 'opening' ? 'Opening the link' : 'Uploading'}
            readout={
              progress?.stage === 'uploading'
                ? `${formatBytes(progress.sent)} of ${formatBytes(progress.total)}`
                : undefined
            }
            tone="gold"
          />
        ) : null}

        <div className={styles.dialogRow}>
          <TextInput
            label="Title"
            value={title}
            onChange={(value) => {
              setTitle(value)
              setTitleTyped(true)
            }}
            maxLength={MAX_TITLE}
            hint="What the page calls it."
            disabled={!editing}
          />
          <TextInput
            label="Tempo"
            value={bpm}
            onChange={(value) => {
              setBpm(value)
              setBpmTyped(true)
            }}
            placeholder="124"
            mono
            invalid={!tempoValid}
            hint={
              !tempoValid
                ? `Between ${MIN_BPM} and ${MAX_BPM} BPM, or empty.`
                : tempoFrom
                  ? `From ARCHIVE: ${tempoFrom}`
                  : 'BPM, so their sidechain lands on the beat. Optional.'
            }
            disabled={!editing}
          />
        </div>

        <DialogField
          label="Open for"
          hint={`Closes ${formatStamp(now + days * DAY_MS)}. It can be moved or ended early from CONSULTATION.`}
        >
          <DialogChips>
            {DAYS.map((count) => (
              <DialogChip
                key={count}
                on={days === count}
                label={`${count} DAY${count === 1 ? '' : 'S'}`}
                disabled={!editing}
                onClick={() => setDays(count)}
              />
            ))}
          </DialogChips>
        </DialogField>

        <TextArea
          label="What to listen for"
          value={message}
          onChange={setMessage}
          rows={3}
          maxLength={MAX_MESSAGE}
          placeholder="The low end in the second drop, and whether the vocal sits."
          hint="Shown above the track on the page. Optional."
          disabled={!editing}
        />
      </div>
    </Dialog>
  )
}

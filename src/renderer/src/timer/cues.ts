import type { TimerFrame, TimerId, TimerState } from '@shared/domain/timer'
import { CUE_FINAL_MS, CUE_ONE_MINUTE_MS, TIMER_KIND } from '@shared/domain/timer.constants'
import tickUrl from '@renderer/assets/audio/tick.mp3'
import intervalSpentUrl from '@renderer/assets/audio/interval-spent.wav'
import conveneSpentUrl from '@renderer/assets/audio/convene-spent.wav'

/**
 * Audio cues for the countdown timers.
 *
 * ### Warnings are synthesised; arrivals are played
 *
 * The two warning cues are still built from oscillators. They fire mid-run,
 * they have to read as an institutional chime rather than as music, and two
 * tones cost no bundle at all.
 *
 * What a countdown *reaches* is a different job, and the operator supplied
 * samples for it: a bass figure when a break runs out, a granular impact when a
 * stream is about to open. Those are stings, and a synthesised interval cannot
 * be one. The clock bed under a running timer is a sample for the same reason.
 *
 * All three are imported rather than fetched, so Vite fingerprints them into the
 * bundle and `media-src 'self'` in the console's CSP covers them. See the README
 * beside them in `assets/audio/`.
 *
 * ### Why they play in the console
 *
 * These have to reach the operator. An OBS browser source can be configured to
 * shut down when it is not visible, so a cue living in the overlay would be
 * silent exactly when a break timer is running behind a full-screen scene. The
 * console is always running and always audible, and keeping the audio out of
 * the overlay also means a stream-opening countdown is silent on the broadcast
 * without any special handling.
 */

export type TimerCue = 'minute' | 'final' | 'expired'

/** What each countdown plays when it arrives at zero. */
const SPENT_SAMPLE: Record<TimerId, string> = {
  interval: intervalSpentUrl,
  convene: conveneSpentUrl
}

/**
 * Cue voices.
 *
 * All three are two-oscillator intervals with a short percussive envelope, low
 * in the register so they read as an institutional chime rather than a
 * notification. Frequencies are a just-intonation fifth and octave apart, which
 * is what stops them sounding like a phone alert.
 */
const VOICES: Record<TimerCue, { tones: number[]; durationMs: number; gap: number; gain: number }> =
  {
    // One minute out: a calm low fifth, twice.
    minute: { tones: [220, 330], durationMs: 420, gap: 210, gain: 0.16 },
    // Final call: higher and insistent, three pips.
    final: { tones: [523.25, 523.25, 698.46], durationMs: 150, gap: 130, gain: 0.2 },
    // Spent: a descending octave, allowed to ring.
    expired: { tones: [330, 165], durationMs: 700, gap: 260, gain: 0.22 }
  }

let context: AudioContext | null = null

/**
 * Lazily creates the audio context.
 *
 * Created on first cue rather than at import: Chromium starts a context
 * suspended until a user gesture, and by the time a cue fires the operator has
 * pressed start, so resuming here succeeds.
 */
function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!context) {
    try {
      context = new AudioContext()
    } catch {
      return null
    }
  }
  if (context.state === 'suspended') void context.resume()
  return context
}

/**
 * Plays a one-shot sample.
 *
 * A fresh element per call rather than one kept and rewound, so a cue that
 * fires while the last one is still ringing does not cut it off. They are
 * short, and the browser reclaims them once they end.
 */
function playSample(url: string, volume: number): void {
  try {
    const audio = new Audio(url)
    audio.volume = volume
    void audio.play().catch(() => undefined)
  } catch {
    // Autoplay blocked, or no audio device. Not worth surfacing.
  }
}

/**
 * The clock under a running countdown.
 *
 * One element for the whole application, not one per timer. Both countdowns can
 * run at once, and two ticking beds beating against each other is noise rather
 * than twice the tension — so this is a single bed that plays while *any*
 * timer wants it.
 */
let tickAudio: HTMLAudioElement | null = null
let ticking = false

function setTicking(active: boolean): void {
  if (active === ticking) return
  ticking = active

  try {
    if (!tickAudio) {
      tickAudio = new Audio(tickUrl)
      tickAudio.loop = true
      tickAudio.volume = 0.35
    }

    if (active) {
      void tickAudio.play().catch(() => undefined)
    } else {
      tickAudio.pause()
      // Back to the top, so the next run starts on the beat rather than
      // wherever the last one happened to be stopped.
      tickAudio.currentTime = 0
    }
  } catch {
    // As above.
  }
}

/** Plays one cue. Failures are swallowed — a missed tone is not worth an error. */
export function playCue(cue: TimerCue, id: TimerId = 'interval'): void {
  /*
   * Arriving at zero is a sample, not an interval.
   *
   * Which one depends on the countdown: a break running out and a stream about
   * to open are different events and the operator chose a different sound for
   * each.
   */
  if (cue === 'expired') {
    playSample(SPENT_SAMPLE[id] ?? SPENT_SAMPLE.interval, 0.8)
    return
  }

  const ctx = audioContext()
  if (!ctx) return

  const voice = VOICES[cue]
  try {
    voice.tones.forEach((frequency, index) => {
      const at = ctx.currentTime + (index * (voice.durationMs + voice.gap)) / 1000
      const duration = voice.durationMs / 1000

      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()

      // Triangle: a sine reads as a test tone, a square as an alarm clock.
      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(frequency, at)

      // Fast attack, exponential decay — struck rather than faded in.
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(voice.gain, at + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)

      oscillator.connect(gain).connect(ctx.destination)
      oscillator.start(at)
      oscillator.stop(at + duration + 0.02)
    })
  } catch {
    // Autoplay blocked, or the context died with the device. Not worth surfacing.
  }
}

/**
 * Fires each cue once per run.
 *
 * Keyed by the run's start instant, so restarting a timer re-arms every cue
 * while merely pausing does not replay the ones already heard.
 */
export class TimerCueRunner {
  private readonly fired = new Map<string, Set<TimerCue>>()

  /** Which timers currently want the bed running. */
  private readonly wantsTick = new Map<TimerId, boolean>()

  /** Call on every tick with the current state and derived frame. */
  update(
    state: TimerState,
    frame: TimerFrame,
    emit: (cue: TimerCue, id: TimerId) => void = playCue
  ): void {
    /*
     * Recorded before the `sound` gate, deliberately.
     *
     * The bed answers to its own setting. An operator who has turned the chimes
     * off has said they do not want to be interrupted at the one-minute mark;
     * they have not said anything about whether a clock should be audible under
     * the countdown, and conflating the two would make one of the settings
     * unreachable.
     *
     * Grace counts as running: the clock is still going, which is the whole
     * point of hearing it.
     */
    this.wantsTick.set(
      state.id,
      state.config.tick && (frame.phase === 'running' || frame.phase === 'grace')
    )
    setTicking([...this.wantsTick.values()].some(Boolean))

    if (!state.config.sound) return

    const key = `${state.id}:${state.startedAt ?? 'idle'}`
    let seen = this.fired.get(key)
    if (!seen) {
      seen = new Set()
      this.fired.set(key, seen)
      // Only the runs still reachable matter; two keys is enough for a pause
      // and a resume of the same timer.
      if (this.fired.size > 8) {
        this.fired.delete([...this.fired.keys()][0])
      }
    }

    const fire = (cue: TimerCue): void => {
      if (seen.has(cue)) return
      seen.add(cue)
      emit(cue, state.id)
    }

    const running = frame.phase === 'running'

    /*
     * Cue points are skipped when the configured duration starts below them.
     * A ninety-second break would otherwise announce "one minute remaining"
     * thirty seconds in, and a ten-second timer would fire its final call
     * immediately on start.
     */
    if (
      running &&
      TIMER_KIND[state.id] === 'interval' &&
      state.config.durationMs > CUE_ONE_MINUTE_MS &&
      frame.remainingMs <= CUE_ONE_MINUTE_MS
    ) {
      fire('minute')
    }

    if (running && state.config.durationMs > CUE_FINAL_MS && frame.remainingMs <= CUE_FINAL_MS) {
      fire('final')
    }

    // Grace counts as still-running work, so the spent cue waits for the whole
    // budget — including the grace — to be gone.
    if (frame.phase === 'elapsed') fire('expired')
  }

  reset(): void {
    this.fired.clear()
    this.wantsTick.clear()
    setTicking(false)
  }
}

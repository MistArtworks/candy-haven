import type { TimerFrame, TimerState } from '@shared/domain/timer'
import { CUE_FINAL_MS, CUE_ONE_MINUTE_MS, TIMER_KIND } from '@shared/domain/timer.constants'

/**
 * Audio cues for the countdown timers.
 *
 * ### Why these are synthesised
 *
 * Three tones built from oscillators rather than three audio files. It costs no
 * bundle, nothing has to be fetched at runtime — which the console's CSP would
 * forbid anyway — and there is no artwork to keep in sync. It also happens to
 * suit an application about resonance: the cues are intervals, not samples.
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

/** Plays one cue. Failures are swallowed — a missed tone is not worth an error. */
export function playCue(cue: TimerCue): void {
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

  /** Call on every tick with the current state and derived frame. */
  update(state: TimerState, frame: TimerFrame, emit: (cue: TimerCue) => void = playCue): void {
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
      emit(cue)
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
  }
}

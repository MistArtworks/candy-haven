import type { AudioPayload } from '@shared/domain/auditorium'
import type { ConsultationFeedback } from '@shared/domain/consultation'
import {
  chainIsEmpty,
  compactPeaks,
  deviceIsNeutral,
  encodeWaveform,
  formatSpan,
  type Chain,
  type Device,
  type Note
} from '@shared/consult/engine'
import type { Tools } from '@shared/consult/audio'
import { surveyPeaks } from '@renderer/features/auditorium/lib/survey'

/*
 * What the share dialog learns about a track before it is sent, and what
 * a producer's page asks of their notes and tools.
 */

/** How long a track is, and its waveform compacted for the page (engine/peaks.ts). */
export interface TrackSurvey {
  durationMs: number
  waveform: string
}

/**
 * Decodes a track and surveys it, as AUDITORIUM does for its overview,
 * then brings the survey down to the columns the page draws. Decoded on a
 * context that never plays, so no audio device is opened for it.
 */
export async function surveyTrack(payload: AudioPayload): Promise<TrackSurvey> {
  const context = new OfflineAudioContext(1, 1, 44_100)
  // A copy: decoding detaches the buffer it is given.
  const decoded = await context.decodeAudioData(payload.bytes.slice().buffer as ArrayBuffer)
  return {
    durationMs: Math.max(1, Math.round(decoded.duration * 1000)),
    waveform: encodeWaveform(compactPeaks(surveyPeaks(decoded)))
  }
}

/** `Menace (v3).wav` → `Menace (v3)`. */
export function stem(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

const folded = (path: string): string => path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()

/**
 * The ARCHIVE project a file sits inside, if it sits inside one: the
 * deepest project folder holding it, since a project can hold a bounce in
 * a subfolder. Its tempo fills in the dialog's BPM.
 */
export async function projectHolding(
  path: string
): Promise<{ name: string; tempo: number | null } | null> {
  const registry = await window.candy.projects.registry({})
  const file = folded(path)
  const holding = registry.projects
    .filter((project) => file.startsWith(`${folded(project.path)}\\`))
    .sort((a, b) => b.path.length - a.path.length)
  return holding[0] ? { name: holding[0].name, tempo: holding[0].tempo } : null
}

/** A producer's tools, to hear their feedback through: their sections' and the whole track's. */
export function toolsOf(feedback: ConsultationFeedback): Tools {
  return { notes: feedback.notes, chain: feedback.chain }
}

/** Whether a producer put any tools on at all, so there is anything to A/B. */
export function hasTools(feedback: ConsultationFeedback): boolean {
  return !chainIsEmpty(feedback.chain) || feedback.notes.some((note) => !chainIsEmpty(note.chain))
}

/** What tools are put on: the whole track, or one section (by its note's id). */
export const WHOLE = 'whole'

/** Somewhere a producer put tools, as the page's chips offer it. */
export interface ToolScope {
  /** `WHOLE`, or the section's note id. */
  id: string
  label: string
  chain: Chain
}

/** Where a producer put tools: the whole track first, then each section, in order. */
export function scopesOf(feedback: ConsultationFeedback): ToolScope[] {
  const scopes: ToolScope[] = []
  if (feedback.chain && !chainIsEmpty(feedback.chain)) {
    scopes.push({ id: WHOLE, label: 'Whole track', chain: feedback.chain })
  }
  for (const note of [...feedback.notes].sort((a, b) => a.at - b.at)) {
    if (note.end !== null && note.chain && !chainIsEmpty(note.chain)) {
      scopes.push({ id: note.id, label: formatSpan(note.at, note.end), chain: note.chain })
    }
  }
  return scopes
}

/** The devices in a chain doing something to the sound: an EQ with no points doesn't count. */
export const shapingDevices = (chain: Chain | null): Device[] =>
  (chain?.devices ?? []).filter((device) => !deviceIsNeutral(device))

/** One device in one place: `whole:<device id>`, `<note id>:<device id>`. */
export const pluginKey = (scope: string, deviceId: string): string => `${scope}:${deviceId}`

/** Switches flipped here, by `pluginKey`: whether that device is heard now. */
export type Flips = ReadonlyMap<string, boolean>

/** Whether a device is heard: as the producer left it, unless flipped here. */
export const isHeard = (flips: Flips, scope: string, device: Device): boolean =>
  flips.get(pluginKey(scope, device.id)) ?? device.on

/**
 * A producer's tools with the switches flipped here, to hear what each
 * device does. What they sent is not changed. A section left with nothing
 * heard drops its chain, so the graph has no idle slot for it.
 */
export function heardTools(feedback: ConsultationFeedback, flips: Flips): Tools {
  if (flips.size === 0) return toolsOf(feedback)
  const apply = (chain: Chain | null, scope: string): Chain | null => {
    if (!chain) return null
    const devices = chain.devices.map((device) => ({
      ...device,
      on: isHeard(flips, scope, device)
    }))
    return devices.some((device) => device.on) ? { devices } : null
  }
  return {
    notes: feedback.notes.map((note) => ({ ...note, chain: apply(note.chain, note.id) })),
    chain: apply(feedback.chain, WHOLE)
  }
}

/** The note a moment on the track falls on: a pin near it, else the shortest section around it. */
export function noteAt(notes: readonly Note[], seconds: number, reach: number): Note | undefined {
  const pin = notes.find((note) => note.end === null && Math.abs(note.at - seconds) <= reach)
  if (pin) return pin
  return notes
    .filter((note) => note.end !== null && seconds >= note.at && seconds < note.end)
    .sort((a, b) => (a.end ?? 0) - a.at - ((b.end ?? 0) - b.at))[0]
}

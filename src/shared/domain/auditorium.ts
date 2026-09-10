import { z } from 'zod'

/**
 * AUDITORIUM — the listening room.
 *
 * One file at a time, played and rendered visible. There is no library and no
 * queue here on purpose: the ARCHIVE is where audio is catalogued, and a second
 * register of the same material would immediately disagree with it. This
 * department answers one question — what does this file sound like, and what
 * does it look like while it does.
 */

/** What Chromium will decode, which is the real constraint on what can be opened. */
export const AUDIO_EXTENSIONS = ['wav', 'mp3', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'webm'] as const

/**
 * Largest file admitted, in bytes.
 *
 * The file is handed to the renderer whole rather than streamed, because every
 * preset needs random access to it — seeking, and the analyser reading ahead of
 * the playhead. 512 MB is comfortably above any master an operator would open
 * (a 24/96 stereo hour is roughly 2 GB, which is a session file, not a listen)
 * and safely below the point where a copy in the renderer becomes a problem.
 */
export const MAX_AUDIO_BYTES = 512 * 1024 * 1024

/**
 * Media type per extension.
 *
 * Load-bearing, not decoration. The file reaches the element as a blob URL, and
 * for a blob the type carried on the Blob *is* the media type — Chromium does
 * not sniff the bytes the way it does for a network response. Handing it
 * `application/octet-stream` produces a file that loads, reports its size, and
 * then fails to decode with no further explanation, which is exactly what
 * happened before this map existed.
 */
export const AUDIO_MIME: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  // Opus is carried in an Ogg container; naming the codec helps Chromium pick
  // a decoder without probing.
  opus: 'audio/ogg; codecs=opus',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  webm: 'audio/webm'
}

/** The media type for a lowercase, dotless extension. */
export function audioMimeFor(extension: string): string {
  return AUDIO_MIME[extension] ?? 'audio/mpeg'
}

export const AUDIO_PRESETS = ['waveform', 'spectrum', 'spectral', 'static'] as const
export const AudioPresetSchema = z.enum(AUDIO_PRESETS)
export type AudioPreset = z.infer<typeof AudioPresetSchema>

export interface AudioPresetDefinition {
  id: AudioPreset
  label: string
  /** What the render actually draws, in a line. */
  purpose: string
  /** The longer description shown under the preset rail. */
  detail: string
  /**
   * Whether the render needs the file decoded before it can draw anything.
   *
   * Only the overview does. The two live renders read the analyser, which is
   * fed by playback, so they are ready the moment the transport starts —
   * whereas an overview of the whole file cannot exist until the whole file
   * has been decoded, and the room says so rather than drawing a blank stage.
   */
  needsDecode: boolean
}

export const AUDIO_PRESET: Record<AudioPreset, AudioPresetDefinition> = {
  waveform: {
    id: 'waveform',
    label: 'WAVEFORM',
    purpose: 'The whole file, end to end',
    detail:
      'The file decoded and surveyed: peak amplitude per column across its entire length, mirrored about the axis. The played portion is lit and the rest held back, so the shape of the arrangement and the position in it are one reading. Click anywhere on it to move the playhead.',
    needsDecode: true
  },
  spectrum: {
    id: 'spectrum',
    label: 'SPECTRUM',
    purpose: 'Frequency content, as it passes',
    detail:
      'Frequency domain, on a logarithmic axis so an octave occupies the same width wherever it falls — bass on the left, air on the right. The filled body is the smoothed reading and the line above it the instantaneous one; where they part is a transient.',
    needsDecode: false
  },
  spectral: {
    id: 'spectral',
    label: 'SPECTRAL',
    purpose: 'Frequency against time, scrolling',
    detail:
      'A spectrogram. Each column is one moment of the spectrum, low frequencies at the bottom, brightness standing for level — so the last half-minute of the mix is legible at once and a stack of harmonics reads as a stack. Built from playback, so it fills as the file runs.',
    needsDecode: false
  },
  static: {
    id: 'static',
    label: 'STATIC',
    purpose: 'The mark alone, unmoved by the signal',
    detail:
      'No analysis. The mark holds and breathes on its own clock, lit by the transport but not driven by it — for when the console is on a second screen and the movement is a distraction.',
    needsDecode: false
  }
}

export const AUDIO_PRESET_LIST = AUDIO_PRESETS.map((id) => AUDIO_PRESET[id])

/** A file admitted to the room, with its contents. */
export const AudioPayloadSchema = z.object({
  path: z.string(),
  /** Basename with extension, as the operator would recognise it. */
  name: z.string(),
  /** Lowercase, no dot. Empty when the file has none. */
  extension: z.string(),
  size: z.number().int().nonnegative(),
  /** Last modified, as a millisecond timestamp. */
  modifiedAt: z.number(),
  bytes: z.instanceof(Uint8Array)
})
export type AudioPayload = z.infer<typeof AudioPayloadSchema>

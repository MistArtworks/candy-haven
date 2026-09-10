/**
 * Zod-free half of the volumes domain — see projects.constants.ts for why the
 * split exists.
 */

/**
 * A VOLUME is a named group of tracks: an album, an EP or a compilation.
 *
 * It is **metadata only**. No directory is created for it and nothing moves on
 * disk when a track joins or leaves one, which is the distinguishing decision
 * of this whole feature and worth stating plainly.
 *
 * The reasoning: a track's place on disk is already spoken for by the shelf it
 * is filed on — `EDM/Melodic Bass/` — and that filing is what the genre tree,
 * the scan reconciliation and the operator's own Explorer habits all depend on.
 * Making an album a second real directory would force every track to be in two
 * places at once and put the two hierarchies permanently at war. A track can
 * belong to a genre *and* an album because only one of those is a location.
 */
export const VOLUME_KINDS = ['album', 'ep', 'compilation'] as const
export type VolumeKind = (typeof VOLUME_KINDS)[number]

export const VOLUME_KIND_LABEL: Record<VolumeKind, string> = {
  album: 'ALBUM',
  ep: 'EP',
  compilation: 'COMPILATION'
}

export const VOLUME_KIND_PURPOSE: Record<VolumeKind, string> = {
  album: 'A full-length body of work.',
  ep: 'A short set, usually three to six tracks.',
  compilation: 'Tracks gathered from elsewhere under one banner.'
}

/**
 * Indicative track counts, used only to phrase an advisory on the volume tile.
 *
 * Nothing is enforced. An EP with nine tracks is unusual, not invalid, and the
 * app has no business refusing the operator's own description of their work.
 */
export const VOLUME_KIND_TYPICAL_TRACKS: Record<VolumeKind, { min: number; max: number }> = {
  album: { min: 7, max: 24 },
  ep: { min: 2, max: 6 },
  compilation: { min: 4, max: 40 }
}

export const MAX_VOLUME_TITLE_LENGTH = 120

export interface VolumeTitleVerdict {
  ok: boolean
  reason: string | null
}

/**
 * Checked in the dialog before a round trip, and again in the service on the
 * way in — the renderer is not trusted to have asked.
 *
 * Far looser than `validateFolderName`: a volume never becomes a directory, so
 * none of the filesystem's rules about colons, trailing dots or device names
 * apply to it. A compilation may perfectly well be called `AUX: VOL. 2`.
 */
export function validateVolumeTitle(title: string): VolumeTitleVerdict {
  const trimmed = title.trim()

  if (trimmed.length === 0) return { ok: false, reason: 'A volume needs a title.' }
  if (trimmed.length > MAX_VOLUME_TITLE_LENGTH) {
    return { ok: false, reason: `Keep the title under ${MAX_VOLUME_TITLE_LENGTH} characters.` }
  }

  return { ok: true, reason: null }
}

import type { EqPalette, SpectrumPalette, WaveformPalette } from '@shared/consult/audio'

/*
 * The console's colours for the drawings the website's page makes too
 * (`src/shared/consult/audio/draw.ts` takes its colours from its caller).
 * Canvas can't read CSS custom properties, so these are the theme's values
 * (`styles/base/_theme.scss`) written out: the ramp from crimson-500 where
 * the low end carries a column to gold-300 where the top does, the same
 * ramp AUDITORIUM's overview is coloured by.
 */

export const WAVEFORM_PALETTE: WaveformPalette = {
  low: [163, 43, 35],
  high: [210, 169, 97],
  rest: 0.32,
  played: 0.95,
  section: 'rgba(210, 169, 97, 0.08)',
  sectionActive: 'rgba(210, 169, 97, 0.22)',
  pin: 'rgba(210, 169, 97, 0.7)',
  pinActive: '#e3c286',
  marking: 'rgba(227, 194, 134, 0.2)',
  playhead: '#ddcfb2'
}

export const EQ_PALETTE: EqPalette = {
  grid: 'rgba(182, 158, 124, 0.12)',
  label: '#5a544a',
  font: '9px "Cascadia Mono", Consolas, monospace',
  curve: '#d2a961',
  area: 'rgba(210, 169, 97, 0.1)',
  point: '#b98b47',
  pointActive: '#e3c286'
}

/** The track sounding behind the EQ, faint, so the curve reads over it. */
export const SPECTRUM_PALETTE: SpectrumPalette = {
  fill: 'rgba(182, 158, 124, 0.08)',
  line: 'rgba(182, 158, 124, 0.25)'
}

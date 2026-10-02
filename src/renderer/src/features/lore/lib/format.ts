/** A short readout for a slider: whole numbers whole, the rest to two places. */
export function readout(value: number, unit = ''): string {
  const shown = Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  return `${shown}${unit}`
}

/** When something happened, as the console says it elsewhere: "2h ago". */
export { formatRelative } from '@renderer/features/dispatch/lib/present'

/** Who did it, as DISPATCH names them. */
export function whoLabel(who: string): string {
  if (who === 'mist') return 'MIST'
  if (who === 'candy') return 'CANDY'
  return who ? 'SOMEONE ELSE' : ''
}

/** An ISO date from the website as a time, or 0 when it isn't one. */
export const timeOf = (iso: string): number => Date.parse(iso) || 0

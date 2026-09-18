/**
 * Initials for a name, for a plate with no picture behind it.
 *
 * Two characters at most. A three-word alias reduced to three letters reads
 * as an acronym for something rather than as a stand-in for a photograph.
 *
 * Its own module rather than a second export from `Plate.tsx`: a file that
 * exports both a component and a helper breaks fast refresh, so the helper
 * moves out. Same rule the react-refresh lint applies everywhere here.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

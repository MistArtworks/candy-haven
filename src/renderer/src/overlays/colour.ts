/**
 * Colour arithmetic shared by the overlay renderers.
 *
 * Extracted rather than duplicated when THE CONCORD arrived and needed the same
 * helper the ring already had. It is twelve lines, so copying it would have been
 * easy — and would have meant two implementations of the one function that
 * decides whether a colour token silently paints nothing.
 */

/**
 * `#rrggbb` -> `rgba(r, g, b, a)`.
 *
 * Functional colours are returned untouched rather than mangled. The theme's
 * line tokens are already `rgba()` literals, and the alternative — string
 * concatenation onto something that is not a hex triple — produces an invalid
 * style that canvas discards without complaint, so the affected marks simply
 * stop appearing and nothing says why.
 */
export function withAlpha(colour: string, alpha: number): string {
  const hex = colour.trim()
  if (!hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) {
    return hex
  }
  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex
  const r = parseInt(full.slice(1, 3), 16)
  const g = parseInt(full.slice(3, 5), 16)
  const b = parseInt(full.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
}

/**
 * Reads a CSS custom property chain off an element, first literal value wins.
 *
 * Only literal values are accepted. `--ch-accent` and friends are `var()`
 * chains, and relying on computed-value resolution of nested custom properties
 * is not worth the risk in a renderer that has to be right on a broadcast;
 * every property either renderer reads resolves to a hex or an rgba literal.
 */
export function readCustomProperty(
  styles: CSSStyleDeclaration,
  names: readonly string[],
  fallback: string
): string {
  for (const name of names) {
    const value = styles.getPropertyValue(name).trim()
    if (value.length > 0 && !value.includes('var(')) return value
  }
  return fallback
}

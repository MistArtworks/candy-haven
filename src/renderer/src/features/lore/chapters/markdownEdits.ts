/*
 * The formatting bar's edits, as plain functions of the text and what's
 * selected: each answers with the stretch of text to replace, what goes in
 * its place, and what's selected after. The editor applies them through
 * the browser's own typing (so Ctrl+Z undoes them like anything typed),
 * and they only ever write what the lore's reader understands:
 *
 *   **strong**   *accent*   ## heading   - list   - **Term**: entry   > quote
 *
 * Toggles, as in a word processor: pressing Bold on bold text takes it off.
 */

export interface Range {
  start: number
  end: number
}

export interface Edit {
  from: number
  to: number
  insert: string
  select: Range
}

export type LineStyle = 'heading' | 'bullet' | 'entry' | 'quote'

export interface Active {
  bold: boolean
  italic: boolean
  style: LineStyle | null
}

const caret = (at: number): Range => ({ start: at, end: at })

const HEADING = /^#{1,6}[ \t]+/
const QUOTE = /^>[ \t]?/
const BULLET = /^([-*+])[ \t]+/
const PREFIX = /^(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+)/
/** `- **Term**: text`, `- **Term** – text`, or `- **Term:** text`. */
const ENTRY_AFTER = /^[-*+][ \t]+\*\*([^*\n]+?)\*\*[ \t]*(?::|[—–-])[ \t]?/
const ENTRY_INSIDE = /^[-*+][ \t]+\*\*([^*\n]+?):\*\*[ \t]?/

/** The term an entry line opens with, and its text. */
function entryOf(line: string): { term: string; rest: string } | null {
  const match = ENTRY_AFTER.exec(line) ?? ENTRY_INSIDE.exec(line)
  return match ? { term: match[1].trim(), rest: line.slice(match[0].length) } : null
}

export function styleOf(line: string): LineStyle | null {
  if (HEADING.test(line)) return 'heading'
  if (QUOTE.test(line)) return 'quote'
  if (entryOf(line)) return 'entry'
  if (BULLET.test(line)) return 'bullet'
  return null
}

/** A line's words without its line style: an entry gives back "Term: text". */
function contentOf(line: string): string {
  const entry = entryOf(line)
  if (entry) return entry.rest ? `${entry.term}: ${entry.rest}` : entry.term
  return line.replace(PREFIX, '')
}

function styled(content: string, style: LineStyle): string {
  switch (style) {
    case 'heading':
      return `## ${content}`
    case 'quote':
      return `> ${content}`
    case 'bullet':
      return `- ${content}`
    case 'entry': {
      const colon = content.indexOf(':')
      return colon > 0
        ? `- **${content.slice(0, colon).trim()}**: ${content.slice(colon + 1).trim()}`
        : `- **${content.trim()}**: `
    }
  }
}

/** The line a position is on. */
function lineAt(text: string, at: number): Range {
  const start = text.lastIndexOf('\n', at - 1) + 1
  const end = text.indexOf('\n', at)
  return { start, end: end === -1 ? text.length : end }
}

/** The whole lines a selection touches. One that ends where a line starts leaves that line out. */
function linesOf(text: string, selection: Range): Range {
  const start = text.lastIndexOf('\n', selection.start - 1) + 1
  const last =
    selection.end > selection.start && text[selection.end - 1] === '\n'
      ? selection.end - 1
      : selection.end
  const end = text.indexOf('\n', last)
  return { start, end: end === -1 ? text.length : end }
}

// ----------------------------------------------------------------- inline

const WORD = /[\p{L}\p{N}'’_-]/u

const starsBefore = (text: string, at: number): number => {
  let count = 0
  while (at - count - 1 >= 0 && text[at - count - 1] === '*') count++
  return count
}

const starsAfter = (text: string, at: number): number => {
  let count = 0
  while (at + count < text.length && text[at + count] === '*') count++
  return count
}

/** Whether runs of asterisks either side make the marker: `**` takes two, `*` an odd count. */
function wraps(before: number, after: number, marker: string): boolean {
  return marker === '**' ? before >= 2 && after >= 2 : before % 2 === 1 && after % 2 === 1
}

/** One line's words wrapped in a marker, or unwrapped when they already are. */
function toggleWrap(content: string, marker: string, on: boolean): string {
  const m = marker.length
  if (on) return content.slice(m, content.length - m)
  return content.trim() ? `${marker}${content}${marker}` : content
}

const isWrapped = (content: string, marker: string): boolean =>
  content.length > marker.length * 2 &&
  wraps(starsAfter(content, 0), starsBefore(content, content.length), marker)

/**
 * Bold (`**`) or accent (`*`). With nothing selected it takes the word under
 * the caret, or puts in a placeholder to type over. Across several lines
 * it does each line's words, leaving list marks and the like outside.
 */
export function toggleInline(text: string, selection: Range, marker: '**' | '*'): Edit {
  let { start, end } = selection
  const m = marker.length

  if (start === end) {
    let from = start
    let to = end
    while (from > 0 && WORD.test(text[from - 1])) from--
    while (to < text.length && WORD.test(text[to])) to++
    if (from === to) {
      const placeholder = marker === '**' ? 'strong words' : 'accent words'
      return {
        from: start,
        to: end,
        insert: `${marker}${placeholder}${marker}`,
        select: { start: start + m, end: start + m + placeholder.length }
      }
    }
    start = from
    end = to
  }

  if (text.slice(start, end).includes('\n')) {
    const block = linesOf(text, { start, end })
    const lines = text.slice(block.start, block.end).split('\n')
    const parts = lines.map((line) => {
      const prefix = PREFIX.exec(line)?.[0] ?? ''
      return { prefix, content: line.slice(prefix.length) }
    })
    const filled = parts.filter((part) => part.content.trim())
    const on = filled.length > 0 && filled.every((part) => isWrapped(part.content, marker))
    const insert = parts
      .map((part) => part.prefix + toggleWrap(part.content, marker, on))
      .join('\n')
    return {
      from: block.start,
      to: block.end,
      insert,
      select: { start: block.start, end: block.start + insert.length }
    }
  }

  // A word processor's selection often takes a space either side; markers don't.
  while (start < end && /\s/.test(text[start])) start++
  while (end > start && /\s/.test(text[end - 1])) end--
  const inner = text.slice(start, end)

  if (wraps(starsBefore(text, start), starsAfter(text, end), marker)) {
    return {
      from: start - m,
      to: end + m,
      insert: inner,
      select: { start: start - m, end: end - m }
    }
  }
  if (isWrapped(inner, marker)) {
    const stripped = inner.slice(m, inner.length - m)
    return {
      from: start,
      to: end,
      insert: stripped,
      select: { start, end: start + stripped.length }
    }
  }
  return {
    from: start,
    to: end,
    insert: `${marker}${inner}${marker}`,
    select: { start: start + m, end: end + m }
  }
}

// ------------------------------------------------------------------ lines

/**
 * A heading, a list, entries or a quote, for every line the selection
 * touches; or back to plain text when they all already are. On an empty
 * line it starts one, ready to type into.
 */
export function toggleLines(text: string, selection: Range, style: LineStyle): Edit {
  const block = linesOf(text, selection)
  const lines = text.slice(block.start, block.end).split('\n')
  const filled = lines.filter((line) => line.trim())

  if (!filled.length) {
    if (style === 'entry') {
      return {
        from: block.start,
        to: block.end,
        insert: '- **Term**: ',
        select: { start: block.start + 4, end: block.start + 8 }
      }
    }
    const insert = styled('', style)
    return { from: block.start, to: block.end, insert, select: caret(block.start + insert.length) }
  }

  const on = filled.every((line) => styleOf(line) === style)
  const insert = lines
    .map((line) => (!line.trim() ? line : on ? contentOf(line) : styled(contentOf(line), style)))
    .join('\n')

  if (selection.start === selection.end && lines.length === 1) {
    const at = selection.start + (insert.length - lines[0].length)
    const clamped = Math.min(block.start + insert.length, Math.max(block.start, at))
    return { from: block.start, to: block.end, insert, select: caret(clamped) }
  }
  return {
    from: block.start,
    to: block.end,
    insert,
    select: { start: block.start, end: block.start + insert.length }
  }
}

/** Plain text again: no line styles, no bold, no accent, on every line the selection touches. */
export function clearFormatting(text: string, selection: Range): Edit {
  const block = linesOf(text, selection)
  const insert = text
    .slice(block.start, block.end)
    .split('\n')
    .map((line) =>
      contentOf(line)
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
    )
    .join('\n')
  return {
    from: block.start,
    to: block.end,
    insert,
    select: { start: block.start, end: block.start + insert.length }
  }
}

// ------------------------------------------------------------------ Enter

/**
 * What Enter does, a word processor's way, or null to leave it to the text
 * box. In a list it starts the next item, and on an empty item it ends the
 * list. Anywhere else it starts a new paragraph (a blank line, which is
 * what markdown reads as one); Shift+Enter, left alone, breaks the line.
 */
export function onEnter(text: string, selection: Range): Edit | null {
  if (selection.start !== selection.end) return null
  const at = selection.start
  const line = lineAt(text, at)
  const current = text.slice(line.start, line.end)
  const atEnd = at === line.end

  // The blank line after a list ends it, so what's typed next isn't read into its last item.
  const endList: Edit = {
    from: line.start,
    to: line.end,
    insert: '\n',
    select: caret(line.start + 1)
  }

  const entry = entryOf(current)
  if (entry) {
    if (!entry.rest.trim() && (!entry.term || entry.term === 'Term')) return endList
    if (!atEnd) return null
    return {
      from: at,
      to: at,
      insert: '\n- **Term**: ',
      select: { start: at + 5, end: at + 9 }
    }
  }

  const bullet = BULLET.exec(current)
  if (bullet) {
    if (!current.slice(bullet[0].length).trim()) return endList
    return { from: at, to: at, insert: `\n${bullet[1]} `, select: caret(at + 3) }
  }

  // An empty heading or quote mark: Enter takes it away.
  if (/^(?:#{1,6}|>)[ \t]*$/.test(current)) {
    return { from: line.start, to: line.end, insert: '', select: caret(line.start) }
  }
  if (!current.trim()) return null
  return { from: at, to: at, insert: '\n\n', select: caret(at + 2) }
}

// ----------------------------------------------------------------- state

/** What the caret sits in, so the bar can show it pressed. */
export function activeAt(text: string, selection: Range): Active {
  const line = lineAt(text, selection.start)
  const current = text.slice(line.start, line.end)
  const prefix = PREFIX.exec(current)?.[0].length ?? 0
  const before = text.slice(line.start + prefix, Math.max(line.start + prefix, selection.start))
  const pairs = (before.match(/\*\*/g) ?? []).length
  const singles = (before.replace(/\*\*/g, '').match(/\*/g) ?? []).length
  const wrapped = (marker: string): boolean =>
    selection.end > selection.start &&
    wraps(starsBefore(text, selection.start), starsAfter(text, selection.end), marker)
  return {
    bold: pairs % 2 === 1 || wrapped('**'),
    italic: singles % 2 === 1 || wrapped('*'),
    style: styleOf(current)
  }
}

/** Words, as a writer counts them: markdown's marks aren't words. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length
}

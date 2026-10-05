/**
 * The Markdown the CATECHISM is written in.
 *
 * A deliberately small, explicitly documented subset — not a general parser.
 * Every byte it reads was authored in this repository and is compiled into the
 * bundle by Vite, so there is no untrusted input and nothing to sanitise; what
 * it needs to be is *predictable to write against*, because the whole point of
 * keeping the documentation in Markdown is that changing a sentence should not
 * mean touching a component.
 *
 * Related but separate: `ReleaseNotice` parses release notes, which arrive off
 * the network in two shapes (raw Markdown from the GitHub API, rendered HTML
 * from electron-updater) and only ever use three block kinds. Merging the two
 * would mean this module carrying an HTML path it never takes, and that one
 * carrying tables and fenced code no changelog writes. They are duplicates only
 * in the sense that both read a line and ask what it is.
 *
 * ## Supported syntax
 *
 * - `#`, `##`, `###` — headings, levels 1 to 3.
 * - `-` or `*` — a bullet.
 * - `1.` — a numbered step. Counted from the run, not from what was typed.
 * - `>` — a callout.
 * - A fence of three backticks, optionally followed by a language — code.
 * - `![alt](file.png)` — a screenshot, resolved against assets/guide.
 * - A pipe row followed by a `|---|` rule — a table.
 * - A blank line — the break between blocks.
 *
 * Inline, within any text: backticks for code, double asterisks for bold, and
 * `[label](target)` for a link.
 *
 * Anything unrecognised is kept as a paragraph rather than dropped, so a line
 * written in some shape this does not know still reaches the page.
 */

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'ordered'; text: string; index: number }
  | { kind: 'code'; text: string; lang: string | null }
  | { kind: 'note'; text: string }
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'table'; head: string[]; rows: string[][] }

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string }

const IMAGE = /^!\[([^\]]*)\]\(([^)]+)\)$/
const ORDERED = /^(\d+)\.\s+(.*)$/
const FENCE = /^```\s*([A-Za-z0-9+-]*)\s*$/

/** Splits a table row on pipes, dropping the leading and trailing one. */
function cells(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

/** True for the rule under a header row, which is what marks a table a table. */
function isTableRule(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-')
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []

  // Paragraph text accumulates across lines so a sentence wrapped at 100
  // columns in the source reads as one paragraph on the page.
  let paragraph: string[] = []
  let ordinal = 0
  /**
   * Whether a numbered list is still running. It survives blank lines, a
   * picture or an indented line inside a step, so "1. … picture … 2." counts
   * on rather than starting again at one; a heading, a bullet or a paragraph
   * at the margin ends it.
   */
  let inList = false
  /** The number the last step was typed with: a new "1." after "3." is a new list. */
  let lastTyped = 0
  /**
   * The bullet, step or callout whose next line, with no blank line between,
   * is the rest of it. Without this a wrapped item broke in two, its second
   * line drawn as a paragraph of its own.
   */
  let open: { kind: 'bullet' | 'ordered' | 'note'; text: string } | null = null

  const flush = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
      paragraph = []
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]
    const line = raw.trim()
    const indented = /^\s/.test(raw)

    if (!line) {
      flush()
      open = null
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      flush()
      open = null
      if (!indented) inList = false
      const lang = fence[1] || null
      const body: string[] = []
      index += 1
      // Consumed to the closing fence, or to the end of the file if the author
      // forgot one — an unterminated block should still render as code.
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        body.push(lines[index])
        index += 1
      }
      blocks.push({ kind: 'code', text: body.join('\n'), lang })
      continue
    }

    if (line.startsWith('#')) {
      flush()
      open = null
      inList = false
      ordinal = 0
      const hashes = /^#+/.exec(line)?.[0].length ?? 1
      blocks.push({
        kind: 'heading',
        level: Math.min(hashes, 3) as 1 | 2 | 3,
        text: line.replace(/^#+\s*/, '')
      })
      continue
    }

    const image = IMAGE.exec(line)
    if (image) {
      flush()
      open = null
      blocks.push({ kind: 'image', alt: image[1], src: image[2] })
      continue
    }

    // A table is recognised from its *second* line, so the header row is still
    // in hand when the rule below it confirms what the block is.
    if (line.startsWith('|') && index + 1 < lines.length && isTableRule(lines[index + 1])) {
      flush()
      open = null
      if (!indented) inList = false
      const head = cells(line)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(cells(lines[index].trim()))
        index += 1
      }
      // The loop above stops *on* the first line that is not a row; step back
      // so the outer loop reads it rather than skipping it.
      index -= 1
      blocks.push({ kind: 'table', head, rows })
      continue
    }

    if (line.startsWith('> ') || line === '>') {
      // A callout wrapped over several `>` lines is one callout. A bare `>`
      // is its blank line, and the next `>` line starts another.
      if (open?.kind === 'note' && line !== '>') {
        open.text += ` ${line.slice(2)}`
        continue
      }
      flush()
      if (!indented) inList = false
      if (line === '>') {
        open = null
        continue
      }
      const note = { kind: 'note' as const, text: line.slice(2) }
      blocks.push(note)
      open = note
      continue
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      flush()
      inList = false
      ordinal = 0
      const bullet = { kind: 'bullet' as const, text: line.slice(2) }
      blocks.push(bullet)
      open = bullet
      continue
    }

    const ordered = ORDERED.exec(line)
    if (ordered) {
      flush()
      // Numbered from the document's own run rather than from what was typed,
      // so a list whose source is all "1." still counts up on the page. A
      // "1." after a step typed higher is a new list, and starts at one.
      const typed = Number(ordered[1])
      const fresh = !inList || (typed === 1 && lastTyped > 1)
      ordinal = fresh ? 1 : ordinal + 1
      lastTyped = typed
      inList = true
      const step = { kind: 'ordered' as const, text: ordered[2], index: ordinal }
      blocks.push(step)
      open = step
      continue
    }

    // The rest of the item above it, wrapped onto this line.
    if (open) {
      open.text += ` ${line}`
      continue
    }

    if (!indented) inList = false
    paragraph.push(line)
  }

  flush()
  return blocks
}

/*
 * Ordered, and the order is load-bearing: `**` has to be tried before `_`, and
 * code before either, or a token gets found inside another one.
 *
 * The underscore form is guarded on both sides against word characters, because
 * Prettier normalises emphasis to underscores when it formats these documents —
 * so the parser has to read what Prettier writes — and a document that quotes
 * identifiers would otherwise turn `snake_case_name` into emphasis.
 */
const INLINE =
  /(`[^`]+`|\*\*[^*]+\*\*|(?<![A-Za-z0-9_])_[^_\n]+_(?![A-Za-z0-9_])|\[[^\]]+\]\([^)]+\))/g

/**
 * Splits one block's text into runs.
 *
 * Matched with a single alternation rather than nested passes so a token cannot
 * be found inside another one — bold written inside backticks stays literal,
 * which matters in a document that quotes syntax at the reader.
 */
export function parseInline(text: string): Inline[] {
  const runs: Inline[] = []
  let cursor = 0

  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0
    if (at > cursor) runs.push({ kind: 'text', text: text.slice(cursor, at) })

    const token = match[0]
    if (token.startsWith('`')) {
      runs.push({ kind: 'code', text: token.slice(1, -1) })
    } else if (token.startsWith('**')) {
      runs.push({ kind: 'strong', text: token.slice(2, -2) })
    } else if (token.startsWith('_')) {
      runs.push({ kind: 'em', text: token.slice(1, -1) })
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
      if (link) runs.push({ kind: 'link', text: link[1], href: link[2] })
    }

    cursor = at + token.length
  }

  if (cursor < text.length) runs.push({ kind: 'text', text: text.slice(cursor) })
  return runs
}

export interface Slide {
  title: string
  blocks: Block[]
}

/**
 * Splits a guide into its slides, one per level-2 heading.
 *
 * The carousel and the reference are written in the same syntax but not in the
 * same file: a slide is a caption and a reference section is an explanation,
 * and trying to serve both from one source makes the tour verbose or the manual
 * useless. The level-1 heading is the guide's own title.
 */
export function parseSlides(source: string): { title: string; slides: Slide[] } {
  const blocks = parseMarkdown(source)
  const slides: Slide[] = []
  let title = ''
  let current: Slide | null = null

  for (const block of blocks) {
    if (block.kind === 'heading' && block.level === 1) {
      title = block.text
      continue
    }

    if (block.kind === 'heading' && block.level === 2) {
      current = { title: block.text, blocks: [] }
      slides.push(current)
      continue
    }

    // Content before the first level-2 heading has nowhere to go. Dropping it
    // silently would hide a mistyped heading, so it opens an untitled slide.
    if (!current) {
      current = { title, blocks: [] }
      slides.push(current)
    }

    current.blocks.push(block)
  }

  return { title, slides }
}

/** The sections a reference chapter offers as anchors — its level-2 headings. */
export function outline(blocks: Block[]): { id: string; text: string }[] {
  return blocks
    .filter((block): block is Extract<Block, { kind: 'heading' }> => block.kind === 'heading')
    .filter((block) => block.level === 2)
    .map((block) => ({ id: anchor(block.text), text: block.text }))
}

/** A heading's anchor. Stable for a given wording, which is what a link needs. */
export function anchor(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

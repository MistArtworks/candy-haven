import { marked, type Token, type Tokens } from 'marked';

// Markdown, the way it would be typed into an editor (Candy Haven's, later),
// read into the page's own blocks, never into HTML: each block keeps its
// own reveal, and nothing written can reach the page as markup. The lore
// chapters and the services' write-ups both use it.
//
//   A paragraph.            → paragraph (*emphasis* in the accent voice,
//                             **strong** in the heavy one)
//   > A line set large.     → quote
//   ## A heading            → heading
//   - An item               → list
//   - **Term**: its text    → entries (every item a term, then : or a dash)
//
// Anything else (code, tables, images, raw HTML) is refused, loudly, so it
// shows up while writing instead of vanishing from the page.

/** A run of text in one voice. */
export interface TextRun {
  text: string;
  voice?: 'emphasis' | 'strong';
}

export type TextBlock =
  | { kind: 'paragraph'; runs: TextRun[] }
  | { kind: 'quote'; runs: TextRun[] }
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: TextRun[][] }
  | { kind: 'entries'; items: Array<{ term: string; runs: TextRun[] }> };

type Voice = NonNullable<TextRun['voice']>;

export class MarkdownBlocksError extends Error {
  name = 'MarkdownBlocksError';
}

// Where a term ends and its text begins: "**Term**: text", "**Term** – text".
const TERM_SEPARATOR = /^\s*(?:[—–-]|:)\s*/;
const COMMENT = /^\s*<!--[\s\S]*-->\s*$/;

function inline(tokens: Token[], voice?: Voice): TextRun[] {
  return tokens.flatMap((token): TextRun[] => {
    switch (token.type) {
      case 'text':
        return 'tokens' in token && token.tokens?.length
          ? inline(token.tokens, voice)
          : [{ text: token.text, voice }];
      case 'escape':
      case 'codespan':
        return [{ text: token.text, voice }];
      case 'em':
        return inline((token as Tokens.Em).tokens, 'emphasis');
      case 'strong':
        return inline((token as Tokens.Strong).tokens, 'strong');
      // A link keeps its words; running text has no links.
      case 'link':
      case 'del':
        return inline((token as Tokens.Link | Tokens.Del).tokens, voice);
      case 'br':
        return [{ text: ' ', voice }];
      // Inline HTML is dropped: its text, if any, is the text around it.
      case 'html':
        return [];
      default:
        throw new MarkdownBlocksError(
          `can't use inline "${token.type}": ${token.raw}`
        );
    }
  });
}

// Joins runs of the same voice, folds line breaks and runs of spaces into
// one space, and trims the ends.
function tidy(runs: TextRun[]): TextRun[] {
  const joined: TextRun[] = [];
  for (const run of runs) {
    const text = run.text.replace(/\s+/g, ' ');
    const last = joined.at(-1);
    // A bare space between two voices belongs to the one before it.
    if (last && (last.voice === run.voice || text === ' ')) last.text += text;
    else joined.push(run.voice ? { text, voice: run.voice } : { text });
  }
  if (joined.length) {
    joined[0].text = joined[0].text.trimStart();
    joined[joined.length - 1].text = joined[joined.length - 1].text.trimEnd();
  }
  return joined.filter((run) => run.text.length > 0);
}

const plain = (runs: TextRun[]) => runs.map((run) => run.text).join('');

function required(runs: TextRun[], raw: string) {
  if (!runs.length)
    throw new MarkdownBlocksError(`This has no text to show: ${raw.trim()}`);
  return runs;
}

// An item's runs: a tight list holds its text directly, a loose one (items
// a blank line apart) holds paragraphs.
function itemRuns(item: Tokens.ListItem) {
  const tokens = item.tokens.flatMap((token) =>
    token.type === 'paragraph'
      ? [...(token as Tokens.Paragraph).tokens]
      : [token]
  );
  return required(tidy(inline(tokens)), item.raw);
}

// "**Term**: text": the item opens in the strong voice, then a separator
// (or the colon sits inside the bold, "**Term:** text").
function asEntry(runs: TextRun[]) {
  const [head, next, ...rest] = runs;
  if (head?.voice !== 'strong' || !next) return null;
  const term = head.text.replace(/:\s*$/, '').trim();
  const inside = head.text.trimEnd().endsWith(':');
  if (!inside && !TERM_SEPARATOR.test(next.text)) return null;
  const text = inside ? next.text : next.text.replace(TERM_SEPARATOR, '');
  const body = tidy([{ ...next, text }, ...rest]);
  return term && body.length ? { term, runs: body } : null;
}

function block(token: Token): TextBlock[] {
  switch (token.type) {
    case 'space':
      return [];
    case 'paragraph':
      return [
        {
          kind: 'paragraph',
          runs: required(
            tidy(inline((token as Tokens.Paragraph).tokens)),
            token.raw
          )
        }
      ];
    case 'heading':
      return [
        {
          kind: 'heading',
          text: plain(
            required(tidy(inline((token as Tokens.Heading).tokens)), token.raw)
          )
        }
      ];
    // Each paragraph of a quote is set as its own line.
    case 'blockquote':
      return (token as Tokens.Blockquote).tokens.flatMap((child) => {
        if (child.type === 'space') return [];
        if (child.type !== 'paragraph')
          throw new MarkdownBlocksError(
            `A quote can only hold text: ${child.raw.trim()}`
          );
        return [
          {
            kind: 'quote' as const,
            runs: required(
              tidy(inline((child as Tokens.Paragraph).tokens)),
              child.raw
            )
          }
        ];
      });
    case 'list': {
      const items = (token as Tokens.List).items.map(itemRuns);
      const entries = items.map(asEntry);
      return entries.every((entry) => entry !== null)
        ? [
            {
              kind: 'entries',
              items: entries as Array<{ term: string; runs: TextRun[] }>
            }
          ]
        : [{ kind: 'list', items }];
    }
    // Comments are notes for whoever writes the text.
    case 'html':
      if (COMMENT.test(token.raw)) return [];
      throw new MarkdownBlocksError(`can't use HTML: ${token.raw.trim()}`);
    default:
      throw new MarkdownBlocksError(
        `can't use "${token.type}": ${token.raw.trim()}`
      );
  }
}

/**
 * Reads markdown into blocks. `subject` names the text in errors, as in
 * "Lore text can't use HTML: …".
 */
export function parseMarkdownBlocks(
  markdown: string,
  subject = 'This text'
): TextBlock[] {
  try {
    return marked.lexer(markdown).flatMap(block);
  } catch (error) {
    if (
      error instanceof MarkdownBlocksError &&
      error.message.startsWith("can't")
    )
      throw new MarkdownBlocksError(`${subject} ${error.message}`);
    throw error;
  }
}

const runsText = (runs: TextRun[]) => runs.map((run) => run.text).join('');

/** The words of the blocks, one string a block, for searching. */
export function blocksText(blocks: readonly TextBlock[]): string[] {
  return blocks.map((block) => {
    switch (block.kind) {
      case 'heading':
        return block.text;
      case 'paragraph':
      case 'quote':
        return runsText(block.runs);
      case 'list':
        return block.items.map(runsText).join(' ');
      case 'entries':
        return block.items
          .map((item) => `${item.term} ${runsText(item.runs)}`)
          .join(' ');
    }
  });
}

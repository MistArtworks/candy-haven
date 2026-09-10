import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { ReleaseArrival } from '@shared/domain/update'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import styles from './ReleaseNotice.module.scss'

/**
 * What changed, once, after an update has landed.
 *
 * Mounted in the console shell rather than on a page, because an update is not
 * a property of wherever the operator happened to be when they launched.
 *
 * A layer rather than a banner. A build that removes a department and rebuilds
 * another is not something to notice in passing, and there is exactly one
 * moment it can be said — dismissing it is what marks the version read, so a
 * banner scrolled past would have spent the only chance.
 */
export function ReleaseNotice(): ReactNode {
  const [arrival, setArrival] = useState<ReleaseArrival | null>(null)

  useEffect(() => {
    let alive = true
    void window.candy.release.arrival().then((next) => {
      if (alive) setArrival(next)
    })
    return () => {
      alive = false
    }
  }, [])

  const dismiss = (): void => {
    setArrival(null)
    // Not awaited: the notice should close on the click, and a failed write
    // costs one repeat next launch rather than a stuck dialog.
    void window.candy.release.acknowledge()
  }

  // Escape closes, as it does for every other layer in the shell.
  useEffect(() => {
    if (!arrival) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [arrival])

  return (
    <AnimatePresence>
      {arrival ? (
        <Portal>
          <motion.div
            className={styles.layer}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-label="What changed"
          >
            <motion.section
              className={styles.sheet}
              initial={{ opacity: 0, y: 18, scale: 0.995 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.997 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            >
              <header className={styles.head}>
                <span className={styles.index}>UPDATED</span>
                <h2 className={styles.title}>Version {arrival.version}</h2>
                {arrival.previous ? (
                  <span className={styles.from}>from {arrival.previous}</span>
                ) : null}
              </header>

              <div className={styles.body}>
                {arrival.notes ? (
                  <Notes source={arrival.notes} />
                ) : (
                  <p className={styles.empty}>
                    The notes for this version could not be reached. They are on the release page if
                    the machine comes back online.
                  </p>
                )}
              </div>

              <footer className={styles.foot}>
                <Button variant="primary" onClick={dismiss}>
                  Understood
                </Button>
              </footer>
            </motion.section>
          </motion.div>
        </Portal>
      ) : null}
    </AnimatePresence>
  )
}

/** One line of the notes, already reduced to what it is. */
interface Block {
  kind: 'heading' | 'bullet' | 'paragraph'
  text: string
}

/**
 * Release notes, rendered without a Markdown library — or an HTML one.
 *
 * The notes arrive in **two different formats** depending on where they came
 * from, which is the bug this function was rewritten to fix. Fetched from the
 * GitHub API they are the raw Markdown that was written. Handed over by
 * electron-updater they are *HTML*: the GitHub provider renders the release
 * body before putting it on `UpdateInfo`. The first version of this understood
 * only Markdown, so an updated client showed a screen of `<p>` and `<li>` tags.
 *
 * Both are reduced to the same three shapes — heading, bullet, paragraph —
 * because those are the only three the notes are ever written in, and pulling
 * in a Markdown parser plus an HTML sanitiser to render a changelog this
 * application also authors would be two dependencies for nothing.
 */
function Notes({ source }: { source: string }): ReactNode {
  const blocks = useMemo(() => parseNotes(source), [source])

  return (
    <div className={styles.notes}>
      {blocks.map((block, index) => {
        const key = `${index}-${block.text.slice(0, 24)}`

        if (block.kind === 'heading') {
          return (
            <h3 key={key} className={styles.heading}>
              {block.text}
            </h3>
          )
        }

        return (
          <p key={key} className={block.kind === 'bullet' ? styles.bullet : styles.paragraph}>
            {block.text}
          </p>
        )
      })}
    </div>
  )
}

function parseNotes(source: string): Block[] {
  return /<(p|h[1-6]|ul|ol|li|br|div)[ >/]/i.test(source) ? fromHtml(source) : fromMarkdown(source)
}

/**
 * HTML notes, reduced to text.
 *
 * Parsed with `DOMParser` and read through `textContent` — never assigned to
 * `innerHTML`. `DOMParser` builds an inert document that runs no script and
 * loads no resource, and taking only the text means nothing from the release
 * body can reach the DOM as markup even in principle. The notes are fetched
 * over the network from a repository, so that guarantee is worth having
 * cheaply rather than reasoning about who can write a release.
 */
function fromHtml(source: string): Block[] {
  const blocks: Block[] = []

  try {
    const document_ = new DOMParser().parseFromString(source, 'text/html')

    // Walked rather than queried, so the order of the document is the order on
    // screen — a `querySelectorAll` per tag would group every heading first.
    const visit = (node: Element): void => {
      for (const child of Array.from(node.children)) {
        const tag = child.tagName.toLowerCase()

        if (/^h[1-6]$/.test(tag)) {
          push(blocks, 'heading', child.textContent)
        } else if (tag === 'li') {
          push(blocks, 'bullet', child.textContent)
        } else if (tag === 'ul' || tag === 'ol' || tag === 'div' || tag === 'blockquote') {
          visit(child)
        } else if (tag === 'p') {
          push(blocks, 'paragraph', child.textContent)
        } else {
          // Anything unrecognised still contributes its text rather than being
          // dropped: notes written in some other shape stay legible.
          push(blocks, 'paragraph', child.textContent)
        }
      }
    }

    visit(document_.body)
  } catch {
    // A parser failure falls back to the line reader, which cannot fail.
    return fromMarkdown(source)
  }

  return blocks.length > 0 ? blocks : fromMarkdown(source)
}

/** Markdown notes: three shapes, matched on the first characters of a line. */
function fromMarkdown(source: string): Block[] {
  const blocks: Block[] = []

  for (const raw of source.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim()
    // A blank line is the space between paragraphs, which the gap provides.
    if (!line) continue

    if (line.startsWith('#')) push(blocks, 'heading', line.replace(/^#+\s*/, ''))
    else if (line.startsWith('- ') || line.startsWith('* ')) push(blocks, 'bullet', line.slice(2))
    else push(blocks, 'paragraph', line)
  }

  return blocks
}

function push(blocks: Block[], kind: Block['kind'], text: string | null): void {
  // Collapsed: HTML notes carry the source document's line breaks inside a
  // paragraph, and those are not the author's line breaks.
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  if (clean) blocks.push({ kind, text: clean })
}

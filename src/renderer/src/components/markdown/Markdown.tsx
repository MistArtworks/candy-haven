import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { anchor, parseInline, type Block } from '@renderer/lib/markdown'
import { guideImage } from '@renderer/lib/guide-assets'
import styles from './Markdown.module.scss'

export interface MarkdownProps {
  blocks: readonly Block[]
  /** Drops the headings, for the carousel — a slide's title is its own chrome. */
  headings?: boolean
  className?: string
}

/**
 * Renders parsed Markdown in the console's register.
 *
 * Never assigns `innerHTML` and has no path that could: the parser hands over
 * data, and every branch below builds elements. That is a property worth having
 * even though the source is authored in this repository, because it means the
 * day someone points this at a file the operator can edit, nothing about the
 * security of the renderer has to be reconsidered.
 */
export function Markdown({ blocks, headings = true, className }: MarkdownProps): ReactNode {
  return (
    <div className={className ? `${styles.prose} ${className}` : styles.prose}>
      {blocks.map((block, index) => (
        <Fragment key={index}>{renderBlock(block, headings)}</Fragment>
      ))}
    </div>
  )
}

function renderBlock(block: Block, headings: boolean): ReactNode {
  switch (block.kind) {
    case 'heading': {
      if (!headings) return null
      const Tag = (['h2', 'h3', 'h4'] as const)[block.level - 1]
      return (
        <Tag id={anchor(block.text)} className={styles[`h${block.level}`]}>
          {block.text}
        </Tag>
      )
    }

    case 'paragraph':
      return <p className={styles.paragraph}>{inline(block.text)}</p>

    case 'bullet':
      return (
        <p className={styles.bullet}>
          <span className={styles.dash} aria-hidden="true" />
          <span>{inline(block.text)}</span>
        </p>
      )

    case 'ordered':
      return (
        <p className={styles.ordered}>
          {/* Padded so a run past nine does not shift its own text. */}
          <span className={styles.ordinal}>{String(block.index).padStart(2, '0')}</span>
          <span>{inline(block.text)}</span>
        </p>
      )

    case 'note':
      return (
        <aside className={styles.note}>
          <span className={styles.noteRule} aria-hidden="true" />
          <p>{inline(block.text)}</p>
        </aside>
      )

    case 'code':
      return (
        <pre className={styles.code}>
          {block.lang ? <span className={styles.lang}>{block.lang}</span> : null}
          <code>{block.text}</code>
        </pre>
      )

    case 'image':
      return <Figure src={block.src} alt={block.alt} />

    case 'table':
      return (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {block.head.map((cell, index) => (
                  <th key={index}>{inline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{inline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    default:
      return null
  }
}

/**
 * One screenshot, or the plate that stands in for one.
 *
 * The missing case is drawn rather than hidden. A chapter that describes a view
 * it cannot show should say which capture is absent — that is the difference
 * between documentation that is incomplete and documentation that is broken,
 * and it doubles as the list of what is left to shoot.
 */
function Figure({ src, alt }: { src: string; alt: string }): ReactNode {
  const url = guideImage(src)

  if (!url) {
    return (
      <figure className={styles.missing}>
        <span className={styles.missingMark} aria-hidden="true" />
        <figcaption>
          <span className={styles.missingLabel}>CAPTURE PENDING</span>
          <span className={styles.missingName}>{src}</span>
          {alt ? <span className={styles.missingAlt}>{alt}</span> : null}
        </figcaption>
      </figure>
    )
  }

  return (
    <figure className={styles.figure}>
      <img src={url} alt={alt} loading="lazy" />
      {alt ? <figcaption>{alt}</figcaption> : null}
    </figure>
  )
}

/** Inline runs. Internal targets become router links; external ones open out. */
function inline(text: string): ReactNode {
  return parseInline(text).map((run, index) => {
    if (run.kind === 'strong') {
      return (
        <strong key={index} className={styles.strong}>
          {run.text}
        </strong>
      )
    }

    if (run.kind === 'em') {
      return (
        <em key={index} className={styles.em}>
          {run.text}
        </em>
      )
    }

    if (run.kind === 'code') {
      return (
        <code key={index} className={styles.inlineCode}>
          {run.text}
        </code>
      )
    }

    if (run.kind === 'link') {
      // A target starting with `/` is a department, so it navigates in place —
      // documentation that says "see REGULATION" should be able to go there.
      if (run.href.startsWith('/')) {
        return (
          <Link key={index} to={run.href} className={styles.link}>
            {run.text}
          </Link>
        )
      }

      return (
        <button
          key={index}
          type="button"
          className={styles.link}
          onClick={() => void window.candy.shell.openExternal(run.href)}
        >
          {run.text}
        </button>
      )
    }

    return <Fragment key={index}>{run.text}</Fragment>
  })
}

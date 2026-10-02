import type { ReactNode } from 'react'
import type { TextBlock, TextRun } from '@renderer/lib/markdown/blocks'
import type { PlanetSpec } from '@shared/planets/engine'
import { PlanetSvg } from '@shared/planets/react'
import styles from '../Lore.module.scss'

/*
 * A chapter as the website will read it: its planet, its numeral, title and
 * line, then the text in the site's voices. The blocks come from the same
 * reader the website uses (lib/markdown/blocks, copied from it), so what
 * this shows and what visitors see can't disagree about what the markdown
 * says; the type is only a likeness of the site's, in the site's colours.
 */

function Runs({ runs }: { runs: readonly TextRun[] }): ReactNode {
  return runs.map((run, i) =>
    run.voice === 'emphasis' ? (
      <em key={i}>{run.text}</em>
    ) : run.voice === 'strong' ? (
      <strong key={i}>{run.text}</strong>
    ) : (
      <span key={i}>{run.text}</span>
    )
  )
}

function Block({ block }: { block: TextBlock }): ReactNode {
  switch (block.kind) {
    case 'paragraph':
      return (
        <p>
          <Runs runs={block.runs} />
        </p>
      )
    case 'quote':
      return (
        <blockquote className={styles.previewQuote}>
          <Runs runs={block.runs} />
        </blockquote>
      )
    case 'heading':
      return <h3 className={styles.previewHeading}>{block.text}</h3>
    case 'list':
      return (
        <ul className={styles.previewList}>
          {block.items.map((runs, i) => (
            <li key={i}>
              <Runs runs={runs} />
            </li>
          ))}
        </ul>
      )
    case 'entries':
      return (
        <dl className={styles.previewEntries}>
          {block.items.map((item, i) => (
            <div key={i} style={{ display: 'contents' }}>
              <dt>{item.term}</dt>
              <dd>
                <Runs runs={item.runs} />
              </dd>
            </div>
          ))}
        </dl>
      )
  }
}

export function LorePreview({
  numeral,
  title,
  line,
  planet,
  blocks
}: {
  numeral: string
  title: string
  line: string
  planet: PlanetSpec | null
  blocks: readonly TextBlock[]
}): ReactNode {
  return (
    <div className={styles.preview}>
      <div className={styles.previewHead}>
        {planet ? <PlanetSvg className={styles.previewPlanet} spec={planet} /> : <span />}
        <div>
          <p className={styles.previewNumeral}>Chapter {numeral}</p>
          <h2 className={styles.previewTitle}>{title || 'Untitled'}</h2>
          {line ? <p className={styles.previewLine}>{line}</p> : null}
        </div>
      </div>
      <div className={styles.previewBody}>
        {blocks.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </div>
    </div>
  )
}

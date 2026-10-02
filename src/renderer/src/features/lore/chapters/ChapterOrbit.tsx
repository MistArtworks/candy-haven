import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { ChapterPlanet, LoreChapterView } from '@shared/domain/lore'
import { PlanetSvg } from '@shared/planets/react'
import { Button } from '@renderer/components/primitives/Button'
import { toRoman } from '../lib/order'
import { lineOf, statusWord, titleOf, whereOf } from './chapterText'
import styles from '../Lore.module.scss'

/**
 * A place on the ring, as the website's lore page spaces them: from the top,
 * clockwise, one per chapter and one more for the chapter still to come.
 */
function nodeAngle(index: number, count: number): number {
  return -90 + (index / (count + 1)) * 360
}

function place(angle: number, size: number): CSSProperties {
  const a = (angle * Math.PI) / 180
  return {
    left: `${(50 + 50 * Math.cos(a)).toFixed(3)}%`,
    top: `${(50 + 50 * Math.sin(a)).toFixed(3)}%`,
    width: `${size.toFixed(2)}%`,
    '--dx': Math.cos(a).toFixed(3),
    '--dy': Math.sin(a).toFixed(3)
  } as CSSProperties
}

/**
 * ORBIT: the chapters round a ring, each as its planet, the way the
 * website's lore page arranges them, with the one in hand drawn large and
 * moving in the middle and said in full beside it.
 *
 * Picking a planet on the ring brings that chapter to the middle; the
 * arrow keys walk the ring. Writing it, or opening its planet, are the
 * buttons beside.
 */
export function ChapterOrbit({
  views,
  planetOf,
  selectedId,
  onOpen,
  onOpenPlanet
}: {
  views: readonly LoreChapterView[]
  planetOf: (view: LoreChapterView) => ChapterPlanet
  selectedId: string | null
  onOpen: (id: string) => void
  onOpenPlanet: (id: string) => void
}): ReactNode {
  const [focusId, setFocusId] = useState<string | null>(selectedId)
  const found = views.findIndex((view) => view.id === focusId)
  const index = found >= 0 ? found : 0
  const focused = views[index]
  const planet = planetOf(focused)
  const count = views.length
  const line = lineOf(focused)

  // Each planet gets just over half its share of the ring, up to a size
  // that still leaves the middle to the one in hand.
  const share = (Math.PI * 100) / (count + 1)
  const size = Math.min(13, share * 0.55)

  const step = (by: -1 | 1): void => {
    setFocusId(views[(index + by + count) % count].id)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      step(1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      step(-1)
    }
  }

  return (
    <div className={styles.orbitView}>
      <div className={styles.orbitStage} onKeyDown={onKeyDown}>
        <div className={styles.orbitRing}>
          <svg className={styles.orbitLine} viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="49.9" />
          </svg>

          <motion.div
            key={focused.id}
            className={styles.orbitCentre}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <PlanetSvg
              spec={planet.spec}
              title={`${planet.name}, the planet of ${titleOf(focused)}`}
            />
          </motion.div>

          <ol className={styles.orbitNodes} aria-label="Chapters round the orbit">
            {views.map((view, i) => {
              const angle = nodeAngle(i, count)
              const numeral = toRoman(i + 1)
              return (
                <li
                  key={view.id}
                  className={styles.orbitNode}
                  style={place(angle, size)}
                  data-status={view.status}
                  data-focused={i === index || undefined}
                >
                  <button
                    type="button"
                    className={styles.orbitPick}
                    aria-pressed={i === index}
                    aria-label={`Chapter ${numeral}, ${titleOf(view)}`}
                    onClick={() => setFocusId(view.id)}
                    onDoubleClick={() => onOpen(view.id)}
                  >
                    <PlanetSvg spec={planetOf(view).spec} still />
                  </button>
                  <span className={styles.orbitNumeral} aria-hidden="true">
                    {numeral}
                  </span>
                </li>
              )
            })}
            <li
              className={styles.orbitNode}
              style={place(nodeAngle(count, count), size)}
              data-next
              aria-hidden="true"
            >
              <span className={styles.orbitNext} />
              <span className={styles.orbitNumeral}>{toRoman(count + 1)}</span>
            </li>
          </ol>
        </div>
      </div>

      <div className={styles.orbitDetail}>
        <span className={styles.orbitKicker}>
          Chapter {toRoman(index + 1)} / {toRoman(count)}
        </span>
        <h3 className={styles.orbitTitle}>{titleOf(focused)}</h3>
        <p className={styles.orbitLineText} data-empty={!line || undefined}>
          {line || 'No line yet'}
        </p>

        <dl className={styles.orbitFacts}>
          <div>
            <dt>Stands</dt>
            <dd>
              <span className={styles.status} data-status={focused.status}>
                {statusWord(focused)}
              </span>
              <span className={styles.orbitWhen}>{whereOf(focused)}</span>
            </dd>
          </div>
          <div>
            <dt>Planet</dt>
            <dd>{planet.name || 'Unnamed'}</dd>
          </div>
        </dl>

        <div className={styles.actions}>
          <Button size="sm" variant="primary" onClick={() => onOpen(focused.id)}>
            Write
          </Button>
          {planet.here ? (
            <Button size="sm" onClick={() => onOpenPlanet(planet.id)}>
              Open planet
            </Button>
          ) : null}
          <span className={styles.spacer} />
          <Button size="sm" variant="ghost" onClick={() => step(-1)} disabled={count < 2}>
            Previous
          </Button>
          <Button size="sm" variant="ghost" onClick={() => step(1)} disabled={count < 2}>
            Next
          </Button>
        </div>

        <p className={styles.footnote}>
          Set round the ring as the website&apos;s lore page sets them: the first at the top, then
          clockwise, with a place kept for the chapter still to come. Pick a planet to bring its
          chapter here, or walk the ring with the arrow keys.
        </p>
      </div>
    </div>
  )
}

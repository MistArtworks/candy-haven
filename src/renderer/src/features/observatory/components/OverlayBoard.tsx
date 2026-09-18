import type { ReactNode } from 'react'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import type { DeckStatus } from '../lib/deck'
import type { KitId } from '../lib/kit'
import { OverlayMark, type OverlayMarkName } from './icons/OverlayMark'
import styles from './OverlayBoard.module.scss'

export interface BoardRow {
  id: KitId
  /** Board index, `01`…`11`, from `lib/kit.ts`. */
  index: string
  label: string
  mark: OverlayMarkName
  status: DeckStatus
  /**
   * The plain sentence — as the row's tooltip, not as a line on it.
   *
   * It was a second line on every row, and eleven of those made the board a
   * wall. It belongs on the bench, which is where somebody asking "what is
   * this" is looking, and the bench draws it at full brightness with the steps
   * beneath it. Here it costs nothing and is still one hover away.
   */
  purpose: string
}

export interface BoardGroup {
  id: string
  label: string
  rows: readonly BoardRow[]
}

export interface OverlayBoardProps {
  groups: readonly BoardGroup[]
  selected: KitId
  onSelect(id: KitId): void
}

/**
 * The whole broadcast kit, as one board.
 *
 * ## What this replaced, and why it is one object rather than two
 *
 * The desk had a rail *and* a card per overlay. The rail carried an index, a
 * label, a state dot and a live figure; the card carried an index, a label, a
 * state dot, a live figure and then everything else. They were **the same
 * information twice**, and they were twice as far apart as they looked because
 * the cards ran about eight screens and the rail was a scroll-spy over them.
 *
 * This is those two merged, and kept to what a *readout* is for: which overlay
 * this is, and what it is doing. Everything you press moved to the bench beside
 * it, where one overlay's worth is drawn instead of eleven.
 *
 * A first draft put each row's leading verb on the row itself, so the interval
 * could be held without moving the bench. It did not survive looking at:
 * eleven buttons down a 300px column is the noise the redesign existed to
 * remove, and one unmistakable control on the bench says the same thing once.
 * That emphasis now lives on `OverlayVerbs`, which gives the lead verb its own
 * line at full size.
 *
 * ## The grouping is part of the explanation
 *
 * Families come from the registry and they do real work: knowing THE GATE is a
 * *standing scene* and THE ENCLOSURE is *furniture* says how each is placed in
 * OBS before any description is read. A flat list of eleven said nothing about
 * the shape of the kit.
 *
 * ## What the rail got right, and is kept
 *
 * It never hid anything. Selecting a row here scrolls nothing and hides
 * nothing: every overlay's state stays on screen, because "I had to open each
 * overlay in turn to find out what it was doing" is the original complaint and
 * a board that collapsed to one row would have rebuilt it. What the bench
 * swaps is *controls*, which were never visible for more than one overlay at a
 * time anyway — nobody scrolled eight screens to watch a composer.
 */
export function OverlayBoard({ groups, selected, onSelect }: OverlayBoardProps): ReactNode {
  return (
    <nav className={styles.board} aria-label="Broadcast kit">
      {groups.map((group) => (
        <div key={group.id} className={styles.group}>
          <h3 className={styles.groupLabel}>{group.label}</h3>
          <ul className={styles.rows}>
            {group.rows.map((row) => (
              <Row key={row.id} row={row} active={row.id === selected} onSelect={onSelect} />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function Row({
  row,
  active,
  onSelect
}: {
  row: BoardRow
  active: boolean
  onSelect(id: KitId): void
}): ReactNode {
  const { status } = row

  /*
   * A row is quiet until its overlay is doing something.
   *
   * `statusFor` returns a null `detail` at rest, deliberately — its own note
   * says a dashboard of rows each reporting that nothing is happening is harder
   * to read than rows that stay quiet. The board takes that at its word: at
   * rest a row is a number, a mark, a name and a dot, and the moment something
   * runs it grows its figure and its line.
   *
   * The first draft drew a second line on all eleven rows unconditionally — the
   * live line when there was one and the plain description otherwise — which
   * made the board a wall of prose beside a bench that says the same thing
   * better. The description moved to the tooltip and the bench.
   */
  const busy = status.detail !== null

  return (
    <li className={styles.row} data-active={active || undefined} data-live={busy || undefined}>
      <button
        type="button"
        className={styles.select}
        aria-current={active ? 'true' : undefined}
        title={row.purpose}
        onClick={() => onSelect(row.id)}
      >
        <span className={styles.index}>{row.index}</span>
        <span className={styles.mark}>
          <OverlayMark name={row.mark} className={styles.markGlyph} />
        </span>

        <span className={styles.label}>{row.label}</span>

        <span className={styles.state}>
          {/*
            Always rendered, and visually hidden while at rest.

            At rest the readout is `At rest`, `Reserved`, `Set by its address` —
            true, and eleven copies of it is the noise being removed. But
            dropping it from the DOM would leave `StatusDot` conveying state by
            colour alone, which it is explicitly not allowed to do: it renders
            its own mark `aria-hidden` and draws nothing else without a label.
            Hidden rather than absent keeps the words for a screen reader and
            for the row's accessible name.
          */}
          <span className={styles.readout} data-quiet={busy ? undefined : true}>
            {status.readout}
          </span>
          <StatusDot tone={status.tone} pulse={status.pulse} />
        </span>

        {busy ? <span className={styles.line}>{status.detail}</span> : null}
      </button>
    </li>
  )
}

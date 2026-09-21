import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Copier } from '@renderer/hooks/useCopy'
import type { AddressRow } from '../lib/addresses'
import type { ComposerSpec, DeckAction, DeckDial, DeckRunner, DeckStatus } from '../lib/deck'
import type { KitEntry } from '../lib/kit'
import { AddressList } from './AddressList'
import { OverlayComposer } from './OverlayComposer'
import { OverlayDials } from './OverlayDials'
import { OverlayVerbs } from './OverlayVerbs'
import styles from './OverlayBench.module.scss'

export interface OverlayBenchProps {
  entry: KitEntry
  status: DeckStatus
  actions: readonly DeckAction[]
  composer: ComposerSpec | null
  dials: readonly DeckDial[]
  rows: readonly AddressRow[]
  copier: Copier
  runner: DeckRunner
  /**
   * `desk` draws the kind chip, the addresses and the way through to the
   * overlay's own page. `page` is the same controls without them — that page is
   * already naming itself in its masthead and listing its addresses in their
   * own panel, and drawing either twice is how a surface stops being trusted.
   */
  variant?: 'desk' | 'page'
}

/**
 * Everything an operator does to one overlay, in one place.
 *
 * ## Why this exists as a component rather than as part of the desk
 *
 * It is drawn in **two** places: as the desk's focal panel, and as slot 02 of
 * the overlay's own console page. That is deliberate and it is the fix for the
 * worst structural problem in the department — the desk's composer and each
 * page's config panel were two separate implementations writing **one**
 * setting. THE MUSTER's title had two text fields in two files, with two sets
 * of limits and two commit paths, and nothing keeping the wording or the
 * validation in step.
 *
 * Now there is one. `actionsFor`, `composerFor` and `dialsFor` answer for both
 * surfaces, so a verb that gains a refusal or a field that gains a limit gains
 * it everywhere at once.
 *
 * ## What is deliberately not here
 *
 * The lists. Reordering a ballot, weighting an entry, striking one off a roll,
 * choosing between five countdown faces, picking the four now-playing layouts —
 * all composition, and composition has a page with room to lay it out. What is
 * here is the one-line "add one more" that unblocks the verb, which is the note
 * `OverlayComposer` already records and which this respects.
 */
export function OverlayBench({
  entry,
  status,
  actions,
  composer,
  dials,
  rows,
  copier,
  runner,
  variant = 'desk'
}: OverlayBenchProps): ReactNode {
  const desk = variant === 'desk'
  const reserved = !entry.implemented

  return (
    <div className={styles.bench}>
      {/*
        The kind, and nothing else said about the overlay.

        `OverlayIdentity` stood here and drew four things: this chip, the plain
        sentence, three numbered steps and the epigraph. Each was defensible on
        its own and together they put a paragraph of prose above every control
        on the desk — the operator's reading was "too much text everywhere",
        and they are right that a desk somebody has open mid-stream is not
        where a procedure is read. The procedure belongs to CATECHISM, the
        sentence survives as the board row's tooltip, and the epigraph is
        already spoken by the page's own masthead.

        What could not go is the kind: `OPEN CALL` and `PRIZE DRAW` are the one
        thing that says what pressing the lead verb will do. It is now the
        loudest gold on the bench and drawn as a ruled heading — a boxed chip
        in the same column as the boxed verbs read as a button that summarises
        the overlay, which is what `.kind` is about.

        The way through to the overlay's own page rides the same rule, at the
        far end. It used to sit in the verb row, a gap away from the button
        that puts a poll on air — a navigation control among broadcast
        controls, which is the arrangement that produces a misfire mid-segment.
        Up here it is nowhere near them: the bench now reads identity at the
        top, composition in the middle, and the act at the bottom.
      */}
      {desk ? (
        <div className={styles.head}>
          <span className={styles.kind}>{entry.role}</span>
          <span className={styles.headRule} aria-hidden="true" />
          <Link to={entry.route} className={styles.enter}>
            Open full console
            <span className={styles.enterArrow} aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      ) : null}

      {/*
        The live line, only when there is one. At rest an overlay gets nothing
        rather than the word "Idle" — see `statusFor`, which returns a null
        detail for exactly this reason. It matters more here than it did: the
        board no longer prints these figures beside its rows, so this is the
        one place `04:12 · 12 filed` is drawn, and drawing `Idle` in it would
        spend the bench's only reading on nothing happening.
      */}
      {status.detail ? <p className={styles.detail}>{status.detail}</p> : null}

      {reserved ? (
        <p className={styles.reserved}>
          Declared in the broadcast registry and routed, but not commissioned. The server serves no
          source at its address yet.
        </p>
      ) : (
        <>
          {composer ? <OverlayComposer {...composer} runner={runner} /> : null}

          <OverlayDials dials={dials} label={dials.length > 0 ? 'Between segments' : undefined} />

          {/*
            Nothing to operate, said plainly rather than left as an empty bench.
            Two different reasons, and they are worth distinguishing because the
            operator's next action differs.
          */}
          {desk && !composer && dials.length === 0 ? (
            entry.overlay === null ? (
              <p className={styles.aside}>
                THE CHORUS has no address — Streamlabs hosts its own chat widget, so this console
                generates the code and you paste it there rather than pointing OBS at it.
              </p>
            ) : (
              <p className={styles.aside}>
                Everything on this one travels in its address, which is what lets two scenes carry
                two differently configured copies. Compose it on its own console, then copy the URL.
              </p>
            )
          ) : null}

          {/*
            The verbs, under everything they commit and above the addresses.

            Composition first, then the act: a call's title and its length are
            set before it is put, and an address is copied once at scene-build
            time rather than mid-segment. The lead verb is the last thing
            before the sources and runs the full width of the bench.
          */}
          <OverlayVerbs actions={actions} runner={runner} />

          {desk && entry.overlay ? (
            <div className={styles.addresses}>
              <span className={styles.addressesLabel}>Browser sources</span>
              <AddressList
                rows={rows}
                copied={copier.copied}
                failed={copier.failed}
                onCopy={copier.copy}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

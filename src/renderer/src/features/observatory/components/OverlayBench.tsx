import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Copier } from '@renderer/hooks/useCopy'
import type { AddressRow } from '../lib/addresses'
import type { ComposerSpec, DeckAction, DeckDial, DeckRunner, DeckStatus } from '../lib/deck'
import type { KitEntry } from '../lib/kit'
import { AddressList } from './AddressList'
import { OverlayComposer } from './OverlayComposer'
import { OverlayDials } from './OverlayDials'
import { OverlayIdentity } from './OverlayIdentity'
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
   * `desk` draws the identity, the addresses and the way through to the
   * overlay's own page. `page` is the same controls without them — that page is
   * already showing its identity in its masthead and its addresses in their own
   * panel, and drawing either twice is how a surface stops being trusted.
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

  /*
   * A reserved overlay gets its commissioning scope where the steps would be.
   *
   * `how` is empty for it, and honestly so — nothing runs yet, so there is no
   * procedure to describe. Its `scope` is what describes work that has been
   * specified and not built, which is the same treatment `ReservedPage` gives
   * a whole department.
   */
  const steps = reserved ? (entry.overlay?.scope ?? []) : entry.how

  return (
    <div className={styles.bench}>
      {desk ? (
        <OverlayIdentity
          role={entry.role}
          purpose={entry.purpose}
          steps={steps}
          stepsLabel={reserved ? 'What it will do' : 'How it runs'}
          epigraph={entry.epigraph}
        />
      ) : null}

      {/*
        The live line, only when there is one. At rest an overlay gets nothing
        rather than the word "Idle" — see `statusFor`, which returns a null
        detail for exactly this reason. On the desk the plain sentence above has
        already said what the thing is, so a row saying nothing is happening
        would be the third caption in a column of three.
      */}
      {status.detail ? <p className={styles.detail}>{status.detail}</p> : null}

      {reserved ? (
        <p className={styles.reserved}>
          Declared in the broadcast registry and routed, but not commissioned. The server serves no
          source at its address yet.
        </p>
      ) : (
        <>
          <OverlayVerbs
            actions={actions}
            runner={runner}
            trailing={
              desk ? (
                <Link to={entry.route} className={styles.enter}>
                  Open full console →
                </Link>
              ) : null
            }
          />

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

      {/*
        A reserved overlay has no verb row, so its way through to its own page
        needs drawing here. Everything else reaches it through the trailing slot
        of `OverlayVerbs`, which renders for the link alone when an overlay has
        no verbs — as THE CHORUS does.
      */}
      {desk && reserved ? (
        <Link to={entry.route} className={styles.enter}>
          Open full console →
        </Link>
      ) : null}
    </div>
  )
}

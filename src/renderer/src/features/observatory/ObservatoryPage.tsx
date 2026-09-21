import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { getSection } from '@shared/domain/navigation'
import { CHAT_STATE_LABEL } from '@shared/domain/chat.constants'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { gridVariants } from '@renderer/motion/transitions'
import { useCopy } from '@renderer/hooks/useCopy'
import { OverlayBench } from './components/OverlayBench'
import { OverlayBoard, type BoardGroup } from './components/OverlayBoard'
import { addressManifest, addressRowsFor, type AddressRow } from './lib/addresses'
import { KIT_ENTRIES, KIT_GROUPS, kitEntry, type KitEntry, type KitId } from './lib/kit'
import {
  CHAT_TONE,
  actionsFor,
  composerFor,
  deckIsCounting,
  dialsFor,
  statusFor,
  useCountdownClock,
  useDeckRunner,
  useOverlayDeck,
  type DeckStatus
} from './lib/deck'
import styles from './ObservatoryPage.module.scss'

/**
 * OBSERVATORY — the broadcast desk.
 *
 * ## Two rebuilds, and what the second one fixed
 *
 * This began as a catalogue: a card per overlay carrying a label, an address as
 * plain text, and a link to the page where anything could actually be done.
 * Right for a directory, wrong for the page somebody has open while a stream is
 * live.
 *
 * The answer to that was a desk — every overlay on one page with its state, its
 * verbs, its composer and all of its addresses. It fixed the navigation and
 * over-corrected on everything else. Eleven cards each carrying a purpose, a
 * lore epigraph, a live line, its verbs, two text fields, an add-one line,
 * filed chips, every address with a URL and two buttons, and a canvas/form
 * footer, two to a row, ran about **eight screens** — above a 236px rail
 * repeating the same state a second time. The two questions an operator
 * actually asks, *what is this for* and *what is it doing*, had become the
 * hardest two things on the page to answer.
 *
 * ## The shape now: a board and a bench
 *
 * **The board** is the rail and the cards merged, because they were the same
 * information twice. It is purely a readout: every overlay, always visible,
 * with its state and — only while something is running — its live figure and
 * one line. Nothing on it is pressed.
 *
 * **The bench** is the page's single focal panel, and everything you press. One
 * overlay's kind, verbs, composer, dials and addresses, with the lead verb
 * given its own line at full size. Selecting a board row fills it.
 *
 * Both halves were cut again after the operator read the finished page as
 * "too much text everywhere". The board lost its live figures and its second
 * line, and is now a mark and a name; the bench lost the sentence, the three
 * steps and the epigraph that sat above its controls. What is left on each is
 * the thing it is for: the board says what the kit *is*, the bench is what you
 * press.
 *
 * The rail's own note was right that hiding eight overlays to show one is the
 * problem this page exists to remove, and it still holds: nothing about any
 * overlay's *state* is hidden here. What the bench swaps is *controls*, which
 * were never visible for more than one overlay at a time anyway — nobody
 * scrolled eight screens to watch a composer.
 *
 * That split is also where a first draft of the board went wrong. It gave each
 * row its leading verb, so the interval could be held without moving the bench
 * — and eleven buttons down a 300px column was the same clutter the redesign
 * existed to remove, reintroduced one level down. The board is a readout; the
 * bench is the desk.
 *
 * ## One implementation, two surfaces
 *
 * `OverlayBench` is also slot 02 of every overlay's own console page. That is
 * the fix for the department's worst structural problem: the desk's composer
 * and each page's config panel were two separate pieces of code writing one
 * setting, with two sets of limits and nothing keeping them in step.
 */

/** THE CHORUS is in the kit, has no live state, and is not served from here. */
const CHORUS_STATUS: DeckStatus = {
  tone: 'pending',
  readout: 'Pasted, not served',
  detail: null
}

const RESERVED_STATUS: DeckStatus = { tone: 'offline', readout: 'Reserved', detail: null }

export function ObservatoryPage(): ReactNode {
  const section = getSection('observatory')

  const deck = useOverlayDeck()
  const runner = useDeckRunner()
  const copier = useCopy()

  /*
   * Guides, as one switch over the whole kit rather than per address.
   *
   * `?guides=1` draws an overlay's safe area and is wanted while a scene is
   * being cut — which means wanted on every source at once, for half an hour,
   * and then on none of them. A per-address toggle would be eleven decisions
   * for one intent. Deliberately not persisted: a setting that survived a
   * restart is exactly how the guides end up on air.
   */
  const [guides, setGuides] = useState(false)

  /*
   * Which overlay the bench is holding.
   *
   * Starts on the first entry on the board rather than on nothing. An empty
   * bench would spend the page's best space teaching that the board is
   * clickable, and THE MUSTER is both the first thing in the kit and the one
   * that feeds two of the others.
   */
  const [selected, setSelected] = useState<KitId>(KIT_ENTRIES[0].id)

  const now = useCountdownClock(deckIsCounting(deck))

  const rowsByOverlay = useMemo(() => {
    const map = new Map<KitId, AddressRow[]>()
    for (const entry of KIT_ENTRIES) {
      if (!entry.overlay) continue
      map.set(entry.id, addressRowsFor(entry.overlay, deck.server.url, { guides }))
    }
    return map
  }, [deck.server.url, guides])

  /**
   * Every live address in the kit, for the one-press scene setup.
   *
   * In **board** order rather than registry order, so the block that lands on
   * the clipboard is grouped the way the page is — instruments, clocks, scenes,
   * furniture. Setting up a scene collection is done group by group.
   */
  const manifest = useMemo(
    () => addressManifest(KIT_ENTRIES.flatMap((entry) => rowsByOverlay.get(entry.id) ?? [])),
    [rowsByOverlay]
  )

  const statusOf = useCallback(
    (entry: KitEntry): DeckStatus => {
      if (!entry.overlay) return CHORUS_STATUS
      if (!entry.overlay.implemented) return RESERVED_STATUS
      return statusFor(entry.overlay.id, deck, now)
    },
    [deck, now]
  )

  const groups = useMemo<BoardGroup[]>(
    () =>
      KIT_GROUPS.map((group) => ({
        id: group.id,
        label: group.label,
        rows: group.entries.map((entry) => ({
          id: entry.id,
          index: String(entry.position).padStart(2, '0'),
          label: entry.label,
          mark: entry.mark,
          status: statusOf(entry),
          purpose: entry.purpose
        }))
      })),
    [statusOf]
  )

  const entry = kitEntry(selected)
  const live = Boolean(entry.overlay?.implemented)

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        guideId="observatory"
        actions={
          <div className={styles.headerActions}>
            <StatusDot
              tone={CHAT_TONE[deck.chat.state]}
              label={
                deck.chat.state === 'live'
                  ? `Attending #${deck.chat.channel}`
                  : CHAT_STATE_LABEL[deck.chat.state]
              }
            />
            <StatusDot
              tone={
                deck.server.running ? (deck.server.clients > 0 ? 'online' : 'pending') : 'error'
              }
              label={
                deck.server.running
                  ? deck.server.clients > 0
                    ? `${deck.server.clients} source${deck.server.clients === 1 ? '' : 's'} attached`
                    : 'Awaiting a source'
                  : 'Server offline'
              }
            />
          </div>
        }
      />

      {/*
        A refusal from anywhere on the desk, said once at the top.
        Every verb on this page and on the bench goes through one runner, so
        there is one place for what it reported back.
      */}
      {runner.error || runner.report ? (
        <div
          className={runner.error ? styles.notice : styles.report}
          role={runner.error ? 'alert' : 'status'}
        >
          <span>{runner.error ?? runner.report}</span>
          <button type="button" className={styles.dismiss} onClick={runner.dismiss}>
            Dismiss
          </button>
        </div>
      ) : null}

      {/*
        The kit's own controls, as a strip rather than a slab.
        They replaced a panel of seven readouts that spent the top of the page
        restating what the masthead's two status dots already say. What is left
        is the four things that are actions rather than readings — and an action
        does not need a numbered container.
      */}
      <div className={styles.deckBar}>
        <Button
          size="sm"
          variant="ghost"
          disabled={!deck.server.running}
          onClick={() => copier.copy('manifest', manifest)}
        >
          {copier.failed === 'manifest'
            ? 'Blocked'
            : copier.copied === 'manifest'
              ? 'Copied every address'
              : 'Copy every address'}
        </Button>

        {/*
          A toggle rather than a checkbox, because it belongs to the row of
          actions beside it rather than to a form. `primary` while on, so a
          guide left switched on is visible from across the room — which is the
          failure it exists to prevent.
        */}
        <Button
          size="sm"
          variant={guides ? 'primary' : 'ghost'}
          aria-pressed={guides}
          onClick={() => setGuides((current) => !current)}
        >
          {guides ? 'Guides on' : 'Guides off'}
        </Button>

        <span className={styles.deckBarSpacer} />

        <Button size="sm" variant="ghost" onClick={() => void window.candy.overlay.restart()}>
          Restart server
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void window.candy.chat.reconnect()}>
          Reconnect chat
        </Button>
      </div>

      {deck.server.error ? <p className={styles.error}>{deck.server.error}</p> : null}

      <motion.div
        className={styles.shell}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        {/*
          `flush`, because the board manages its own padding: its rows are ruled
          edge to edge and a panel's inner padding would inset every rule.
        */}
        <Panel
          label="The kit"
          className={styles.boardPanel}
          flush
          aside={<span className={styles.count}>{KIT_ENTRIES.length} overlays</span>}
        >
          <OverlayBoard groups={groups} selected={selected} onSelect={setSelected} />
        </Panel>

        {/*
          The bench carries the *kit's* number for the selected overlay, not a
          panel number of its own. One numbering system on the page: the board
          numbers 01…11 and the bench's header is whichever of those you are
          holding, so the two cannot be read as two different sequences.
        */}
        <Panel
          label={entry.label}
          index={String(entry.position).padStart(2, '0')}
          focal
          className={styles.benchPanel}
          aside={
            <StatusDot
              tone={statusOf(entry).tone}
              label={statusOf(entry).readout}
              pulse={statusOf(entry).pulse}
            />
          }
        >
          <OverlayBench
            entry={entry}
            status={statusOf(entry)}
            actions={live && entry.overlay ? actionsFor(entry.overlay.id, deck) : []}
            composer={live && entry.overlay ? composerFor(entry.overlay.id, deck) : null}
            dials={live && entry.overlay ? dialsFor(entry.overlay.id, deck) : []}
            rows={rowsByOverlay.get(entry.id) ?? []}
            copier={copier}
            runner={runner}
          />
        </Panel>
      </motion.div>
    </div>
  )
}

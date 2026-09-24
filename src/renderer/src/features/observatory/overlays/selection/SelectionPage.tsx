import { useMemo, type ReactNode } from 'react'
import { useHotkeys } from '@renderer/hotkeys/useHotkeys'
import type { Hotkey } from '@renderer/hotkeys/registry'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { getOverlay } from '@shared/domain/overlays'
import {
  MAX_EDGE_RESERVE,
  OVERLAY_REFERENCE_WIDTH,
  OVERLAY_THEME_LABEL,
  OVERLAY_THEMES,
  ROSTER_SIDE_LABEL,
  ROSTER_SIDES
} from '@shared/domain/rite.constants'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { Checkbox, SelectInput } from '@renderer/components/primitives/Input'
import { Slider } from '@renderer/components/primitives/Slider'
import { formatLogTime } from '@renderer/lib/format'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { gridVariants } from '@renderer/motion/transitions'
import { useCopy } from '@renderer/hooks/useCopy'
import { useOverlayInfo, useRiteActions, useRiteState } from '@renderer/hooks/useRite'
import { useSettings } from '@renderer/hooks/useSettings'
import { RiteRing } from './components/RiteRing'
import { PetitionRoster } from './components/PetitionRoster'
import { AddressList } from '../../components/AddressList'
import { OverlayBench } from '../../components/OverlayBench'
import { PresentationControls } from '../../components/PresentationControls'
import { addressRowsFor } from '../../lib/addresses'
import { kitEntry, kitNumber } from '../../lib/kit'
import {
  actionsFor,
  composerFor,
  dialsFor,
  soloDeck,
  statusFor,
  useDeckRunner
} from '../../lib/deck'
import styles from './SelectionPage.module.scss'

/**
 * RESONANCE SELECTION — host surface.
 *
 * A weighted draw presented as a rotating ring: the audience sees the same ring
 * animating in step through a browser source pointed at this overlay's slug,
 * and both surfaces render the same predetermined result from the same spin
 * command — so what the operator watches here is what is on the stream.
 *
 * On the kit's standing shape: `01` the ring as the one focal panel, `02` the
 * controls that run it, then the roster, presentation, the addresses, the
 * record, and the simulator last.
 *
 * **The RITE panel is gone**, and that is the point of the rebuild rather than
 * a casualty of it. It held a title, a question, a spin length and an
 * elimination switch — every one of which the desk also offered, from a second
 * implementation. All four are now in `02`, through `composerFor` and
 * `dialsFor`, which both surfaces read. The mechanism picker moved out of
 * PRESENTATION for the same reason: which of three ways a draw is watched is a
 * decision taken per draw, so it is a dial, and `dialsFor` records that rule.
 */
export function SelectionPage(): ReactNode {
  const overlay = getOverlay('selection')
  const entry = kitEntry('selection')

  const state = useRiteState()
  const server = useOverlayInfo()
  const runner = useDeckRunner()
  const copier = useCopy()

  /*
   * Still held, because `PetitionRoster` writes through it — weights, removals
   * and the roster's own clear. Its `configure` also carries the presentation
   * writes below, which are not verbs and have no busy state worth drawing.
   */
  const actions = useRiteActions()

  /*
   * Rehearsal, gated on the persisted setting rather than on `is.dev`.
   *
   * As the concord and the muster are. The evening before a stream is when
   * anybody wants to fill a ring and look at it, and by then they are running
   * a packaged build.
   */
  const settings = useSettings()
  const testMode = settings?.workspace.testMode ?? false

  const spinning = state.phase === 'spinning'

  const deck = useMemo(
    () => soloDeck({ owner: 'selection', rite: state, server, settings }),
    [state, server, settings]
  )

  const status = statusFor('selection', deck, 0)
  const verbs = actionsFor('selection', deck)

  /*
   * Driven from the keyboard because it is driven live.
   *
   * The operator is talking while they do this — Space to draw and Ctrl+Shift+X
   * to clear are reachable without looking, which a button in a panel is not.
   *
   * Both chords now run the *same* `DeckAction` the button in `02` runs, found
   * by key rather than calling the service a second way. That is what keeps a
   * refusal consistent between the two: a chord that bypassed the action would
   * bypass its guard as well, and the service's own refusal would arrive as a
   * thrown notice instead of a disabled control.
   *
   * Space is bare rather than modified, and therefore not `whileTyping`: the
   * petition field is right there, and a shortcut that swallowed the space bar
   * mid-name would be worse than no shortcut at all.
   */
  const hotkeys = useMemo<Hotkey[]>(() => {
    const draw = verbs.find((verb) => verb.key === 'rite:spin')
    const clear = verbs.find((verb) => verb.key === 'rite:reset')

    return [
      {
        chord: ' ',
        label: 'Draw a petition',
        group: 'Selection',
        disabled: !draw || Boolean(draw.refusal),
        run: () => {
          if (draw) void runner.run(draw)
        }
      },
      /*
       * Clearing is on the same chord as everywhere else in the observatory.
       *
       * It was `Ctrl+Enter`, which on the two pages either side of this one
       * *starts* something — puts a question, puts a call. One submit-shaped
       * chord meaning "begin" on two overlays and "wipe the board" on a third
       * is the sort of inconsistency that is only ever discovered by wiping
       * the board. `Ctrl+Shift+X` clears, everywhere, and does not fire from
       * inside a text field.
       */
      {
        chord: 'ctrl+shift+x',
        label: 'Clear the ring',
        group: 'Selection',
        disabled: !clear,
        run: () => {
          if (clear) void runner.run(clear)
        }
      }
    ]
  }, [verbs, runner])

  useHotkeys(hotkeys)

  // One notice for the page. Two runners write state here — this page's own
  // roster actions and the bench's — and two notice lines saying the same kind
  // of thing in two places is the inconsistency being removed everywhere else.
  return (
    <div className={styles.page}>
      <PageHeader
        index={kitNumber('selection')}
        label={overlay.label}
        kind={overlay.role}
        purpose={overlay.purpose}
        epigraph={overlay.epigraph}
        actions={
          <div className={styles.headerActions}>
            <Link to="/observatory" className={styles.back}>
              ← The desk
            </Link>
            <StatusDot
              tone={server.running ? (server.clients > 0 ? 'online' : 'pending') : 'error'}
              label={
                server.running
                  ? server.clients > 0
                    ? `${server.clients} source${server.clients === 1 ? '' : 's'} attached`
                    : 'Awaiting a source'
                  : 'Server offline'
              }
              pulse={spinning}
            />
          </div>
        }
      />

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <div className={styles.columns}>
          <div className={styles.column}>
            {/*
          01 — the ring is the single focal object on this page, per the brief.
          It holds no controls any more: the verbs live at `02` with the fields
          they are pressed against, which is the position they occupy on every
          other page in the kit and on the desk.
        */}
            <Panel
              label={state.config.title || 'Selection'}
              index="01"
              focal

              aside={
                spinning ? (
                  <span className={styles.asideLive}>Selecting</span>
                ) : state.winner ? (
                  <span className={styles.asideResult}>{state.winner.label}</span>
                ) : (
                  <span className={styles.count}>{state.petitions.length} filed</span>
                )
              }
            >
              <div className={styles.ringBody}>
                <RiteRing state={state} compact />

                {state.winner ? (
                  <p className={styles.verdict}>
                    <span className={styles.verdictLabel}>Sanctioned</span>
                    <span className={styles.verdictValue}>{state.winner.label}</span>
                    <span className={styles.verdictMeta}>
                      drawn from {state.winner.poolSize} at {formatLogTime(state.winner.at)}
                    </span>
                  </p>
                ) : null}
              </div>
            </Panel>

            {/* 02 — the desk's own controls, on the overlay's page. */}
            <Panel label="Run the draw" index="02">
              <OverlayBench
                entry={entry}
                status={status}
                actions={verbs}
                composer={composerFor('selection', deck)}
                dials={dialsFor('selection', deck)}
                rows={[]}
                copier={copier}
                runner={runner}
                variant="page"
              />
            </Panel>

            <Panel
              label="Broadcast"
              index="05"

              aside={
                <StatusDot
                  tone={server.running ? 'online' : 'error'}
                  label={server.running ? 'Serving' : 'Offline'}
                />
              }
            >
              <div className={styles.broadcast}>
                <AddressList
                  rows={addressRowsFor(overlay, server.url)}
                  copied={copier.copied}
                  failed={copier.failed}
                  onCopy={copier.copy}
                  offline={server.error ?? 'The overlay server is not listening.'}
                />

                <FieldGrid columns={2}>
                  <Field label="Port" value={server.port ?? '—'} mono />
                  <Field label="Attached" value={server.clients} mono />
                </FieldGrid>

                <Button
                  size="sm"
                  variant="ghost"
                  busy={actions.pending === 'server'}
                  onClick={() => void actions.restartServer()}
                >
                  Restart server
                </Button>
              </div>
            </Panel>
          </div>
          <div className={styles.column}>
            {/*
          03 — composition. Reordering, weighting and cutting an entry are the
          things deliberately *not* on the bench, because they need room and a
          list rather than one line.
        */}
            <Panel label="Roster" index="03">
              <PetitionRoster state={state} actions={actions} />
            </Panel>

            {/*
          04 — everything here changes how the overlay looks and nothing here
          changes how the draw behaves. All of it is a fixed choice within the
          locked palette rather than free-form styling — there is deliberately
          no colour picker.
        */}
            <Panel label="Presentation" index="04">
              <div className={styles.config}>
                <PresentationControls
                  values={state.config}
                  onChange={(patch) => void actions.configure(patch)}
                  onReset={() => void actions.configure({ scale: 1, typeScale: 1, opacity: 1 })}
                  adjusted={
                    state.config.scale !== 1 ||
                    state.config.typeScale !== 1 ||
                    state.config.opacity !== 1
                  }
                />

                <SelectInput
                  label="Preset"
                  value={state.config.theme}
                  options={OVERLAY_THEMES.map((theme) => ({
                    value: theme,
                    label: OVERLAY_THEME_LABEL[theme]
                  }))}
                  onChange={(theme) => void actions.configure({ theme })}
                  hint="Five materials, three arrangements. Crimson stays on the focal point in all of them."
                />

                <div className={styles.switchGroup}>
                  <span className={styles.switchLabel}>What is drawn</span>
                  <div className={styles.toggles}>
                    <Checkbox
                      label="Roster column"
                      checked={state.config.showRoster}
                      onChange={(showRoster) => void actions.configure({ showRoster })}
                    />
                    <Checkbox
                      label="Masthead"
                      checked={state.config.showMasthead}
                      onChange={(showMasthead) => void actions.configure({ showMasthead })}
                    />
                    <Checkbox
                      label="Resonance field"
                      checked={state.config.showField}
                      onChange={(showField) => void actions.configure({ showField })}
                    />
                    <Checkbox
                      label="Odds on the roster"
                      checked={state.config.showOdds}
                      onChange={(showOdds) => void actions.configure({ showOdds })}
                    />
                    <Checkbox
                      label="Connection readout"
                      checked={state.config.showStatus}
                      onChange={(showStatus) => void actions.configure({ showStatus })}
                    />
                  </div>
                </div>

                <div className={styles.switchGroup}>
                  <span className={styles.switchLabel}>Layout</span>

                  <SelectInput
                    label="Roster side"
                    value={state.config.rosterSide}
                    options={ROSTER_SIDES.map((side) => ({
                      value: side,
                      label: ROSTER_SIDE_LABEL[side]
                    }))}
                    onChange={(rosterSide) => void actions.configure({ rosterSide })}
                    disabled={!state.config.showRoster}
                  />

                  <Checkbox
                    label="Composite over the scene"
                    checked={state.config.transparent}
                    onChange={(transparent) => void actions.configure({ transparent })}
                    hint="Drops the backdrop so the ring sits over your capture. Tick Transparent on the OBS source too."
                  />

                  {/*
                Quoted in both units on purpose: the fraction is what is stored
                and what survives a resize, but the artwork is cut in Photoshop
                against a fixed canvas, so the pixel figure is the one that gets
                typed into a marquee tool.
              */}
                  <Slider
                    label="Reserve right edge"
                    min={0}
                    max={Math.round(MAX_EDGE_RESERVE * 100)}
                    step={1}
                    value={Math.round(state.config.reserveRight * 100)}
                    readout={`${Math.round(state.config.reserveRight * 100)}% · ${Math.round(
                      state.config.reserveRight * OVERLAY_REFERENCE_WIDTH
                    )}px`}
                    onChange={(percent) => void actions.configure({ reserveRight: percent / 100 })}
                    hint={
                      <>
                        Dead space for chat and camera — nothing is drawn there. Pixels quoted at{' '}
                        {OVERLAY_REFERENCE_WIDTH}px wide. Add{' '}
                        <code className={styles.inline}>?guides=1</code> to outline it while you cut
                        the artwork.
                      </>
                    }
                  />
                </div>
              </div>
            </Panel>

            <Panel
              label="Record"
              index="06"

              aside={
                state.history.length > 0 ? (
                  <button
                    type="button"
                    className={styles.dismiss}
                    onClick={() => void actions.clearHistory()}
                  >
                    Purge
                  </button>
                ) : null
              }
            >
              {state.history.length === 0 ? (
                <p className={styles.empty}>No selections on record.</p>
              ) : (
                <ol className={styles.history}>
                  {state.history.map((item) => (
                    <li key={`${item.petitionId}-${item.at}`} className={styles.historyRow}>
                      <span className={styles.historyTime}>{formatLogTime(item.at)}</span>
                      <span className={styles.historyLabel} {...tooltipTrigger(item.label)}>
                        {item.label}
                      </span>
                      <span className={styles.historyOdds}>1 / {item.poolSize}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>
        </div>

        {/*
          Last, as on every page in the kit, so the indices above are literals.
          It was `06` with the record renumbering itself beneath it whenever
          rehearsal mode was switched on.

          A roster, without a chamber. The ring is the one overlay whose look
          depends entirely on its contents — segment widths, label legibility,
          how it reads at eight entries against thirty — and none of that can be
          judged against an empty roster.
        */}
        {testMode ? (
          <Panel label="Simulator" index="07" className={styles.span6}>
            <div className={styles.simulator}>
              <p className={styles.hint}>
                Files synthetic petitions through the real roster — the same label normalisation,
                duplicate fold and ceiling a typed entry gets. Every third carries extra weight, so
                the ring is not a set of equal segments.
              </p>
              <div className={styles.simulatorRow}>
                {[6, 16, 32].map((count) => (
                  <Button
                    key={count}
                    size="sm"
                    variant="ghost"
                    disabled={spinning}
                    busy={runner.pending === `rite:simulate:${count}`}
                    onClick={() =>
                      void runner.run({
                        key: `rite:simulate:${count}`,
                        label: `+${count}`,
                        run: () => window.candy.rite.simulate(count)
                      })
                    }
                  >
                    +{count}
                  </Button>
                ))}
              </div>
              {spinning ? <p className={styles.hint}>The roster is locked while it runs.</p> : null}
            </div>
          </Panel>
        ) : null}
      </motion.div>
    </div>
  )
}

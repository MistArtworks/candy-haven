import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { getOverlay, overlaySourceUrl } from '@shared/domain/overlays'
import {
  MAX_EDGE_RESERVE,
  RITE_MECHANISMS,
  RITE_MECHANISM_LABEL,
  OVERLAY_REFERENCE_WIDTH,
  OVERLAY_THEME_LABEL,
  OVERLAY_THEMES,
  ROSTER_SIDE_LABEL,
  ROSTER_SIDES,
  SPIN_DURATION_MAX_MS,
  SPIN_DURATION_MIN_MS
} from '@shared/domain/rite.constants'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { Checkbox, SelectInput, TextInput } from '@renderer/components/primitives/Input'
import { Slider } from '@renderer/components/primitives/Slider'
import { formatLogTime } from '@renderer/lib/format'
import { gridVariants } from '@renderer/motion/transitions'
import { useOverlayInfo, useRiteActions, useRiteState } from '@renderer/hooks/useRite'
import { RiteRing } from './components/RiteRing'
import { PetitionRoster } from './components/PetitionRoster'
import styles from './SelectionPage.module.scss'

/**
 * RESONANCE SELECTION — host surface.
 *
 * One overlay out of the OBSERVATORY catalogue. A weighted draw presented as a
 * rotating ring: the audience sees the same ring animating in step through a
 * browser source pointed at this overlay's slug, and both surfaces render the
 * same predetermined result from the same spin command — so what the operator
 * watches here is what is on the stream.
 */
export function SelectionPage(): ReactNode {
  const overlay = getOverlay('selection')
  const state = useRiteState()
  const server = useOverlayInfo()
  const actions = useRiteActions()

  const [copied, setCopied] = useState(false)

  const spinning = state.phase === 'spinning'
  const canSpin = state.petitions.length > 0 && !spinning

  // The address is derived from the server root plus this overlay's slug, so
  // each overlay in the catalogue is its own browser source and the port stays
  // in one place even when it has been claimed upward from the configured one.
  const sourceUrl = server.url ? overlaySourceUrl(server.url, overlay) : null

  const copyUrl = (): void => {
    if (!sourceUrl) return
    void navigator.clipboard.writeText(sourceUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <div className={styles.page}>
      <PageHeader
        index={overlay.order + 1}
        label={overlay.label}
        purpose={overlay.purpose}
        epigraph={overlay.epigraph}
        actions={
          <div className={styles.headerActions}>
            <Link to="/observatory" className={styles.back}>
              Catalogue
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

      {actions.error ? (
        <div className={styles.notice} role="alert">
          <span>{actions.error}</span>
          <button type="button" className={styles.dismiss} onClick={actions.dismissError}>
            Dismiss
          </button>
        </div>
      ) : null}

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        {/* The ring is the single focal object on this page, per the brief. */}
        <Panel
          label={state.config.title || 'Selection'}
          index="01"
          focal
          className={styles.ringPanel}
          aside={
            spinning ? (
              <span className={styles.asideLive}>Selecting</span>
            ) : state.winner ? (
              <span className={styles.asideResult}>{state.winner.label}</span>
            ) : (
              <span className={styles.asideIdle}>{state.petitions.length} filed</span>
            )
          }
        >
          <div className={styles.ringBody}>
            <RiteRing state={state} compact />

            <div className={styles.controls}>
              <Button
                variant="primary"
                disabled={!canSpin}
                busy={actions.pending === 'spin'}
                onClick={() => void actions.spin()}
              >
                {spinning ? 'Selecting' : 'Open the selection'}
              </Button>
              <Button
                variant="ghost"
                disabled={spinning || (!state.winner && state.phase === 'idle')}
                busy={actions.pending === 'reset'}
                onClick={() => void actions.reset()}
              >
                Clear result
              </Button>
            </div>

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

        <Panel label="Roster" index="02" className={styles.span2}>
          <PetitionRoster state={state} actions={actions} />
        </Panel>

        <Panel
          label="Broadcast source"
          index="03"
          className={styles.span2}
          aside={
            <StatusDot
              tone={server.running ? 'online' : 'error'}
              label={server.running ? 'Serving' : 'Offline'}
            />
          }
        >
          <div className={styles.broadcast}>
            {sourceUrl ? (
              <>
                <p className={styles.hint}>
                  Add a Browser source in OBS and point it at this address. Width{' '}
                  {overlay.canvas.width}, height {overlay.canvas.height}.
                </p>
                <code className={styles.url}>{sourceUrl}</code>
                <div className={styles.broadcastActions}>
                  <Button size="sm" variant="ghost" onClick={copyUrl}>
                    {copied ? 'Copied' : 'Copy address'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void window.candy.shell.openExternal(sourceUrl as string)}
                  >
                    Preview
                  </Button>
                </div>
                <p className={styles.hint}>
                  Append <code className={styles.inline}>?transparent=1</code> to composite the ring
                  over your scene instead of on its own backdrop.
                </p>
              </>
            ) : (
              <p className={styles.hint}>
                {server.error ?? 'The overlay server is not listening.'}
              </p>
            )}

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

        <Panel label="Rite" index="04" className={styles.span2}>
          <div className={styles.config}>
            <TextInput
              label="Title"
              value={state.config.title}
              onChange={(title) => void actions.configure({ title })}
              placeholder="RESONANCE SELECTION"
            />
            <TextInput
              label="Question"
              value={state.config.prompt}
              onChange={(prompt) => void actions.configure({ prompt })}
              hint="Shown above the ring on the overlay."
            />

            <Slider
              label="Spin length"
              min={SPIN_DURATION_MIN_MS}
              max={SPIN_DURATION_MAX_MS}
              step={250}
              value={state.config.durationMs}
              disabled={spinning}
              readout={`${(state.config.durationMs / 1000).toFixed(1)}s`}
              onChange={(durationMs) => void actions.configure({ durationMs })}
            />

            <Checkbox
              label="Withdraw the winner"
              checked={state.config.removeOnSelect}
              onChange={(removeOnSelect) => void actions.configure({ removeOnSelect })}
              hint="For elimination rounds — the selected petition leaves the pool once it resolves."
            />
          </div>
        </Panel>

        {/*
          Presentation is split from the rite itself: everything here changes how
          the overlay looks and nothing here changes how the draw behaves. All of
          it is a fixed choice within the locked palette rather than free-form
          styling — there is deliberately no colour picker.
        */}
        <Panel label="Presentation" index="05" className={styles.span2}>
          <div className={styles.config}>
            {/*
              A presentation choice over one draw: the winner is decided in the
              main process and travels in the spin command, so switching
              mechanism changes how the selection is watched and never what is
              selected.
            */}
            <SelectInput
              label="Mechanism"
              value={state.config.mechanism}
              options={RITE_MECHANISMS.map((mechanism) => ({
                value: mechanism,
                label: RITE_MECHANISM_LABEL[mechanism]
              }))}
              onChange={(mechanism) => void actions.configure({ mechanism })}
              disabled={spinning}
              hint="Four ways to present the same draw. Locked while a selection is running."
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
                  <code className={styles.inline}>?guides=1</code> to outline it while you cut the
                  artwork.
                </>
              }
            />

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
        </Panel>

        <Panel
          label="Record"
          index="06"
          className={styles.span6}
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
            <p className={styles.hint}>No selections on record.</p>
          ) : (
            <ol className={styles.history}>
              {state.history.map((entry) => (
                <li key={`${entry.petitionId}-${entry.at}`} className={styles.historyRow}>
                  <span className={styles.historyTime}>{formatLogTime(entry.at)}</span>
                  <span className={styles.historyLabel} title={entry.label}>
                    {entry.label}
                  </span>
                  <span className={styles.historyOdds}>1 / {entry.poolSize}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </motion.div>
    </div>
  )
}

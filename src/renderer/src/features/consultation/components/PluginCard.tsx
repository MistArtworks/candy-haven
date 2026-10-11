import { useId, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  DYNAMICS_LABEL,
  TOOL_LABEL,
  describeBand,
  describeChain,
  formatDb,
  type Chain,
  type ToolKind
} from '@shared/consult/engine'
import { Toggle } from '@renderer/components/primitives/Toggle'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { sheetResizeTransition } from '@renderer/motion/transitions'
import { EqCurve } from './EqCurve'
import styles from '../Consultation.module.scss'

export interface PluginCardProps {
  kind: ToolKind
  /** The tools where this one is: the whole track's, or a section's. */
  chain: Chain
  /** Heard, or switched off here to hear the track without it. */
  on: boolean
  /** Unfolded, its settings shown; folded, one line. */
  open: boolean
  onSwitch: (on: boolean) => void
  onFold: (open: boolean) => void
  analyserRef: RefObject<AnalyserNode | null>
  /** Whether the transport is playing this track now, for the EQ's spectrum. */
  live: boolean
}

const percent = (value: number): string => `${Math.round(value * 100)}%`
const ms = (seconds: number): string => `${Math.round(seconds * 1000)} ms`

/**
 * One of a producer's tools, as the website's page shows it to them: its
 * name, and under it what they set, in words (the EQ as its curve too, over
 * the track's spectrum while it plays). Folds to one line; switches off,
 * to hear the track through the rest of their tools without it.
 */
export function PluginCard({
  kind,
  chain,
  on,
  open,
  onSwitch,
  onFold,
  analyserRef,
  live
}: PluginCardProps): ReactNode {
  const animating = useAnimationsEnabled()
  const bodyId = useId()
  const name = TOOL_LABEL[kind]

  return (
    <section className={styles.plugin} data-off={!on || undefined} aria-label={name}>
      <div className={styles.pluginHead}>
        <button
          type="button"
          className={styles.pluginFold}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onFold(!open)}
        >
          <svg
            className={styles.chevron}
            viewBox="0 0 8 8"
            width="8"
            height="8"
            fill="none"
            aria-hidden="true"
          >
            <path d="M2.5 1.2 5.3 4 2.5 6.8" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <span className={styles.pluginName}>{name}</span>
          {open ? null : (
            <span className={styles.pluginSummary}>{on ? summaryOf(kind, chain) : 'Off'}</span>
          )}
        </button>
        <Toggle
          checked={on}
          onChange={onSwitch}
          label={name}
          tone="gold"
          tooltip={on ? 'Switch it off, to hear the track without it' : 'Switch it back on'}
        />
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            id={bodyId}
            className={styles.pluginBody}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={animating ? sheetResizeTransition : { duration: 0 }}
          >
            <div className={styles.pluginInner}>
              <Settings kind={kind} chain={chain} analyserRef={analyserRef} live={live} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  )
}

/** A folded card's one line: the tool in words, without its name again. */
function summaryOf(kind: ToolKind, chain: Chain): string {
  const alone: Chain = {
    eq: kind === 'eq' ? chain.eq : [],
    saturation: kind === 'saturation' ? chain.saturation : null,
    sidechain: kind === 'sidechain' ? chain.sidechain : null,
    width: kind === 'width' ? chain.width : null,
    dynamics: kind === 'dynamics' ? chain.dynamics : null
  }
  const prefix = `${TOOL_LABEL[kind]} `
  return describeChain(alone)
    .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line))
    .join(' · ')
}

/** What they set on one tool, a line each, in the order the website's controls have them. */
function Settings({
  kind,
  chain,
  analyserRef,
  live
}: {
  kind: ToolKind
  chain: Chain
  analyserRef: RefObject<AnalyserNode | null>
  live: boolean
}): ReactNode {
  if (kind === 'eq') {
    const bands = [...chain.eq].sort((a, b) => a.frequency - b.frequency)
    return (
      <>
        <EqCurve
          bands={chain.eq}
          analyserRef={analyserRef}
          live={live}
          className={styles.eqLarge}
        />
        <ul className={styles.bands}>
          {bands.map((band) => (
            <li key={band.id} className={styles.band}>
              {describeBand(band)}
            </li>
          ))}
        </ul>
      </>
    )
  }

  const rows = valuesOf(kind, chain)
  return (
    <dl className={styles.values}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.value}>
          <dt className={styles.valueLabel}>{label}</dt>
          <dd className={styles.valueText}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function valuesOf(kind: Exclude<ToolKind, 'eq'>, chain: Chain): Array<[string, string]> {
  switch (kind) {
    case 'saturation': {
      const tool = chain.saturation
      if (!tool) return []
      return [
        ['Drive', formatDb(tool.drive)],
        ['Mix', percent(tool.mix)],
        ['Output', formatDb(tool.output)]
      ]
    }
    case 'sidechain': {
      const tool = chain.sidechain
      if (!tool) return []
      return [
        ['Every', `${tool.rate} at ${Number(tool.bpm.toFixed(2))} BPM`],
        ['Depth', percent(tool.depth)],
        ['Release', percent(tool.release)],
        ['Nudge', `${tool.offset > 0 ? '+' : ''}${tool.offset} ms`]
      ]
    }
    case 'width': {
      const tool = chain.width
      if (!tool) return []
      const reads =
        tool.width === 0
          ? 'mono'
          : tool.width < 1
            ? 'narrower'
            : tool.width > 1
              ? 'wider'
              : 'as it is'
      return [['Width', `${percent(tool.width)}, ${reads}`]]
    }
    case 'dynamics': {
      const tool = chain.dynamics
      if (!tool) return []
      const compressor = tool.mode === 'compressor'
      return [
        ['Mode', DYNAMICS_LABEL[tool.mode]],
        ['Threshold', formatDb(tool.threshold)],
        ...(compressor
          ? ([
              ['Ratio', `${Number(tool.ratio.toFixed(1))}:1`],
              ['Knee', formatDb(tool.knee)],
              ['Attack', ms(tool.attack)]
            ] as Array<[string, string]>)
          : []),
        ['Release', ms(tool.release)],
        ['Gain', formatDb(tool.makeup)]
      ]
    }
  }
}

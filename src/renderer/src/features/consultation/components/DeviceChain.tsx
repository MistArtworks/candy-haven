import { useId, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  DYNAMICS_LABEL,
  describeBand,
  deviceTitle,
  formatDb,
  summarizeDevice,
  type Chain,
  type Device
} from '@shared/consult/engine'
import { Toggle } from '@renderer/components/primitives/Toggle'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { sheetResizeTransition } from '@renderer/motion/transitions'
import { EqCurve } from './EqCurve'
import styles from '../Consultation.module.scss'

export interface DeviceChainProps {
  /** Their devices in one place, the whole track's or a section's, in the order heard. */
  chain: Chain
  /** Whether a device is heard now: as they left it, unless switched here. */
  heard: (device: Device) => boolean
  onSwitch: (device: Device, on: boolean) => void
  /** The device shown below the strip. */
  openId: string | null
  onOpen: (deviceId: string) => void
  /** The shown device folded away to its one line. */
  folded: boolean
  onFold: (folded: boolean) => void
  analyserRef: RefObject<AnalyserNode | null>
  /** Whether this track is playing now, for the EQ's spectrum. */
  live: boolean
}

const percent = (value: number): string => `${Math.round(value * 100)}%`
const ms = (seconds: number): string => `${Math.round(seconds * 1000)} ms`

/**
 * A producer's chain as the website showed it to them: their devices in a
 * row, in the order they are heard, each with its own switch, and the one
 * picked shown under it. Read-only here; a switch is only for hearing the
 * track without that device, and changes nothing they sent.
 */
export function DeviceChain({
  chain,
  heard,
  onSwitch,
  openId,
  onOpen,
  folded,
  onFold,
  analyserRef,
  live
}: DeviceChainProps): ReactNode {
  const animating = useAnimationsEnabled()
  const bodyId = useId()
  const open = chain.devices.find((device) => device.id === openId) ?? chain.devices[0] ?? null

  return (
    <div className={styles.deviceChain}>
      <ol className={styles.strip} aria-label="Their chain, in the order it is heard">
        {chain.devices.map((device) => {
          const title = deviceTitle(chain, device)
          const on = heard(device)
          const summary = on ? summarizeDevice(device) : 'Off'
          return (
            <li
              key={device.id}
              className={styles.device}
              data-open={device.id === open?.id || undefined}
              data-off={!on || undefined}
            >
              <button
                type="button"
                className={styles.deviceOpen}
                aria-pressed={device.id === open?.id}
                aria-label={`${title}, ${summary}`}
                onClick={() => onOpen(device.id)}
              >
                <span className={styles.deviceName}>{title}</span>
                <span className={styles.deviceSummary}>{summary}</span>
              </button>
              <Toggle
                checked={on}
                onChange={(next) => onSwitch(device, next)}
                label={title}
                tone="gold"
                tooltip={on ? 'Switch it off, to hear the track without it' : 'Switch it back on'}
              />
            </li>
          )
        })}
      </ol>

      {open ? (
        <section className={styles.plugin} data-off={!heard(open) || undefined}>
          <div className={styles.pluginHead}>
            <button
              type="button"
              className={styles.pluginFold}
              aria-expanded={!folded}
              aria-controls={bodyId}
              onClick={() => onFold(!folded)}
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
              <span className={styles.pluginName}>{deviceTitle(chain, open)}</span>
              {folded ? (
                <span className={styles.pluginSummary}>
                  {heard(open) ? summarizeDevice(open) : 'Off'}
                </span>
              ) : null}
            </button>
            {open.on ? null : <span className={styles.offNote}>Off when they sent it</span>}
          </div>

          <AnimatePresence initial={false}>
            {folded ? null : (
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
                  <Settings device={open} analyserRef={analyserRef} live={live} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      ) : null}
    </div>
  )
}

/** What they set on one device, in the order the website's controls have it. */
function Settings({
  device,
  analyserRef,
  live
}: {
  device: Device
  analyserRef: RefObject<AnalyserNode | null>
  live: boolean
}): ReactNode {
  if (device.kind === 'eq') {
    const bands = [...device.bands].sort((a, b) => a.frequency - b.frequency)
    return (
      <>
        <EqCurve
          bands={device.bands}
          analyserRef={analyserRef}
          live={live}
          className={styles.eqLarge}
        />
        {bands.length ? (
          <ul className={styles.bands}>
            {bands.map((band) => (
              <li key={band.id} className={styles.band}>
                {describeBand(band)}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.footnote}>No points: it leaves the sound as it is.</p>
        )}
      </>
    )
  }

  return (
    <dl className={styles.values}>
      {valuesOf(device).map(([label, value]) => (
        <div key={label} className={styles.value}>
          <dt className={styles.valueLabel}>{label}</dt>
          <dd className={styles.valueText}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function valuesOf(device: Exclude<Device, { kind: 'eq' }>): Array<[string, string]> {
  if (device.kind === 'width') {
    const { width } = device.width
    const reads = width === 0 ? 'mono' : width < 1 ? 'narrower' : width > 1 ? 'wider' : 'as it is'
    return [['Width', `${percent(width)}, ${reads}`]]
  }
  const d = device.dynamics
  const compressor = d.mode === 'compressor'
  return [
    ['Mode', DYNAMICS_LABEL[d.mode]],
    ['Threshold', formatDb(d.threshold)],
    ...(compressor
      ? ([
          ['Ratio', `${Number(d.ratio.toFixed(1))}:1`],
          ['Knee', formatDb(d.knee)],
          ['Attack', ms(d.attack)]
        ] as Array<[string, string]>)
      : []),
    ['Release', ms(d.release)],
    ['Gain', formatDb(d.makeup)]
  ]
}

import { useEffect, type ReactNode } from 'react'
import { motion, useTransform } from 'motion/react'
import { RETICLE_GEOMETRY } from '@shared/domain/reticle'
import { useSystemStore, selectSettings } from '@renderer/app/store/system.store'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { Portal } from '@renderer/components/primitives/Portal'
import { useReticle } from './useReticle'
import styles from './Reticle.module.scss'

const { field, ring } = RETICLE_GEOMETRY

/** The mark is drawn in its own square and scaled to `field` pixels. */
const VIEW = 100
const CENTRE = VIEW / 2
/** Ring radius in view units, so the drawn ring is `ring` px across. */
const R = (ring / field) * CENTRE

/** Centres a layer on its own position, after the translation motion applies. */
const centred = (_latest: unknown, generated: string): string =>
  `${generated} translate(-50%, -50%)`

/**
 * THE RETICLE — the console's pointer.
 *
 * The world brief lists Surveillance among its six anchors, and a pointer is
 * plainly an instrument of it. So this is not a dot that follows the mouse: it
 * is a survey instrument that tracks, acquires a target, and stamps. The
 * geometry is `Sigil.tsx` — the consciousness ring, the four cardinal ticks,
 * the focal centre — reduced to something that reads at 22px.
 *
 * Four layers, each moving on its own terms:
 *
 *   - the **dot**, at the true pointer position with no spring at all, so
 *     precision is never lost to animation;
 *   - the **ring**, trailing on a loose spring, steering into its direction of
 *     travel and stretching with speed — its lag is the effect, the instrument
 *     catching up with the operator;
 *   - the **frame**, four corner marks bracketing an acquired target;
 *   - the **caret**, for a line of text.
 *
 * Colour follows the locked rules. Alabaster at rest, brushed gold on a lock —
 * gold is already the palette's language for active states — and crimson only
 * on press, for a moment. Rule 2 reserves crimson for focal points and live
 * state, and rule 1 allows one focal object per view; a press is momentary and
 * genuinely live, so it never stands as a second focal object against a page
 * that already has one.
 *
 * Portalled, because `ConsoleLayout` animates each page with transforms and a
 * transformed ancestor becomes the containing block for `position: fixed`
 * descendants — see `Portal.tsx`, which exists for exactly this. Everything is
 * `pointer-events: none`; the mark must never become a hit target itself.
 */
export function Reticle(): ReactNode {
  const settings = useSystemStore(selectSettings)
  /*
   * `native` while the settings are still null, whatever the schema's default
   * is. Every other preference here can be guessed at and corrected a frame
   * later; this one hides the system cursor, and guessing it wrong — before
   * hydration, or for good if the store never hydrates at all — takes the
   * arrow away on the strength of something nobody has actually said yet.
   */
  const preference = settings?.appearance.pointer ?? 'native'
  const motionPreference = settings?.appearance.motion ?? 'full'
  const animated = useAnimationsEnabled()

  // `motion: off` takes the whole instrument with it — it is all movement.
  const enabled = preference === 'reticle' && motionPreference !== 'off'

  const { state, visible, pressed, target, caretHeight, values } = useReticle(enabled, animated)

  /*
   * The component that hides the system cursor is the component that replaces
   * it.
   *
   * `styles/base/_reset.scss` keys `cursor: none` off this attribute, so
   * setting it is a promise that a mark is being drawn. Owning it here means
   * the promise is kept by construction: React runs this cleanup when the
   * reticle unmounts for *any* reason — the setting turned off, motion set to
   * off, or a throw caught by the error boundary above — and the arrow comes
   * straight back. Written from `useThemePreferences` it survived all three,
   * and a crash left the operator with no pointer at all.
   */
  useEffect(() => {
    const root = document.documentElement
    if (!enabled) {
      root.dataset.pointer = 'native'
      return
    }

    root.dataset.pointer = 'reticle'
    return () => {
      root.dataset.pointer = 'native'
    }
  }, [enabled])

  // Motion works in degrees; the unwrapped angle is kept in radians because
  // that is what `Math.atan2` and the unwrapping arithmetic speak.
  const rotateDeg = useTransform(values.rotate, (radians) => (radians * 180) / Math.PI)

  if (!enabled) return null

  const showRing = state !== 'text' && state !== 'native'
  const showFrame = state === 'lock' && target !== null

  return (
    <Portal>
      <div className={styles.layer} aria-hidden="true" data-visible={visible || undefined}>
        {/*
          The acquired target, bracketed. Four corner marks rather than a filled
          box: corners are square in this interface by rule, and a survey frame
          is what the instrument is for. It leans toward the pointer without the
          element ever moving — see `leanFor` for why nothing in the app may be
          transformed from here.
        */}
        <motion.div
          className={styles.frame}
          data-on={showFrame || undefined}
          transformTemplate={centred}
          style={{
            x: values.frameX,
            y: values.frameY,
            width: values.frameW,
            height: values.frameH,
            // Square by default; picks up a control's 2px where it has one.
            borderRadius: target?.radius ?? 0
          }}
        >
          <span className={styles.corner} data-at="tl" />
          <span className={styles.corner} data-at="tr" />
          <span className={styles.corner} data-at="bl" />
          <span className={styles.corner} data-at="br" />
        </motion.div>

        {/*
          The ring. The transform order is translate, then rotate, then scale:
          scaling before the rotation would swing the elongation off the
          direction of travel, which is the one thing it exists to point along.
          Motion composes in that order by default, and `transform-origin` is
          the element's centre, which the negative margin in the stylesheet
          arranges without a `-50%` that would fight the rotation.
        */}
        <motion.svg
          className={styles.ring}
          data-state={state}
          data-on={showRing || undefined}
          data-pressed={pressed || undefined}
          width={field}
          height={field}
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          fill="none"
          style={{
            x: values.ringX,
            y: values.ringY,
            rotate: rotateDeg,
            scaleX: values.scaleX,
            scaleY: values.scaleY
          }}
        >
          {/* Consciousness ring. */}
          <circle className={styles.ringLine} cx={CENTRE} cy={CENTRE} r={R} />

          {/* Inner containment ring — surfaces only once something is held. */}
          <circle className={styles.ringInner} cx={CENTRE} cy={CENTRE} r={R * 0.62} />

          {/* Cardinal axis ticks, straight off the Sigil. */}
          <g className={styles.ticks}>
            <line x1={CENTRE} y1={CENTRE - R - 6} x2={CENTRE} y2={CENTRE - R - 2.5} />
            <line x1={CENTRE} y1={CENTRE + R + 2.5} x2={CENTRE} y2={CENTRE + R + 6} />
            <line x1={CENTRE - R - 6} y1={CENTRE} x2={CENTRE - R - 2.5} y2={CENTRE} />
            <line x1={CENTRE + R + 2.5} y1={CENTRE} x2={CENTRE + R + 6} y2={CENTRE} />
          </g>

          {/* Crosshair arms, gapped at the centre. PRECISION only. */}
          <g className={styles.cross}>
            <line x1={CENTRE} y1={CENTRE - R - 10} x2={CENTRE} y2={CENTRE - 4} />
            <line x1={CENTRE} y1={CENTRE + 4} x2={CENTRE} y2={CENTRE + R + 10} />
            <line x1={CENTRE - R - 10} y1={CENTRE} x2={CENTRE - 4} y2={CENTRE} />
            <line x1={CENTRE + 4} y1={CENTRE} x2={CENTRE + R + 10} y2={CENTRE} />
          </g>

          {/* The refusal. One bar struck through the ring. */}
          <line
            className={styles.strike}
            x1={CENTRE - R * 0.72}
            y1={CENTRE + R * 0.72}
            x2={CENTRE + R * 0.72}
            y2={CENTRE - R * 0.72}
          />
        </motion.svg>

        {/* The caret, sized to the line of text it is over. */}
        <motion.span
          className={styles.caret}
          data-on={state === 'text' || undefined}
          transformTemplate={centred}
          style={{ x: values.x, y: values.y, height: caretHeight }}
        />

        {/*
          The focal centre, at the true pointer position and deliberately not
          sprung. Everything else may lag; this may not, because it is what the
          operator is actually aiming with.
        */}
        <motion.span
          className={styles.dot}
          data-on={showRing || undefined}
          data-pressed={pressed || undefined}
          style={{ x: values.x, y: values.y }}
        />

        {/* The stamp: one crimson pulse on press, then gone. */}
        <motion.span
          className={styles.stamp}
          data-on={(pressed && animated) || undefined}
          style={{ x: values.x, y: values.y }}
        />
      </div>
    </Portal>
  )
}

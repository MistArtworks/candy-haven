import { useEffect, useRef, useState } from 'react'
import {
  cancelFrame,
  frame,
  useMotionValue,
  useSpring,
  useVelocity,
  type MotionValue
} from 'motion/react'
import type { ReticleState } from '@shared/domain/reticle'
import {
  CURSOR_PROBE_ATTR,
  RETICLE_SPRINGS,
  RETICLE_SPRINGS_REDUCED,
  STEER_THRESHOLD,
  enteredChrome,
  leanFor,
  resolveState,
  stretchFor,
  unwrapAngle
} from '@shared/domain/reticle'

/** The acquired element's frame, in viewport coordinates. */
export interface ReticleTarget {
  width: number
  height: number
  radius: number
}

export interface Reticle {
  state: ReticleState
  /** False while the window is blurred, or the pointer is off in the chrome. */
  visible: boolean
  pressed: boolean
  target: ReticleTarget | null
  /** Line height of the text under the pointer, for the caret. */
  caretHeight: number
  values: {
    /** True pointer position. No spring — the focal dot must not lag. */
    x: MotionValue<number>
    y: MotionValue<number>
    /** The ring, trailing. Its lag is the effect. */
    ringX: MotionValue<number>
    ringY: MotionValue<number>
    rotate: MotionValue<number>
    scaleX: MotionValue<number>
    scaleY: MotionValue<number>
    /** The target frame, already leaning toward the pointer. */
    frameX: MotionValue<number>
    frameY: MotionValue<number>
    frameW: MotionValue<number>
    frameH: MotionValue<number>
  }
}

/** How long a hit test may stand before it is re-run regardless. */
const RETEST_INTERVAL_MS = 250

/**
 * How far up the probe lifts the hiding rule.
 *
 * `cursor` inherits, so exempting only the hit element would leave it
 * inheriting `none` from its still-hidden parent and nothing would be learned.
 * The chain has to reach whichever ancestor actually declared the cursor —
 * `<button>` for the span inside it, `[data-selectable]` for a word inside a
 * paragraph inside a dossier. Twelve clears every such case in this interface
 * with room to spare.
 *
 * It stops short of `<body>`, deliberately. Body carries the app-wide
 * `cursor: default`, so including it would exempt the one element whose subtree
 * is the entire document and make every probe a full style recalculation. Left
 * out, an element with nothing declared above it resolves to `none` instead —
 * which `resolveState` reads as "nothing in reach declared a cursor" and treats
 * exactly as it treats body's `default`.
 */
const PROBE_DEPTH = 12

/** Guard on the walk up to the framed ancestor. Never beyond what was probed. */
const FRAME_WALK_LIMIT = 6

/** One element and its ancestors, measured with the hiding rule lifted. */
interface CursorProbe {
  /** The chain that was measured, hit element first. */
  chain: Element[]
  /** Each one's `cursor`, in the same order. */
  cursors: string[]
  /** The hit element's line box, for the caret. */
  lineHeight: number
  fontSize: number
}

/**
 * What the stylesheet would draw here if the reticle were not hiding it.
 *
 * This is the whole trick, and it is the piece 1.11.0 was missing. The reset
 * writes `cursor: none !important` over every element to take the system arrow
 * away, which also erases the very declarations this instrument reads to decide
 * what to draw. So the chain is marked with `CURSOR_PROBE_ATTR`, which that
 * rule excludes, measured, and unmarked — all inside one synchronous block, so
 * no frame is ever painted with the arrow back.
 *
 * Marked in one pass and read in another on purpose: the first `getComputedStyle`
 * flushes style for the whole batch, so a twelve-deep walk costs one
 * recalculation rather than twelve. And because the topmost link's parent stays
 * hidden, an ancestor that declares nothing still computes `none` and its own
 * subtree is left untouched — only the branch below a genuine declaration is
 * recalculated, which in practice is one control.
 */
function probeCursors(element: Element): CursorProbe {
  const chain: Element[] = [element]

  let current = element.parentElement
  while (chain.length < PROBE_DEPTH && current && current !== document.body) {
    chain.push(current)
    current = current.parentElement
  }

  for (const node of chain) node.setAttribute(CURSOR_PROBE_ATTR, '')

  const style = getComputedStyle(element)
  const probe: CursorProbe = {
    chain,
    cursors: chain.map((node) => getComputedStyle(node).cursor),
    lineHeight: parseFloat(style.lineHeight),
    fontSize: parseFloat(style.fontSize)
  }

  for (const node of chain) node.removeAttribute(CURSOR_PROBE_ATTR)

  return probe
}

/**
 * The element the frame should measure, given what the pointer is actually on.
 *
 * Hovering the label inside a button should frame the button, not the two
 * words. Rather than matching a list of selectors — which would be a list to
 * keep in step with the whole interface — this walks up for as long as the
 * ancestor is *also* declaring itself interactive. `cursor` inherits, so the
 * span inside a button reports `pointer` and so does the button; the button's
 * container does not, and that is where the walk stops.
 *
 * It reads the chain the probe already measured rather than measuring again,
 * because a second `getComputedStyle` after the marks came off would read the
 * hiding rule's `none` and stop at the first step every time.
 */
function framedAncestor(probe: CursorProbe): Element {
  let framed = probe.chain[0]

  for (let depth = 1; depth <= FRAME_WALK_LIMIT && depth < probe.chain.length; depth += 1) {
    if (probe.cursors[depth] !== 'pointer') break
    framed = probe.chain[depth]
  }

  return framed
}

/**
 * Drives the reticle: where it is, what it is doing, and what it has acquired.
 *
 * Two rules shape all of it.
 *
 * **React is told as little as possible.** Position, rotation, stretch and the
 * frame's box are motion values written straight to transforms, so moving the
 * mouse across the screen re-renders nothing. `setState` fires only when the
 * state itself changes — idle to lock and back — which is a few times a second
 * at most rather than a few times a frame.
 *
 * **Hit testing runs on a frame loop, not on pointer events.** The element
 * under a stationary pointer changes when a panel scrolls, when a dialog opens,
 * when a list re-renders — none of which produce a pointer event.
 * `elementFromPoint` on Motion's read phase catches all of them, and stays
 * cheap because it only runs when something might have changed.
 */
export function useReticle(enabled: boolean, animated: boolean): Reticle {
  const [state, setState] = useState<ReticleState>('idle')
  const [visible, setVisible] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [target, setTarget] = useState<ReticleTarget | null>(null)
  const [caretHeight, setCaretHeight] = useState(16)

  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const ringSpring = animated ? RETICLE_SPRINGS.ring : RETICLE_SPRINGS_REDUCED
  const frameSpring = animated ? RETICLE_SPRINGS.bracket : RETICLE_SPRINGS_REDUCED
  const shapeSpring = animated ? RETICLE_SPRINGS.shape : RETICLE_SPRINGS_REDUCED

  const ringX = useSpring(x, ringSpring)
  const ringY = useSpring(y, ringSpring)

  const velocityX = useVelocity(x)
  const velocityY = useVelocity(y)

  const rotateRaw = useMotionValue(0)
  const rotate = useSpring(rotateRaw, shapeSpring)

  const scaleXRaw = useMotionValue(1)
  const scaleYRaw = useMotionValue(1)
  const scaleX = useSpring(scaleXRaw, shapeSpring)
  const scaleY = useSpring(scaleYRaw, shapeSpring)

  const frameXRaw = useMotionValue(0)
  const frameYRaw = useMotionValue(0)
  const frameWRaw = useMotionValue(0)
  const frameHRaw = useMotionValue(0)
  const frameX = useSpring(frameXRaw, frameSpring)
  const frameY = useSpring(frameYRaw, frameSpring)
  const frameW = useSpring(frameWRaw, frameSpring)
  const frameH = useSpring(frameHRaw, frameSpring)

  /*
   * Everything the loop carries between frames, off React's books. Any of this
   * in state would re-render on every mouse move.
   */
  const io = useRef({
    px: -1,
    py: -1,
    lastMove: 0,
    /** Vertical speed at the last reported move, px/s. Negative is upward. */
    vy: 0,
    dirty: true,
    lastTest: 0,
    seen: false,
    state: 'idle' as ReticleState,
    visible: false,
    /** The element the last probe measured, so an unchanged one is not re-measured. */
    probed: null as Element | null,
    element: null as Element | null,
    box: null as ReticleTarget | null,
    /** Bottom edge of the window chrome, measured rather than hard-coded. */
    chromeBottom: 0,
    chromeMeasured: 0
  })

  // ------------------------------------------------------------------ input

  useEffect(() => {
    if (!enabled) return
    const store = io.current

    const onPointerMove = (event: PointerEvent): void => {
      const first = !store.seen
      const now = performance.now()

      /*
       * Vertical speed at the moment of this event, kept so the loop can tell
       * a pointer thrown at the title bar from one that simply stopped.
       */
      const elapsed = now - store.lastMove
      store.vy =
        !first && elapsed > 0 && elapsed < 120 ? ((event.clientY - store.py) / elapsed) * 1000 : 0

      store.px = event.clientX
      store.py = event.clientY
      store.lastMove = now
      store.dirty = true
      store.seen = true

      x.set(event.clientX)
      y.set(event.clientY)

      /*
       * The first sighting teleports rather than travels.
       *
       * Motion values start at 0, so without this the ring springs in from the
       * top-left corner of the window the first time the pointer is seen — and
       * again every time it comes back from the chrome or from another window.
       * `jump` moves the spring without animating it.
       */
      if (first) {
        ringX.jump(event.clientX)
        ringY.jump(event.clientY)
      }
    }

    const onDown = (): void => setPressed(true)
    const onUp = (): void => setPressed(false)

    const onLeave = (event: PointerEvent): void => {
      // Null `relatedTarget` means the pointer left the window rather than
      // crossing between two elements inside it.
      if (event.relatedTarget === null) {
        store.seen = false
        store.visible = false
        setVisible(false)
      }
    }

    const onBlur = (): void => {
      store.seen = false
      store.visible = false
      setVisible(false)
      setPressed(false)
    }

    const onScroll = (): void => {
      store.dirty = true
    }

    const onResize = (): void => {
      store.chromeMeasured = 0
      store.dirty = true
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', onUp, { passive: true })
    window.addEventListener('blur', onBlur)
    window.addEventListener('resize', onResize, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    // Capture, because this console scrolls inside panels rather than on the
    // document — a bubbling listener would never hear most of them.
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [enabled, x, y, ringX, ringY])

  // ------------------------------------------------------------- the loop

  useEffect(() => {
    // Nothing to drive, and nothing rendered either — the component returns
    // null while disabled, so the stale `visible` never reaches the screen and
    // the loop recomputes it from `seen` the moment the setting comes back.
    if (!enabled) return

    const store = io.current

    const read = (): void => {
      const now = performance.now()

      // ---- steering and stretch, from velocity
      const vx = velocityX.get()
      const vy = velocityY.get()
      const speed = Math.hypot(vx, vy)

      if (speed > STEER_THRESHOLD) {
        rotateRaw.set(unwrapAngle(rotateRaw.get(), Math.atan2(vy, vx)))
      }

      const stretch = stretchFor(speed)
      scaleXRaw.set(stretch.scaleX)
      scaleYRaw.set(stretch.scaleY)

      /*
       * Whether the pointer has gone into the window chrome.
       *
       * `-webkit-app-region: drag` regions swallow mouse events outright in
       * Electron, so the last event we ever see is the one just short of the
       * title bar and a naive implementation leaves the mark frozen there while
       * the operator drags the window. There is no event to listen for, so this
       * infers it: close to the boundary, and gone quiet, means crossed. Any
       * movement below the line fires an event again and restores it at once.
       *
       * The boundary is measured off the element rather than mirrored from
       * `$titlebar-height`. A TS copy of that value existed once and drifted;
       * see the note in `_tokens.scss`.
       */
      if (now - store.chromeMeasured > 1000) {
        store.chromeMeasured = now
        const chrome = document.querySelector('[data-reticle="native"]')
        store.chromeBottom = chrome ? chrome.getBoundingClientRect().bottom : 0
      }

      const inChrome = enteredChrome({
        y: store.py,
        chromeBottom: store.chromeBottom,
        sinceMove: now - store.lastMove,
        vy: store.vy
      })

      const shouldShow = store.seen && !inChrome
      if (shouldShow !== store.visible) {
        store.visible = shouldShow
        setVisible(shouldShow)
      }

      // ---- hit test, only when something might have changed
      if (store.dirty || now - store.lastTest > RETEST_INTERVAL_MS) {
        const stale = now - store.lastTest > RETEST_INTERVAL_MS
        store.dirty = false

        const element = store.seen ? document.elementFromPoint(store.px, store.py) : null

        /*
         * The probe writes to the DOM, so it is the one part of this loop worth
         * being stingy with. Travelling within a single element — which is most
         * frames of most mouse movements — reuses the last answer, and only a
         * change of element or the retest interval buys a new one. The interval
         * is what catches a button that became disabled under a pointer that
         * never moved.
         */
        if (!element) {
          store.lastTest = now
          store.probed = null
          if (store.state !== 'idle') {
            store.state = 'idle'
            setState('idle')
          }
          store.element = null
        } else if (stale || element !== store.probed) {
          store.lastTest = now
          store.probed = element

          const probe = probeCursors(element)
          const overrideHost = element.closest('[data-reticle]')
          const next = resolveState({
            cursor: probe.cursors[0],
            tagName: element.tagName,
            override: overrideHost?.getAttribute('data-reticle') ?? null,
            selectable: element.closest('[data-selectable]') !== null
          })

          if (next !== store.state) {
            store.state = next
            setState(next)
          }

          if (next === 'text') {
            const { lineHeight, fontSize } = probe
            setCaretHeight(Number.isFinite(lineHeight) ? lineHeight : (fontSize || 12) * 1.4)
          }

          store.element = next === 'lock' ? framedAncestor(probe) : null
        }
      }

      // ---- the frame, re-measured every frame it exists
      const framed = store.state === 'lock' ? store.element : null
      if (framed) {
        const box = framed.getBoundingClientRect()
        const radius = parseFloat(getComputedStyle(framed).borderTopLeftRadius) || 0

        const cx = box.left + box.width / 2
        const cy = box.top + box.height / 2

        frameXRaw.set(cx + leanFor(store.px - cx, box.width))
        frameYRaw.set(cy + leanFor(store.py - cy, box.height))
        frameWRaw.set(box.width)
        frameHRaw.set(box.height)

        const previous = store.box
        if (
          !previous ||
          previous.width !== box.width ||
          previous.height !== box.height ||
          previous.radius !== radius
        ) {
          const measured = { width: box.width, height: box.height, radius }
          store.box = measured
          setTarget(measured)
        }
      } else if (store.box) {
        store.box = null
        setTarget(null)
      }
    }

    // `keepAlive` re-queues it every frame; `cancelFrame` is the only way off.
    frame.read(read, true)
    return () => cancelFrame(read)
  }, [
    enabled,
    velocityX,
    velocityY,
    rotateRaw,
    scaleXRaw,
    scaleYRaw,
    frameXRaw,
    frameYRaw,
    frameWRaw,
    frameHRaw
  ])

  return {
    state,
    visible,
    pressed,
    target,
    caretHeight,
    values: { x, y, ringX, ringY, rotate, scaleX, scaleY, frameX, frameY, frameW, frameH }
  }
}

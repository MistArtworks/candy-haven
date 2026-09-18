import { useCallback, useRef, type MouseEvent } from 'react'

export interface BackdropDismissProps {
  onMouseDown: (event: MouseEvent<HTMLElement>) => void
  onMouseUp: (event: MouseEvent<HTMLElement>) => void
}

/**
 * Dismissing an overlay by pressing its scrim, and *only* its scrim.
 *
 * ## The bug this exists to stop
 *
 * Selecting text in a field, dragging the pointer past the edge of the sheet,
 * and releasing closed the overlay — losing whatever was being edited.
 *
 * It is not a stray handler. A `click` event fires on the nearest common
 * ancestor of where the press went down and where it came up, so a drag that
 * starts in a title field and ends on the scrim produces a `click` whose
 * target **is the scrim**. The sheet's own `stopPropagation` never runs,
 * because the event was never dispatched inside the sheet at all. Every guard
 * written in terms of the click alone — `event.target === event.currentTarget`
 * included — is satisfied by exactly the gesture that must not dismiss.
 *
 * ## Why `mouseup` rather than `click`
 *
 * Because the press and the release have to be judged separately, and `click`
 * has already collapsed them into one event by the time it arrives. Dismissing
 * requires **both** ends of the gesture to be the scrim itself:
 *
 * | Down | Up | Result |
 * | --- | --- | --- |
 * | scrim | scrim | dismissed — the only gesture that means it |
 * | field | scrim | ignored — a text selection that overshot |
 * | scrim | sheet | ignored — a drag that ended on the record |
 * | sheet | sheet | ignored, and never reaches here anyway |
 *
 * Spread onto the scrim element, which must be the same element the sheet is
 * a child of:
 *
 * ```tsx
 * const dismiss = useBackdropDismiss(onClose)
 * <motion.div className={styles.sheetBackdrop} {...dismiss}>
 * ```
 *
 * `ProjectDossier` needs none of this and is left alone: its scrim is a real
 * `button` **beside** the sheet rather than around it, so the common ancestor
 * of a stray drag is the layer, which carries no handler. Two shapes, both
 * correct, and worth knowing they are different before touching either.
 */
export function useBackdropDismiss(onDismiss: () => void): BackdropDismissProps {
  /** True while a press that began on the scrim itself is outstanding. */
  const armed = useRef(false)

  const onMouseDown = useCallback((event: MouseEvent<HTMLElement>): void => {
    armed.current = event.target === event.currentTarget
  }, [])

  const onMouseUp = useCallback(
    (event: MouseEvent<HTMLElement>): void => {
      const dismissing = armed.current && event.target === event.currentTarget
      // Disarmed before dismissing, so a re-entrant render cannot see a press
      // that has already been spent.
      armed.current = false
      if (dismissing) onDismiss()
    },
    [onDismiss]
  )

  return { onMouseDown, onMouseUp }
}

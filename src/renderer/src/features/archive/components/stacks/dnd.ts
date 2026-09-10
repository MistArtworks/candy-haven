import type { DragEvent } from 'react'

/**
 * Drag payload vocabulary for the folder browser.
 *
 * Two custom MIME types rather than one `text/plain` id, because this view has
 * two draggable things and they mean different things when dropped: a project
 * lands *in* a folder, a folder lands *beside* its new siblings. Reading the
 * type tells a drop target which it is being offered.
 *
 * `text/plain` is still written alongside. Chromium will not start a drag at
 * all without a payload it recognises, and it is what makes a drag out of the
 * window degrade to something harmless rather than nothing.
 */
export const PROJECT_DRAG_TYPE = 'application/x-candy-project'
export const FOLDER_DRAG_TYPE = 'application/x-candy-folder'

export function beginDrag(
  event: DragEvent<HTMLElement>,
  type: typeof PROJECT_DRAG_TYPE | typeof FOLDER_DRAG_TYPE,
  id: string
): void {
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData(type, id)
  event.dataTransfer.setData('text/plain', id)
}

/**
 * Whether a drag in progress is carrying this kind of thing.
 *
 * Uses `types` rather than `getData`, which is the only option: during
 * `dragover` the browser deliberately withholds the payload, exposing only what
 * kind it is. That is enough to decide whether to light up a drop target.
 */
export function isDragging(
  event: DragEvent<HTMLElement>,
  type: typeof PROJECT_DRAG_TYPE | typeof FOLDER_DRAG_TYPE
): boolean {
  return event.dataTransfer.types.includes(type)
}

/** The dragged id, once the drop has actually happened. */
export function readDrag(
  event: DragEvent<HTMLElement>,
  type: typeof PROJECT_DRAG_TYPE | typeof FOLDER_DRAG_TYPE
): string | null {
  return event.dataTransfer.getData(type) || null
}

/**
 * Whether the pointer has genuinely left an element, rather than crossed onto
 * one of its own children.
 *
 * `dragleave` fires on every child boundary, so without this a tile flickers
 * out of its highlighted state as the cursor passes over the name beneath the
 * icon. The board view solves it the same way.
 */
export function hasLeftElement(event: DragEvent<HTMLElement>): boolean {
  return !event.currentTarget.contains(event.relatedTarget as Node | null)
}

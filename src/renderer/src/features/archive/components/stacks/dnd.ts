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
/** Separates ids in a multi-item payload. */
const SEPARATOR = String.fromCharCode(10)

export const PROJECT_DRAG_TYPE = 'application/x-candy-project'
export const FOLDER_DRAG_TYPE = 'application/x-candy-folder'

/**
 * Starts a drag carrying one or more ids of the same kind.
 *
 * Ids are newline-separated rather than JSON. The payload also goes into
 * `text/plain` for the reason above, and a dragged-out list of names is a more
 * useful thing to drop into a text field than a JSON array.
 *
 * A single id is just a list of one, so every drop target reads the same shape
 * and nothing has to branch on how many are coming.
 */
export function beginDrag(
  event: DragEvent<HTMLElement>,
  type: typeof PROJECT_DRAG_TYPE | typeof FOLDER_DRAG_TYPE,
  ids: string | readonly string[]
): void {
  const payload = (Array.isArray(ids) ? ids : [ids as string]).join(SEPARATOR)
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData(type, payload)
  event.dataTransfer.setData('text/plain', payload)
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

/** The first dragged id, once the drop has actually happened. */
export function readDrag(
  event: DragEvent<HTMLElement>,
  type: typeof PROJECT_DRAG_TYPE | typeof FOLDER_DRAG_TYPE
): string | null {
  return readDragAll(event, type)[0] ?? null
}

/** Every dragged id. A single-item drag returns a list of one. */
export function readDragAll(
  event: DragEvent<HTMLElement>,
  type: typeof PROJECT_DRAG_TYPE | typeof FOLDER_DRAG_TYPE
): string[] {
  const payload = event.dataTransfer.getData(type)
  return payload ? payload.split(SEPARATOR).filter(Boolean) : []
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

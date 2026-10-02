import { useState, type DragEvent } from 'react'

/** 4 → IV, as the website numbers its chapters. */
export function toRoman(n: number): string {
  const table: Array<[number, string]> = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I']
  ]
  let rest = Math.max(0, Math.floor(n))
  let out = ''
  for (const [value, numeral] of table) {
    while (rest >= value) {
      out += numeral
      rest -= value
    }
  }
  return out
}

/** `moving` put before or after `target`. */
export function moveTo(
  ids: readonly string[],
  moving: string,
  target: string,
  where: 'before' | 'after'
): string[] {
  const rest = ids.filter((id) => id !== moving)
  const at = rest.indexOf(target) + (where === 'after' ? 1 : 0)
  rest.splice(at, 0, moving)
  return rest
}

/** `id` moved one place up (-1) or down (1). */
export function shift(ids: readonly string[], id: string, by: -1 | 1): string[] {
  const from = ids.indexOf(id)
  const to = from + by
  if (from < 0 || to < 0 || to >= ids.length) return [...ids]
  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}

/** What a draggable row spreads onto itself. */
export interface DragRowProps {
  draggable: true
  onDragStart: (event: DragEvent) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent) => void
  onDragEnd: () => void
  'data-dragging': true | undefined
  'data-drop': 'before' | 'after' | undefined
}

/**
 * Dragging rows of a list into a new order: the props each row spreads,
 * and the order a drop asks for. The row under the pointer shows where the
 * dragged one will land, above or below it (`data-drop`).
 */
export function useDragOrder(
  ids: readonly string[],
  onMove: (ids: string[]) => void
): (id: string) => DragRowProps {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; where: 'before' | 'after' } | null>(null)

  const reset = (): void => {
    setDragging(null)
    setOver(null)
  }

  return (id: string) => ({
    draggable: true,
    onDragStart: (event: DragEvent) => {
      setDragging(id)
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', id)
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!dragging || dragging === id) return
      event.preventDefault()
      const box = event.currentTarget.getBoundingClientRect()
      const where = event.clientY < box.top + box.height / 2 ? 'before' : 'after'
      if (over?.id !== id || over.where !== where) setOver({ id, where })
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      if (dragging && over && dragging !== over.id) {
        const next = moveTo(ids, dragging, over.id, over.where)
        if (next.some((value, i) => value !== ids[i])) onMove(next)
      }
      reset()
    },
    onDragEnd: reset,
    'data-dragging': dragging === id || undefined,
    'data-drop': over?.id === id ? over.where : undefined
  })
}

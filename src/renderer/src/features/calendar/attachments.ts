import { useCallback, useState } from 'react'
import type { CalendarEntry, ChecklistItem } from '@shared/domain/calendar'
import { baseName, type Pin, type Target } from '@shared/domain/strip'

export { targetKey } from '@shared/domain/strip'

/**
 * What an entry carries besides its notes: the things it is about, opened in
 * one click, and the steps within it.
 *
 * The limits are the schema's (domain/calendar.ts and domain/strip.ts), held
 * here so the dialog stops at them instead of filing something the archive
 * would refuse.
 */
export const MAX_ATTACHMENTS = 12
export const MAX_STEPS = 40
export const MAX_PIN_LABEL = 80
export const MAX_STEP_TEXT = 200

/** Where a target points, in full, for the hint over its shortened name. */
export function describeTarget(target: Target): string {
  switch (target.kind) {
    case 'file':
    case 'folder':
      return target.path
    case 'link':
      return target.url
    case 'page':
      return target.route
    case 'action':
    case 'stack':
    case 'project':
      return ''
  }
}

/** A pin's name, cut to what the schema allows. */
function pinLabel(value: string): string {
  return value.trim().slice(0, MAX_PIN_LABEL)
}

export function pathPin(kind: 'file' | 'folder', path: string): Pin {
  return {
    id: crypto.randomUUID(),
    label: pinLabel(baseName(path)),
    target: { kind, path }
  }
}

export function projectPin(projectId: string, name: string): Pin {
  return {
    id: crypto.randomUUID(),
    label: pinLabel(name) || 'Project',
    target: { kind: 'project', projectId }
  }
}

/**
 * A web address, or null when it is not one.
 *
 * Only http and https: the address goes to the browser through the main
 * process, which refuses anything else, so it is refused here first where the
 * operator can still fix it.
 */
export function linkPin(raw: string): Pin | null {
  const value = raw.trim()
  if (!URL.canParse(value)) return null

  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname) return null

  return {
    id: crypto.randomUUID(),
    label: pinLabel(url.hostname),
    target: { kind: 'link', url: url.href }
  }
}

/** Ticked and total, or null for an entry with no steps. */
export function checklistProgress(
  checklist: readonly ChecklistItem[]
): { done: number; total: number } | null {
  if (checklist.length === 0) return null
  return { done: checklist.filter((item) => item.done).length, total: checklist.length }
}

/**
 * What an entry carries, in words, for the end of a tooltip that already
 * names it. Empty when it carries nothing.
 */
export function describeCarried(entry: CalendarEntry): string {
  const parts: string[] = []
  if (entry.attachments.length > 0) parts.push(`${entry.attachments.length} attached`)

  const progress = checklistProgress(entry.checklist)
  if (progress) parts.push(`${progress.done}/${progress.total} steps done`)

  return parts.join(' · ')
}

/**
 * Opens an attachment, and keeps what went wrong when it could not be.
 *
 * A file can be moved or deleted after it was attached, and the main process
 * says so in words; those words belong on screen rather than in a rejected
 * promise nobody reads.
 */
export function useOpenAttachment(): {
  open: (pin: Pin) => void
  problem: string | null
  clear: () => void
} {
  const [problem, setProblem] = useState<string | null>(null)

  const open = useCallback((pin: Pin): void => {
    setProblem(null)
    void window.candy.strip.openTarget(pin.target).catch((cause: unknown) => {
      setProblem(cause instanceof Error ? cause.message : String(cause))
    })
  }, [])

  const clear = useCallback(() => setProblem(null), [])

  return { open, problem, clear }
}

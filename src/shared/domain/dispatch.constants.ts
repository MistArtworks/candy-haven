/**
 * Zod-free half of the DISPATCH domain — see boot.constants.ts for the split.
 *
 * DISPATCH is the one department that is not about this machine. Two people use
 * Candy Haven — candy, who asks for things, and mist, who builds them — and
 * until now the asking happened somewhere else entirely. This is the board they
 * share: an item is filed, discussed, and then resolved or denied with a reason.
 */

// --------------------------------------------------------------------- people

/**
 * Both of them, by name.
 *
 * Deliberately a closed list rather than accounts. There is no login and there
 * will not be one: two people share a board, and a password on it would be
 * ceremony protecting nothing. Identity is chosen on the page before filing,
 * remembered per machine, and changeable at any time — it labels an item, it
 * does not authorise anything.
 */
export const DISPATCH_AUTHORS = ['mist', 'candy'] as const
export type DispatchAuthor = (typeof DISPATCH_AUTHORS)[number]

export const DISPATCH_AUTHOR_LABEL: Record<DispatchAuthor, string> = {
  mist: 'MIST',
  candy: 'CANDY'
}

/** Who rules on an item. The other files and comments; they do not adjudicate. */
export const DISPATCH_ADJUDICATOR: DispatchAuthor = 'mist'

// ---------------------------------------------------------------------- kinds

export const DISPATCH_KINDS = ['idea', 'suggestion', 'request', 'bug'] as const
export type DispatchKind = (typeof DISPATCH_KINDS)[number]

export const DISPATCH_KIND_LABEL: Record<DispatchKind, string> = {
  idea: 'IDEA',
  suggestion: 'SUGGESTION',
  request: 'REQUEST',
  bug: 'FAULT'
}

export const DISPATCH_KIND_PURPOSE: Record<DispatchKind, string> = {
  idea: 'Something that might be worth doing.',
  suggestion: 'A change to something that already exists.',
  request: 'Something wanted, specifically.',
  bug: 'Something is broken.'
}

// -------------------------------------------------------------------- status

export const DISPATCH_STATUSES = ['pending', 'resolved', 'denied'] as const
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number]

export const DISPATCH_STATUS_LABEL: Record<DispatchStatus, string> = {
  pending: 'PENDING',
  resolved: 'RESOLVED',
  denied: 'DENIED'
}

/** True for the two states that end an item. Both are final; both are visible. */
export function isSettled(status: DispatchStatus): boolean {
  return status !== 'pending'
}

// ------------------------------------------------------------------ priority

export const DISPATCH_PRIORITIES = ['low', 'normal', 'high'] as const
export type DispatchPriority = (typeof DISPATCH_PRIORITIES)[number]

export const DISPATCH_PRIORITY_LABEL: Record<DispatchPriority, string> = {
  low: 'LOW',
  normal: 'NORMAL',
  high: 'HIGH'
}

// ---------------------------------------------------------------------- areas

/**
 * Where an item is about.
 *
 * The department ids plus a general bucket, written out rather than imported
 * from `navigation.ts`. An item filed against a department that is later
 * renamed should keep saying what it said — this is a record, and a record that
 * rewrites itself when the code moves is not one.
 */
export const DISPATCH_AREAS = [
  'general',
  'nexus',
  'archive',
  'observatory',
  'interface',
  'telemetry',
  'regulation',
  'dispatch'
] as const
export type DispatchArea = (typeof DISPATCH_AREAS)[number]

export const DISPATCH_AREA_LABEL: Record<DispatchArea, string> = {
  general: 'GENERAL',
  nexus: 'NEXUS',
  archive: 'ARCHIVE',
  observatory: 'OBSERVATORY',
  interface: 'INTERFACE',
  telemetry: 'TELEMETRY',
  regulation: 'REGULATION',
  dispatch: 'DISPATCH'
}

// ------------------------------------------------------------------- sorting

export const DISPATCH_SORTS = ['newest', 'oldest', 'active', 'priority'] as const
export type DispatchSort = (typeof DISPATCH_SORTS)[number]

export const DISPATCH_SORT_LABEL: Record<DispatchSort, string> = {
  newest: 'NEWEST FIRST',
  oldest: 'OLDEST FIRST',
  active: 'RECENTLY DISCUSSED',
  priority: 'PRIORITY'
}

// --------------------------------------------------------------------- limits

export const DISPATCH_TITLE_MAX = 120
export const DISPATCH_BODY_MAX = 4_000
export const DISPATCH_COMMENT_MAX = 2_000
export const DISPATCH_REASON_MAX = 600

/** Where every item lives under the database root. One board, one path. */
export const DISPATCH_ROOT_PATH = 'candy-haven/dispatch'

// ------------------------------------------------------------------ connection

export const DISPATCH_LINK_STATES = [
  /** No Firebase config has been supplied yet. */
  'unconfigured',
  'connecting',
  'online',
  /** Configured, but the last attempt failed. The board still reads locally. */
  'error'
] as const
export type DispatchLinkState = (typeof DISPATCH_LINK_STATES)[number]

/**
 * The orientation carousel's revision, and the rule for when it returns.
 *
 * Zod-free so the renderer can import it as a value without pulling the schema
 * library into its bundle — the same split every other domain module here uses.
 */

/**
 * Bump this when the orientation tour's *content* changes enough that an
 * operator who has already read it should be shown it again.
 *
 * Deliberately not the application version. Most releases fix something without
 * touching a word of the tour, and re-running a seven-slide cinematic because a
 * patch changed a timer's easing would train the operator to dismiss it
 * unread — at which point the one mechanism the console has for saying
 * something important on launch is spent.
 *
 * Rule of thumb: bump it when a slide is added, removed, or rewritten to
 * describe something that now works differently. Do not bump it for a typo.
 */
export const GUIDE_REVISION = 1

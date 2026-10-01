import type { Colophon } from './colophon'
import type { NameCheck } from './artists.constants'

/**
 * Zod-free half of the colophon domain: see projects.constants.ts for why the
 * split exists. The page needs the field rules as *values*, to say what is
 * wrong with a field while it is being typed; the schemas run once, at the IPC
 * boundary.
 *
 * ## What the colophon is
 *
 * The details the website carries on every page: the address bookings are
 * written to, the number that is called, the Discord username people message
 * after a booking, and where they follow from. One record, not a register,
 * because the website has one of each.
 *
 * ## Kept here, published later
 *
 * It lives in the archive on this machine, like everything else. Nothing reads
 * it from outside yet: the website is meant to be a projection of this
 * console's records (docs/PROJECT_CONTEXT.md §14), and publishing it is a
 * department still to come. Until then this is the record the website will be
 * built from, and the one place each detail is written.
 *
 * ## Every field may be empty
 *
 * An empty field is the honest record of a detail not known yet, not a gap to
 * fill with something plausible. The website leaves out what is not set rather
 * than printing a placeholder.
 */

/** RFC 5321's limit on a whole address. */
export const MAX_EMAIL = 254

/** As typed, with its spaces and brackets. Generous; the digits are the limit. */
export const MAX_PHONE = 32

/** Discord's own ceiling on a username. */
export const MAX_DISCORD = 32

/**
 * The roster's ceiling on one artist's links, and for the same reason.
 *
 * A footer with twelve places to follow from is already a list nobody reads to
 * the end; past that it is a directory, which is not what a website's footer is.
 */
export const MAX_COLOPHON_LINKS = 12

/** E.164: no number anywhere is longer than fifteen digits. */
const MAX_DIGITS = 15

/** Shorter than this and it cannot be a whole number, with or without a code. */
const MIN_DIGITS = 7

/** The record before anything has been written into it. */
export function emptyColophon(): Colophon {
  return { email: '', phone: '', discord: '', links: [], updatedAt: 0 }
}

// -------------------------------------------------------------------- email

/**
 * An address, or nothing.
 *
 * Deliberately not RFC 5322: the full grammar admits addresses no mail
 * provider issues and refuses nothing the operator would actually type. What
 * this catches is the mistake that matters, a half-typed address or a missing
 * domain, and it says so in a sentence.
 */
export function checkEmail(value: string): NameCheck {
  const trimmed = value.trim()
  if (trimmed.length === 0) return { ok: true }
  if (trimmed.length > MAX_EMAIL) return { ok: false, reason: 'That address is too long.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, reason: 'That is not an address yet. It needs a name, an @ and a domain.' }
  }
  return { ok: true }
}

// -------------------------------------------------------------------- phone

/**
 * A number, as it should read on the page, or nothing.
 *
 * Stored as typed, `+1 (902) 555-0142`, because how it reads is the operator's
 * choice and spacing a number is a local custom. What dials is derived from it
 * (`dialString`), so the two cannot disagree. The rules are only the ones a
 * dialler enforces: digits and the usual separators, a `+` only before the
 * country code, and a length a real number can have.
 */
export function checkPhone(value: string): NameCheck {
  const trimmed = value.trim()
  if (trimmed.length === 0) return { ok: true }
  if (trimmed.length > MAX_PHONE) return { ok: false, reason: 'That number is too long.' }
  if (/[^0-9+()\-.\s]/.test(trimmed)) {
    return { ok: false, reason: 'A number holds digits, spaces, + ( ) - and . only.' }
  }
  if (trimmed.lastIndexOf('+') > 0) {
    return { ok: false, reason: 'A + belongs at the very start, before the country code.' }
  }

  const digits = trimmed.replace(/\D/g, '').length
  if (digits < MIN_DIGITS) return { ok: false, reason: 'That is too short to dial.' }
  if (digits > MAX_DIGITS) {
    return { ok: false, reason: 'That is longer than any number can be. Fifteen digits at most.' }
  }
  return { ok: true }
}

/**
 * What the number dials as: its digits, with the `+` kept when it has one.
 *
 * The form a `tel:` link wants, and the one the page shows under the field, so
 * the operator sees exactly what a phone will be handed. Empty for an empty or
 * unusable number, because a link that dials the wrong thing is worse than none.
 */
export function dialString(value: string): string {
  if (!checkPhone(value).ok) return ''
  const trimmed = value.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  return trimmed.startsWith('+') ? `+${digits}` : digits
}

// ------------------------------------------------------------------ discord

/**
 * A Discord username, or nothing.
 *
 * Discord's current rules, which replaced the old `name#1234` tags: two to
 * thirty-two characters, lowercase letters, numbers, underscores and periods,
 * and never two periods together. Refused with the rule rather than corrected,
 * because quietly lowercasing a name the operator typed would store something
 * they did not write.
 */
export function checkDiscord(value: string): NameCheck {
  const trimmed = value.trim()
  if (trimmed.length === 0) return { ok: true }
  if (trimmed.startsWith('@')) {
    return { ok: false, reason: 'Leave off the @. A Discord username is written without one.' }
  }
  if (trimmed.includes('#')) {
    return {
      ok: false,
      reason: 'Discord retired the #1234 tags. Use the username alone, as Discord shows it now.'
    }
  }
  if (trimmed !== trimmed.toLowerCase()) {
    return { ok: false, reason: 'Discord usernames are lowercase.' }
  }
  if (!/^[a-z0-9_.]+$/.test(trimmed)) {
    return {
      ok: false,
      reason: 'Discord usernames hold letters, numbers, periods and underscores only.'
    }
  }
  if (trimmed.length < 2)
    return { ok: false, reason: 'A Discord username is at least two characters.' }
  if (trimmed.length > MAX_DISCORD) {
    return { ok: false, reason: `A Discord username is at most ${MAX_DISCORD} characters.` }
  }
  if (trimmed.includes('..')) {
    return { ok: false, reason: 'Two periods cannot sit side by side in a Discord username.' }
  }
  return { ok: true }
}

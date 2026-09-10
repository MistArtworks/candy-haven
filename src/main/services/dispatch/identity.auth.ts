import { AppError, ErrorCode } from '@main/core/errors'
import { DISPATCH_AUTHORS, type DispatchAuthor } from '@shared/domain/dispatch.constants'

const SIGN_IN_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword'
const REFRESH_URL = 'https://securetoken.googleapis.com/v1/token'

/**
 * The two accounts, by the identifier Firebase gives them.
 *
 * A UID rather than an address, deliberately. Addresses are personal and there
 * is no reason for either operator's to sit in a repository — the account is
 * typed in at sign-in and the app never needs to know it in advance. A UID is
 * opaque, is not a credential, and grants nothing without the password behind
 * it, which is why the same two strings can sit in `database.rules.json` where
 * they are the actual access control.
 *
 * **These must match the rules.** If a UID changes here and not there, the
 * account signs in and is then refused by the database, which reads as the
 * board being broken rather than as a misconfiguration.
 */
export const ACCOUNT_UID: Record<DispatchAuthor, string> = {
  mist: 'Uc1ZbVbKXmU8cU5iSK3kWtNKXJD2',
  candy: 'u9mDaxAH3MZbgyIPith4lBF4Mn63'
}

/** Which of the two an account is, or null for anyone else. */
export function identityForUid(uid: string): DispatchAuthor | null {
  return DISPATCH_AUTHORS.find((author) => ACCOUNT_UID[author] === uid) ?? null
}

export interface DispatchSession {
  identity: DispatchAuthor
  uid: string
  idToken: string
  refreshToken: string
  /** Epoch ms. Firebase issues an hour; this is when it stops being accepted. */
  expiresAt: number
}

/**
 * Refresh this far before expiry.
 *
 * A token that expires mid-request produces a 401 the operator has no way to
 * interpret, and the change stream is long-lived enough that it will always be
 * the thing holding a stale one. Five minutes is generous and costs one extra
 * request an hour.
 */
export const REFRESH_MARGIN_MS = 5 * 60_000

/**
 * Firebase Authentication, over its REST interface.
 *
 * No SDK, for the same reasons as `RtdbClient`: two endpoints do everything
 * needed, and this keeps the credential handling in the main process where the
 * rest of the application's I/O lives.
 *
 * **What this buys, precisely.** A password checked inside the application
 * would be theatre — an attacker reaching the database does not run the app, so
 * a local check stops nobody. Signing in exchanges the password for a token
 * that the *database itself* validates, which is what lets the rules refuse
 * every request that does not carry one. That, and not the login screen, is the
 * security; the login screen is how the token is obtained.
 *
 * The password is never stored. It goes to Google, comes back as a token, and
 * is dropped.
 */
export class IdentityAuth {
  constructor(private readonly apiKey: string) {}

  /**
   * Signs in, and resolves which of the two the account is.
   *
   * Takes an address as well as a password because neither operator's address
   * belongs in the source. The account is identified afterwards by its UID,
   * which is opaque and already public in the database's rules.
   *
   * An account that is not one of the two is refused *here* as well as by the
   * rules. The rules are the enforcement — this only means someone who signs in
   * with the wrong Google account is told so, rather than watching an attached
   * board return nothing.
   */
  async signIn(email: string, password: string): Promise<DispatchSession> {
    const response = await fetch(`${SIGN_IN_URL}?key=${encodeURIComponent(this.apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password, returnSecureToken: true })
    })

    if (!response.ok) throw signInFailure(await errorCode(response), response.status)

    const body = (await response.json()) as {
      idToken: string
      refreshToken: string
      expiresIn: string
      localId: string
    }

    const identity = identityForUid(body.localId)
    if (!identity) {
      throw new AppError('That account is not on the board.', {
        code: ErrorCode.PermissionDenied,
        hint: 'Only the two accounts named in the database rules can attach.'
      })
    }

    return {
      identity,
      uid: body.localId,
      idToken: body.idToken,
      refreshToken: body.refreshToken,
      expiresAt: Date.now() + Number.parseInt(body.expiresIn, 10) * 1000
    }
  }

  /**
   * A fresh token from a stored refresh token.
   *
   * The refresh token outlives the app, so this is what makes signing in a
   * once-ever act rather than a daily one. Firebase may hand back a *new*
   * refresh token, which has to be kept — ignoring it eventually invalidates
   * the session for no visible reason.
   */
  async refresh(refreshToken: string): Promise<DispatchSession> {
    const response = await fetch(`${REFRESH_URL}?key=${encodeURIComponent(this.apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
    })

    if (!response.ok) {
      const reason = await errorCode(response)
      throw new AppError('The board sign-in has expired.', {
        code: ErrorCode.PermissionDenied,
        hint: reason === 'TOKEN_EXPIRED' || reason === 'USER_DISABLED' ? 'Sign in again.' : null
      })
    }

    const body = (await response.json()) as {
      id_token: string
      refresh_token: string
      expires_in: string
      user_id: string
    }

    const identity = identityForUid(body.user_id)
    if (!identity) {
      throw new AppError('That account is not on the board.', {
        code: ErrorCode.PermissionDenied
      })
    }

    return {
      identity,
      uid: body.user_id,
      idToken: body.id_token,
      refreshToken: body.refresh_token,
      expiresAt: Date.now() + Number.parseInt(body.expires_in, 10) * 1000
    }
  }
}

/**
 * Google's reason, turned into something an operator can act on.
 *
 * A wrong address and a wrong password give one message between them — telling
 * someone which half they got right is a favour to whoever is guessing.
 */
function signInFailure(reason: string, status: number): AppError {
  if (
    reason === 'INVALID_PASSWORD' ||
    reason === 'EMAIL_NOT_FOUND' ||
    reason === 'INVALID_LOGIN_CREDENTIALS' ||
    reason === 'INVALID_EMAIL'
  ) {
    return new AppError('That address and password do not match an account.', {
      code: ErrorCode.PermissionDenied
    })
  }

  if (reason === 'OPERATION_NOT_ALLOWED') {
    return new AppError('The project does not allow password sign-in.', {
      code: ErrorCode.PermissionDenied,
      hint: 'Enable Email/Password under Authentication → Sign-in method in the Firebase console.'
    })
  }

  if (reason === 'USER_DISABLED') {
    return new AppError('That account has been disabled.', { code: ErrorCode.PermissionDenied })
  }

  if (reason === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
    return new AppError('Too many attempts. Firebase has paused sign-in for a while.', {
      code: ErrorCode.PermissionDenied,
      recoverable: true
    })
  }

  return new AppError(`Sign-in failed (${reason || status}).`, {
    code: ErrorCode.Unknown,
    recoverable: true
  })
}

/** Google's machine-readable reason, or an empty string if it did not give one. */
async function errorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    // The message is `INVALID_PASSWORD` or `TOO_MANY_ATTEMPTS_TRY_LATER : …`.
    return (body.error?.message ?? '').split(' ')[0]
  } catch {
    return ''
  }
}

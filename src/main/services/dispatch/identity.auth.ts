import { AppError, ErrorCode } from '@main/core/errors'
import { DISPATCH_AUTHORS, type DispatchAuthor } from '@shared/domain/dispatch.constants'

const SIGN_IN_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword'
const REFRESH_URL = 'https://securetoken.googleapis.com/v1/token'

/**
 * The two accounts, by identity.
 *
 * Firebase's email/password provider is keyed by address. Nothing is ever sent
 * to either of these; they are here so that "who am I" is settled by *the
 * database*, against a credential, rather than by a toggle in the interface
 * that anyone could flip. Real addresses rather than placeholders only so that
 * password recovery through the console is possible if it is ever needed.
 */
export const ACCOUNT_EMAIL: Record<DispatchAuthor, string> = {
  mist: 'mistartworks@gmail.com',
  candy: 'candyheistmusic23@gmail.com'
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
   * Signs in with a password alone, resolving which of the two it belongs to.
   *
   * One field rather than a name and a password, because the password *is* the
   * name here: there are two accounts and each has one. Tried in a fixed order
   * so the outcome does not depend on which failed first.
   *
   * A wrong password produces one error for both attempts rather than "no such
   * account" — there is nothing useful in telling the operator which of two
   * accounts they failed to be.
   */
  async signIn(password: string): Promise<DispatchSession> {
    for (const identity of DISPATCH_AUTHORS) {
      const session = await this.attempt(identity, password)
      if (session) return session
    }

    throw new AppError('That password does not match either account.', {
      code: ErrorCode.PermissionDenied,
      hint: 'Check it, or ask whoever set the board up.'
    })
  }

  private async attempt(
    identity: DispatchAuthor,
    password: string
  ): Promise<DispatchSession | null> {
    const response = await fetch(`${SIGN_IN_URL}?key=${encodeURIComponent(this.apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: ACCOUNT_EMAIL[identity],
        password,
        returnSecureToken: true
      })
    })

    if (response.ok) {
      const body = (await response.json()) as {
        idToken: string
        refreshToken: string
        expiresIn: string
        localId: string
      }

      return {
        identity,
        uid: body.localId,
        idToken: body.idToken,
        refreshToken: body.refreshToken,
        expiresAt: Date.now() + Number.parseInt(body.expiresIn, 10) * 1000
      }
    }

    const reason = await errorCode(response)

    /*
     * A wrong password for this account is not a failure of the whole attempt —
     * it may be the other one's. Anything else is, and is raised immediately so
     * a misconfigured project does not read as a typo.
     */
    if (
      reason === 'INVALID_PASSWORD' ||
      reason === 'EMAIL_NOT_FOUND' ||
      reason === 'INVALID_LOGIN_CREDENTIALS'
    ) {
      return null
    }

    if (reason === 'OPERATION_NOT_ALLOWED') {
      throw new AppError('The project does not allow password sign-in.', {
        code: ErrorCode.PermissionDenied,
        hint: 'Enable Email/Password under Authentication → Sign-in method in the Firebase console.'
      })
    }

    if (reason === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
      throw new AppError('Too many attempts. Firebase has paused sign-in for a while.', {
        code: ErrorCode.PermissionDenied,
        recoverable: true
      })
    }

    throw new AppError(`Sign-in failed (${reason || response.status}).`, {
      code: ErrorCode.Unknown,
      recoverable: true
    })
  }

  /**
   * A fresh token from a stored refresh token.
   *
   * The refresh token outlives the app, so this is what makes signing in a
   * once-ever act rather than a daily one. Firebase may hand back a *new*
   * refresh token, which has to be kept — ignoring it eventually invalidates
   * the session for no visible reason.
   */
  async refresh(identity: DispatchAuthor, refreshToken: string): Promise<DispatchSession> {
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

    return {
      identity,
      uid: body.user_id,
      idToken: body.id_token,
      refreshToken: body.refresh_token,
      expiresAt: Date.now() + Number.parseInt(body.expires_in, 10) * 1000
    }
  }
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

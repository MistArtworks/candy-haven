import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@renderer/components/primitives/Button'
import { StatusDot, type StatusTone } from '@renderer/components/primitives/StatusDot'
import { SignInBand } from '@renderer/components/session/SignInBand'
import { useDispatchActions } from '@renderer/hooks/useDispatch'
import { formatRelative } from '@renderer/features/dispatch/lib/present'
import { isSignedIn, type WebsiteLink } from './link'
import styles from './WebsiteChrome.module.scss'

/*
 * The furniture of the departments that work on the website (CONTACT,
 * SERVICES, LORE): which website, how the last call went, the button that
 * asks for what's new, and the sign-in in front of it all. Moved out of the
 * inbox when LORE came to need the same pieces.
 */

const LINK_TONE: Record<WebsiteLink['state'], StatusTone> = {
  unconfigured: 'offline',
  'signed-out': 'offline',
  syncing: 'pending',
  online: 'online',
  offline: 'error'
}

function host(origin: string): string {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

/**
 * The header's right side: which website, and how the last call went.
 *
 * The readout says when the last check was rather than claiming the page is
 * up to date: nothing runs on a timer, so a page is only as fresh as the
 * last time someone asked.
 */
export function WebsiteStatus({ link }: { link: WebsiteLink }): ReactNode {
  return (
    <div className={styles.headerActions}>
      {link.website ? (
        <div className={styles.website}>
          <span className={styles.websiteLabel}>Website</span>
          <span className={styles.websiteName}>{host(link.website)}</span>
        </div>
      ) : null}

      <StatusDot
        tone={LINK_TONE[link.state]}
        label={
          link.state === 'online'
            ? link.syncedAt
              ? `Checked · ${formatRelative(link.syncedAt)}`
              : link.message || 'Not checked yet'
            : link.state === 'signed-out'
              ? 'Signed out'
              : link.message
        }
        pulse={link.state === 'syncing'}
      />
    </div>
  )
}

/**
 * The button that asks the website for what is new.
 *
 * The only way to ask after the page has opened, so it is drawn as the
 * page's one primary action, on its own row above the content and to the
 * right, where the eye finishes the header. Hidden while signed out, when
 * there is nobody to ask for.
 */
export function CheckForNew({
  link,
  syncing,
  onSync
}: {
  link: WebsiteLink
  syncing: boolean
  onSync: () => void
}): ReactNode {
  if (!isSignedIn(link)) return null

  return (
    <Button
      variant="primary"
      className={styles.checkForNew}
      busy={syncing || link.state === 'syncing'}
      icon={
        // An arrow into a tray: something arriving.
        <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
          <path
            d="M6 1.4v5.6M3.6 4.8 6 7.2l2.4-2.4"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="square"
          />
          <path d="M1.8 7.8v2.4h8.4V7.8" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      }
      onClick={onSync}
    >
      Check for new
    </Button>
  )
}

/**
 * What stands in front of the page until someone is signed in.
 *
 * The board's sign-in, entered here or on DISPATCH: one session for all of
 * them. Without a Firebase config there is no sign-in to use, and the gate
 * says where to add one rather than growing a settings panel here.
 */
export function WebsiteGate({
  link,
  what,
  children
}: {
  link: WebsiteLink
  /** The department, as the gate names it: `CONTACT`, `LORE`. */
  what: string
  /** Why it's behind the sign-in, in a sentence or two. */
  children: ReactNode
}): ReactNode {
  const dispatch = useDispatchActions()

  if (link.state === 'unconfigured') {
    return (
      <div className={styles.gate}>
        <span>
          {what} uses the DISPATCH sign-in, and this machine has no Firebase config yet. Add it in{' '}
          <Link to="/regulation?section=board" className={styles.inlineLink}>
            REGULATION → BOARD
          </Link>
          .
        </span>
      </div>
    )
  }

  if (link.state !== 'signed-out') return null

  return (
    <SignInBand
      title={`Sign in to open ${what}`}
      busy={dispatch.pending === 'sign-in'}
      onSubmit={(email, password) => void dispatch.signIn(email, password)}
    >
      {children}
    </SignInBand>
  )
}

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { InboxState } from '@shared/domain/inbox'
import { Button } from '@renderer/components/primitives/Button'
import { StatusDot, type StatusTone } from '@renderer/components/primitives/StatusDot'
import { SignInBand } from '@renderer/components/session/SignInBand'
import { useDispatchActions } from '@renderer/hooks/useDispatch'
import { formatRelative } from '@renderer/features/dispatch/lib/present'
import styles from '../Inbox.module.scss'

const LINK_TONE: Record<InboxState['link']['state'], StatusTone> = {
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
 * The header's right side: which website, how the last check-in went, and
 * the button that asks for what is new.
 *
 * The button is the only way to check in after startup, short of signing in
 * again: nothing runs on a timer. So it is a real button rather than a quiet
 * link, and the readout says when the last check was rather than claiming the
 * page is up to date.
 */
export function InboxStatus({
  state,
  syncing,
  onSync
}: {
  state: InboxState
  syncing: boolean
  onSync: () => void
}): ReactNode {
  const { link } = state
  const signedIn = link.state !== 'signed-out' && link.state !== 'unconfigured'

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
            ? `Checked${link.syncedAt ? ` · ${formatRelative(link.syncedAt)}` : ''}`
            : link.state === 'signed-out'
              ? 'Signed out'
              : link.message
        }
        pulse={link.state === 'syncing'}
      />

      {signedIn ? (
        <Button size="sm" busy={syncing || link.state === 'syncing'} onClick={onSync}>
          Check for new
        </Button>
      ) : null}
    </div>
  )
}

/**
 * What stands in front of the page until someone is signed in.
 *
 * The board's sign-in, entered here or on DISPATCH: one session for the
 * three. Without a Firebase config there is no sign-in to use, and the gate
 * says where to add one rather than growing a settings panel here.
 */
export function InboxGate({ state, what }: { state: InboxState; what: string }): ReactNode {
  const dispatch = useDispatchActions()

  if (state.link.state === 'unconfigured') {
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

  if (state.link.state !== 'signed-out') return null

  return (
    <SignInBand
      title={`Sign in to open ${what}`}
      busy={dispatch.pending === 'sign-in'}
      onSubmit={(email, password) => void dispatch.signIn(email, password)}
    >
      What the website&apos;s visitors send is kept behind the same two accounts as the board, and
      signing in here signs in there too. The website checks the sign-in itself before it hands
      anything over, so nothing is fetched or shown until someone has.
    </SignInBand>
  )
}

import { useState, type ReactNode } from 'react'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import styles from './SignInBand.module.scss'

export interface SignInBandProps {
  /** What signing in opens, `Sign in to the board`. */
  title: string
  /** Why, in a sentence or two. */
  children: ReactNode
  busy: boolean
  onSubmit: (email: string, password: string) => void
}

/**
 * The sign-in, as a band across the top of a page.
 *
 * Moved out of DISPATCH when CONTACT and SERVICES came to sit behind the same
 * two accounts. It is one session wherever it is entered: signing in here
 * signs in on all three, through `window.candy.dispatch.signIn`.
 *
 * Drawn as a band rather than a modal. A modal would imply the page is behind
 * it and merely hidden; it is not, because nothing is fetched or shown until
 * someone signs in, so there is nothing underneath to cover.
 */
export function SignInBand({ title, children, busy, onSubmit }: SignInBandProps): ReactNode {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submit = (): void => {
    if (!email.trim() || !password.trim() || busy) return
    onSubmit(email, password)
    /*
     * Only the password is cleared.
     *
     * On success it is spent; on failure it was wrong, and leaving a wrong one
     * in the field invites pressing Enter again on the same mistake. The
     * address almost certainly was not the mistake, and retyping it every
     * attempt would be the annoying half.
     */
    setPassword('')
  }

  return (
    <div className={styles.band}>
      <div className={styles.copy}>
        <span className={styles.title}>{title}</span>
        <p className={styles.hint}>{children}</p>
      </div>

      <div className={styles.form}>
        <TextInput
          label="Account"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          onEnter={submit}
        />
        <TextInput
          label="Password"
          value={password}
          onChange={setPassword}
          password
          placeholder="••••••••"
          onEnter={submit}
        />
        <Button
          size="sm"
          variant="primary"
          disabled={!email.trim() || !password.trim()}
          busy={busy}
          onClick={submit}
        >
          Sign in
        </Button>
      </div>
    </div>
  )
}

import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DISPATCH_AUTHORS, DISPATCH_AUTHOR_LABEL } from '@shared/domain/dispatch.constants'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Toggle } from '@renderer/components/primitives/Toggle'
import { useApplySettings, useSettings } from '@renderer/hooks/useSettings'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { StatusDot, type StatusTone } from '@renderer/components/primitives/StatusDot'
import { TextArea } from '@renderer/components/primitives/Input'
import { useDispatch, useDispatchActions, useDispatchSetup } from '@renderer/hooks/useDispatch'
import styles from '../RegulationPage.module.scss'

const LINK_TONE: Record<string, StatusTone> = {
  unconfigured: 'offline',
  'signed-out': 'pending',
  connecting: 'pending',
  online: 'online',
  error: 'error'
}

/**
 * The shared board's connection, and what it is attached to.
 *
 * Lives here rather than on DISPATCH because it is configuration, and DISPATCH
 * is a working surface — a panel that is used exactly once per machine had no
 * business taking a third of the page every day afterwards. Signing *in* stays
 * on the board itself: that is a session, done at the start of a sitting, and
 * it belongs where the thing it unlocks is.
 *
 * **Notify me** is DISPATCH's notices, as CONTACT and SERVICES have theirs.
 * It saves as it is switched, like the attach and sign-out beside it.
 */
export function BoardPanel({ index }: { index: string }): ReactNode {
  const state = useDispatch()
  const setup = useDispatchSetup(state.revision)
  const actions = useDispatchActions()
  const settings = useSettings()
  const applySettings = useApplySettings()
  const [source, setSource] = useState('')

  const identity = state.link.identity
  const notices = settings?.integrations.boardNotices ?? true
  const other = identity
    ? DISPATCH_AUTHOR_LABEL[DISPATCH_AUTHORS.find((author) => author !== identity) ?? identity]
    : 'the other person'

  return (
    <Panel
      label="Board"
      index={index}
      className={styles.wide}
      aside={
        <StatusDot
          tone={LINK_TONE[state.link.state] ?? 'pending'}
          label={setup.configured ? 'Configured' : 'Not configured'}
        />
      }
    >
      <div className={styles.board}>
        <FieldGrid columns={3}>
          <Field label="Project" value={setup.projectId ?? '—'} mono />
          <Field
            label="Signed in as"
            value={identity ? DISPATCH_AUTHOR_LABEL[identity] : 'Nobody'}
          />
          <Field label="State" value={state.link.message || state.link.state.toUpperCase()} />
        </FieldGrid>

        {setup.configured ? (
          <>
            {/*
              The address is shown rather than merely held, because it may have
              been *derived* rather than pasted — the console's snippet omits it
              — and a wrong region produces a board that silently never
              attaches. Seeing it is how that gets diagnosed at a glance.
            */}
            <code className={styles.url}>{setup.databaseUrl}</code>
            <p className={styles.hint}>
              Both copies of the app read and write this one database, so an item filed on either
              appears on the other within a moment. Signing in happens on{' '}
              <Link to="/dispatch" className={styles.inlineLink}>
                DISPATCH
              </Link>
              .
            </p>
          </>
        ) : (
          <p className={styles.hint}>
            Paste the Firebase config from the console — Project settings, your web app, the{' '}
            <code className={styles.inline}>firebaseConfig</code> block. The whole snippet is fine;
            it does not need converting. It is saved to{' '}
            <code className={styles.inline}>{setup.configPath}</code>.
          </p>
        )}

        <TextArea
          label={setup.configured ? 'Replace the config' : 'Firebase config'}
          value={source}
          onChange={setSource}
          rows={6}
          placeholder={'const firebaseConfig = {\n  apiKey: "…",\n  projectId: "…"\n};'}
          hint="The console's snippet usually has no databaseURL line — it is written for Firestore. Without one the default Realtime Database address for the project is assumed, which is right unless the database was created outside the United States. To be certain, add a databaseURL line with the address from the Realtime Database page."
        />

        <div className={styles.actions}>
          <Button
            size="sm"
            variant="primary"
            disabled={source.trim().length === 0}
            busy={actions.pending === 'configure'}
            onClick={() => {
              void actions.configure(source)
              setSource('')
            }}
          >
            Attach
          </Button>
          {identity ? (
            <Button
              size="sm"
              disabled={actions.pending === 'sign-out'}
              onClick={() => void actions.signOut()}
            >
              Sign out
            </Button>
          ) : null}
        </div>

        {actions.error ? <p className={styles.warn}>{actions.error}</p> : null}

        <div className={styles.control}>
          <span className={styles.controlLabel}>Notify me</span>
          <Toggle
            label="Notify me of what is new on the board"
            checked={notices}
            onChange={() => applySettings({ integrations: { boardNotices: !notices } })}
          />
          <p className={styles.controlHint}>
            When {other} files something, comments, or changes a status: a notice in the console,
            and a Windows notification when the console isn&rsquo;t in front. Opening Haven says
            once what happened while it was closed. Clicked, either opens the item. Your own actions
            never notify you. DISPATCH&rsquo;s count on the rail and the marks on the board show
            either way.
          </p>
        </div>

        <p className={styles.footnote}>
          A Firebase web config is not a secret — it ships inside every web app that uses one, and
          access is governed by the database rules rather than by hiding it. Those rules admit two
          named accounts and refuse everything else; see{' '}
          <code className={styles.inline}>database.rules.json</code> in the repository.
        </p>
      </div>
    </Panel>
  )
}

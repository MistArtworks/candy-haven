import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { ArchiveSetupState } from '@shared/domain/stacks'
import {
  RECYCLE_BIN_DIRECTORY_NAME,
  RELEASES_DIRECTORY_NAME,
  WRAPPER_DIRECTORY_NAME
} from '@shared/domain/stacks.constants'
import { PROJECT_SCAFFOLD_FOLDERS } from '@shared/domain/projects.constants'
import { Button } from '@renderer/components/primitives/Button'
import styles from './SetupGate.module.scss'

/** Case-insensitive path compare — Windows treats two spellings as one folder. */
function samePath(left: string | null, right: string | null): boolean {
  if (!left || !right) return false
  const trim = (value: string): string => value.replace(/[\\/]+$/, '').toLowerCase()
  return trim(left) === trim(right)
}

export interface SetupGateProps {
  /** Null while the first fetch is in flight. */
  state: ArchiveSetupState | null
  busy: boolean
  error: string | null
  onSubmit: (filingRoot: string, templatePath: string, sourceRoots: string[]) => void
}

/**
 * What the ARCHIVE needs before it can be used.
 *
 * Sited at the foot of the page, not over it. This began as a full-screen modal
 * the department opened behind, on the reasoning that a workspace cannot
 * honestly be drawn before anyone has said where the workspace is. True, but it
 * made the first thing a new operator saw a form with no context — the shelves,
 * the lenses and the panels the form is *for* were all hidden behind it.
 *
 * So the page is now visible from the start and simply inert: every affordance
 * that would write to disk is disabled until this is filled in, and the service
 * refuses those calls anyway. The operator can look around first and see what
 * they are setting up.
 */
export function SetupGate({ state, busy, error, onSubmit }: SetupGateProps): ReactNode {
  const [pickedRoot, setPickedRoot] = useState<string | null>(null)
  const [pickedTemplate, setPickedTemplate] = useState<string | null>(null)
  const [sources, setSources] = useState<string[]>([])
  const [choosing, setChoosing] = useState<'root' | 'template' | 'source' | null>(null)

  /*
   * What the operator picked, else what is saved, else the music folder.
   *
   * Derived rather than seeded into state by an effect, which would cause a
   * cascading render on every fetch of the setup state and, worse, would race
   * it: the first render happens before the query resolves, so a `useState`
   * initialiser would capture null and an effect would then have to correct it.
   *
   * `suggestedRoot` is resolved in main from the OS music directory — the
   * renderer cannot ask Electron for it — and is offered as the answer rather
   * than an empty field. An earlier build defaulted to whichever directory held
   * the operator's Ableton projects, which buried the archive's own structure
   * inside someone else's and forced the two onto one disk. Where the archive
   * *builds* and where work *already is* are different questions, and this gate
   * now asks both.
   *
   * A saved root outranks the suggestion, because the gate is also shown for a
   * *missing* directory — an unplugged external drive reads as unconfigured —
   * and there the operator is confirming a path they already chose rather than
   * picking one afresh. `rootProvenance` labels which of the three is showing.
   */
  const root = pickedRoot ?? state?.filingRoot ?? state?.suggestedRoot ?? null
  const template = pickedTemplate ?? state?.templatePath ?? null

  /** True when the field is showing a root the operator configured previously. */
  const usingSaved =
    pickedRoot === null && state?.filingRoot !== null && state?.filingRoot !== undefined

  const rootProvenance =
    pickedRoot !== null ? 'Chosen' : usingSaved ? 'Currently set' : 'Your music folder'

  const chooseRoot = async (): Promise<void> => {
    setChoosing('root')
    try {
      const selected = await window.candy.shell.selectDirectory(
        'Choose where the archive should build'
      )
      if (selected) setPickedRoot(selected)
    } finally {
      setChoosing(null)
    }
  }

  const addSource = async (): Promise<void> => {
    setChoosing('source')
    try {
      const selected = await window.candy.shell.selectDirectory(
        'Select a folder that already holds Ableton projects'
      )
      if (!selected) return
      setSources((current) =>
        // Case-insensitive on Windows: the same folder picked twice is one root.
        current.some((entry) => entry.toLowerCase() === selected.toLowerCase())
          ? current
          : [...current, selected]
      )
    } finally {
      setChoosing(null)
    }
  }

  const chooseTemplate = async (): Promise<void> => {
    setChoosing('template')
    try {
      const selected = await window.candy.shell.selectFile({
        title: 'Select the Ableton set to use as a template',
        filters: [{ name: 'Ableton Live Set', extensions: ['als'] }]
      })
      if (selected) setPickedTemplate(selected)
    } finally {
      setChoosing(null)
    }
  }

  const ready = root !== null && template !== null

  // A root that was configured but has gone is a different problem from one
  // never chosen, and saying so saves the operator re-picking a path that is
  // perfectly correct on a drive that is merely unplugged.
  const rootLost = state?.filingRoot !== null && state?.rootPresent === false
  const templateLost = state?.templatePath !== null && state?.templatePresent === false

  return (
    <motion.section
      className={styles.sheet}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Set up the archive"
    >
      <header className={styles.header}>
        <span className={styles.index}>00</span>
        <h2 className={styles.title}>Establish the archive</h2>
        <p className={styles.purpose}>
          Where the archive builds, and what a new project starts from. Point it at your existing
          projects too and they will be waiting to be filed.
        </p>
      </header>

      {rootLost || templateLost ? (
        <p className={styles.warn} role="alert">
          {rootLost
            ? 'The filing root recorded here is not reachable. If it is on an external drive, connect it and reopen the department — otherwise choose another folder.'
            : 'The template set recorded here is no longer at its path. Choose it again, or pick another.'}
        </p>
      ) : null}

      <div className={styles.steps}>
        <div className={styles.step}>
          <div className={styles.stepHead}>
            <span className={styles.stepIndex}>01</span>
            <span className={styles.stepLabel}>Archive location</span>
          </div>
          <p className={styles.stepBody}>
            Where the archive builds. Everything it creates lives inside a single{' '}
            <span className={styles.mono}>{WRAPPER_DIRECTORY_NAME}</span> directory here, so nothing
            of yours is intermixed with ours and undoing all of this is one deletion in Explorer.
            Your music folder is a good place for it; this does not have to be where your projects
            are now.
          </p>
          <div className={styles.stepAction}>
            <span className={styles.value} title={root ?? undefined}>
              {root ?? 'Not chosen'}
            </span>
            {/*
                Says where the prefilled path came from.

                Without it the field is ambiguous in exactly the way that caused
                a real confusion: a previously saved root wins over the
                suggestion, so an operator re-running setup sees their old
                choice and cannot tell it apart from the default they expected.
              */}
            <span className={styles.provenance}>{rootProvenance}</span>
            <Button size="sm" onClick={chooseRoot} busy={choosing === 'root'}>
              {root ? 'Change' : 'Choose'}
            </Button>
          </div>

          {usingSaved && state?.suggestedRoot && !samePath(root, state.suggestedRoot) ? (
            <button
              type="button"
              className={styles.reset}
              onClick={() => setPickedRoot(state.suggestedRoot)}
            >
              Use my music folder instead — {state.suggestedRoot}
            </button>
          ) : null}
        </div>

        <div className={styles.step}>
          <div className={styles.stepHead}>
            <span className={styles.stepIndex}>02</span>
            <span className={styles.stepLabel}>Project template</span>
          </div>
          <p className={styles.stepBody}>
            An Ableton set copied into every project you create, under that project&apos;s own name.
            Your channel strip, your return tracks, your tempo — whatever you would otherwise
            rebuild each time.
          </p>
          <div className={styles.stepAction}>
            <span className={styles.value} title={template ?? undefined}>
              {template ?? 'Not chosen'}
            </span>
            <Button size="sm" onClick={chooseTemplate} busy={choosing === 'template'}>
              {template ? 'Change' : 'Choose'}
            </Button>
          </div>
        </div>

        <div className={styles.step}>
          <div className={styles.stepHead}>
            <span className={styles.stepIndex}>03</span>
            <span className={styles.stepLabel}>Where your projects are now</span>
            <span className={styles.optional}>Optional</span>
          </div>
          <p className={styles.stepBody}>
            Folders that already hold Ableton projects, wherever they live. They are read only —
            nothing is created or moved in them — and everything found appears in UNORGANISED, ready
            to be dragged onto a shelf. You can add more later from the INDEXING panel.
          </p>

          {sources.length > 0 ? (
            <ul className={styles.sourceList}>
              {sources.map((source) => (
                <li key={source} className={styles.source}>
                  <span className={styles.value} title={source}>
                    {source}
                  </span>
                  <button
                    type="button"
                    className={styles.sourceRemove}
                    aria-label={`Remove ${source}`}
                    onClick={() =>
                      setSources((current) => current.filter((entry) => entry !== source))
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className={styles.stepAction}>
            <span className={styles.value}>
              {sources.length === 0
                ? 'None added'
                : `${sources.length} location${sources.length === 1 ? '' : 's'}`}
            </span>
            <Button size="sm" onClick={addSource} busy={choosing === 'source'}>
              Add
            </Button>
          </div>
        </div>
      </div>

      {/*
          What will be made, listed before it is made. The operator is about to
          let an application create directories on their music drive, and the
          least it can do is say exactly which.
        */}
      <div className={styles.preview}>
        <span className={styles.previewLabel}>What gets created</span>
        <pre className={styles.tree}>
          {`${root ?? '<archive location>'}
  ${WRAPPER_DIRECTORY_NAME}\\
    ${RELEASES_DIRECTORY_NAME}\\
    ${RECYCLE_BIN_DIRECTORY_NAME}\\`}
        </pre>
        <p className={styles.previewNote}>
          Genres, folders and projects are created inside as you make them. A new project gets a
          copy of your template plus {PROJECT_SCAFFOLD_FOLDERS.join(', ')}.
        </p>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <footer className={styles.footer}>
        <span className={styles.footNote}>
          {ready
            ? 'Nothing existing is moved or renamed.'
            : 'A location and a template are required.'}
        </span>
        <Button
          variant="primary"
          disabled={!ready}
          busy={busy}
          onClick={() => {
            if (root && template) onSubmit(root, template, sources)
          }}
        >
          Establish
        </Button>
      </footer>
    </motion.section>
  )
}

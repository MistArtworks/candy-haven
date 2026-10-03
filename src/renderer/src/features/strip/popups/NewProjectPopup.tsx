import { useState, type ReactNode } from 'react'
import { selectArchive, useSystemStore } from '@renderer/app/store/system.store'
import { useArchiveSetup, useStacksTree } from '@renderer/hooks/useStacks'
import { useProjectMutations } from '@renderer/hooks/useProjects'
import { NewProjectForm } from '@renderer/features/vestibule/components/NewProjectForm'
import { PopupHead } from '../StripPopupHost'
import styles from '../Strip.module.scss'

/** Where the vestibule keeps the last shelf filed into; the strip shares it. */
const LAST_SHELF_KEY = 'candy-haven.vestibule.shelf'

/**
 * New project, from the strip: the vestibule's form (a name, a shelf, a
 * colour), and the set opens in Ableton as soon as it's made.
 */
export function NewProjectPopup({ onClose }: { onClose: () => void }): ReactNode {
  const archive = useSystemStore(selectArchive)
  const online = archive.state === 'online' || archive.state === 'degraded'
  const { data: setup } = useArchiveSetup()
  const { data: tree } = useStacksTree(online)
  const mutations = useProjectMutations()
  const [error, setError] = useState<string | null>(null)
  const [shelfId, setShelfId] = useState<string | null>(() =>
    window.localStorage.getItem(LAST_SHELF_KEY)
  )

  const chooseShelf = (id: string | null): void => {
    setShelfId(id)
    if (id) window.localStorage.setItem(LAST_SHELF_KEY, id)
    else window.localStorage.removeItem(LAST_SHELF_KEY)
  }

  const ready = online && (setup?.ready ?? false)
  // A shelf deleted since it was last used falls back to the top.
  const shelf = tree ? (tree.folders.find((folder) => folder.id === shelfId)?.id ?? null) : shelfId

  return (
    <div className={styles.newProject}>
      <PopupHead title="New project" onClose={onClose} />
      {ready ? (
        <NewProjectForm
          folders={tree?.folders ?? []}
          shelfId={shelf}
          onShelfChange={chooseShelf}
          busy={mutations.create.isPending}
          error={error}
          onBack={onClose}
          onSubmit={(draft) => {
            setError(null)
            mutations.create.mutate(
              { ...draft, category: 'single', artistIds: [] },
              {
                onSuccess: (record) => {
                  window.candy.projects
                    .open(record.id)
                    .then(onClose)
                    .catch((cause: Error) => setError(cause.message))
                },
                onError: (cause: Error) => {
                  const hint = (cause as { hint?: string | null }).hint
                  setError(hint ? `${cause.message} ${hint}` : cause.message)
                }
              }
            )
          }}
        />
      ) : (
        <p className={styles.quiet}>
          {online
            ? 'The archive isn’t set up yet: choose where projects are filed in the console first.'
            : 'The archive is starting. One moment.'}
        </p>
      )}
    </div>
  )
}

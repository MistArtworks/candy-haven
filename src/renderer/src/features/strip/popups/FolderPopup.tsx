import { useEffect, useState, type ReactNode } from 'react'
import type { FolderListing } from '@shared/domain/strip'
import { baseName } from '@shared/domain/strip'
import { Icon } from '../icons'
import { fileGlyph } from '../glyphs'
import { useNotice } from '../useStrip'
import { PopupHead } from '../StripPopupHost'
import styles from '../Strip.module.scss'

/**
 * A pinned folder, beside the strip: what's in it, folders first. Step into
 * a folder and back out (never above the one pinned); click a file and it
 * opens with whatever Windows opens it with, Ableton for a set.
 */
export function FolderPopup({
  root,
  label,
  onClose
}: {
  root: string
  label: string
  onClose: () => void
}): ReactNode {
  const [path, setPath] = useState(root)
  const [listing, setListing] = useState<FolderListing | null>(null)
  const [notice, say] = useNotice()

  useEffect(() => {
    let alive = true
    void window.candy.strip.listFolder(path).then((next) => {
      if (alive) setListing(next)
    })
    return () => {
      alive = false
    }
  }, [path])

  const atRoot = path === root
  const trail = atRoot
    ? label
    : `${label} / ${path
        .slice(root.length)
        .replace(/^[\\/]/, '')
        .replace(/[\\/]/g, ' / ')}`

  return (
    <div className={styles.folderPopup}>
      <PopupHead title={trail} onClose={onClose} />
      <div className={styles.folderList}>
        {!atRoot && listing?.parent ? (
          <button
            type="button"
            className={styles.folderItem}
            onClick={() => setPath(listing.parent ?? root)}
          >
            <span className={styles.folderBack}>←</span>
            <span>{baseName(listing.parent)}</span>
          </button>
        ) : null}
        {listing?.problem ? <p className={styles.quiet}>{listing.problem}</p> : null}
        {listing && !listing.problem && listing.items.length === 0 ? (
          <p className={styles.quiet}>This folder is empty.</p>
        ) : null}
        {listing?.items.map((item) => (
          <button
            key={item.path}
            type="button"
            className={styles.folderItem}
            data-folder={item.folder || undefined}
            title={item.name}
            onClick={() => {
              if (item.folder) {
                setPath(item.path)
                return
              }
              window.candy.strip
                .openTarget({ kind: 'file', path: item.path })
                .catch((cause: Error) => say(cause.message))
            }}
          >
            <Icon glyph={item.folder ? 'folder' : fileGlyph(item.name)} size={15} />
            <span className={styles.folderName}>{item.name}</span>
            {item.folder ? <Icon glyph="open" size={13} /> : null}
          </button>
        ))}
      </div>
      {notice ? <p className={styles.popupNotice}>{notice}</p> : null}
      <div className={styles.popupActions}>
        <button
          type="button"
          className={styles.textButton}
          onClick={() => void window.candy.shell.reveal(path)}
        >
          Show in Explorer
        </button>
      </div>
    </div>
  )
}

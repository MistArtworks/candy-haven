import type { ReactNode } from 'react'
import { Button } from '@renderer/components/primitives/Button'
import type { AddressRow } from '../lib/addresses'
import styles from './AddressList.module.scss'
import * as shell from '@renderer/lib/shell'

export interface AddressListProps {
  rows: readonly AddressRow[]
  /** Key of the address most recently copied, from `useCopy`. */
  copied: string | null
  /** Key whose copy the clipboard refused, from `useCopy`. */
  failed: string | null
  onCopy(key: string, url: string): void
  /** Drawn when the server is down and there is nothing to hand over. */
  offline?: string
}

/**
 * The browser-source addresses an overlay answers on, with the two things an
 * operator ever does to one: copy it, or look at it.
 *
 * Every overlay page had grown its own copy of this — the same `.address`,
 * `.addressHead`, `.addressActions` markup across eight files, with the copy
 * handler rewritten each time. This is that shape, once. The dashboard is the
 * surface that made it worth extracting: it draws twelve of these at a time,
 * and twelve hand-rolled blocks is not a thing anybody maintains.
 *
 * Preview opens in the operator's own browser rather than in a window here.
 * An overlay is a web page and the point of looking at it is to see what OBS
 * will see — a preview inside the console would be the console rendering it,
 * which is the one thing that cannot prove anything.
 */
export function AddressList({
  rows,
  copied,
  failed,
  onCopy,
  offline = 'Overlay server offline — no address to hand over.'
}: AddressListProps): ReactNode {
  if (rows.length === 0) {
    return <p className={styles.offline}>{offline}</p>
  }

  return (
    <ul className={styles.list}>
      {rows.map((row) => (
        <li key={row.key} className={styles.row}>
          <div className={styles.head}>
            <span className={styles.label}>{row.label}</span>
            <span className={styles.canvas}>
              {row.canvas.width} × {row.canvas.height}
            </span>
          </div>

          <p className={styles.purpose}>{row.purpose}</p>

          <div className={styles.line}>
            {/*
              Selectable as well as copyable. The button is the fast path, but
              an operator reading an address back to somebody, or taking half
              of it, should not have to fight the page for it.
            */}
            <code className={styles.url}>{row.url}</code>

            <div className={styles.actions}>
              <Button size="sm" variant="ghost" onClick={() => onCopy(row.key, row.url)}>
                {failed === row.key ? 'Blocked' : copied === row.key ? 'Copied' : 'Copy'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => shell.openExternal(row.url)}>
                Preview
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

import { useState, type ReactNode } from 'react'
import type { ArtistLink } from '@shared/domain/artists'
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABEL,
  checkLinkUrl,
  guessPlatform
} from '@shared/domain/artists.constants'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import styles from './LinkEditor.module.scss'
import * as shell from '@renderer/lib/shell'

export interface LinkEditorProps {
  links: readonly ArtistLink[]
  onChange: (links: ArtistLink[]) => void
  max: number
  disabled?: boolean
}

/**
 * Where somebody can be found.
 *
 * ARTISTS only, now. This was shared with DISCOGRAPHY on the reasoning that a
 * release's platform links and an artist's socials were the same object — a
 * platform, an address, and a label for the ones the platform list cannot
 * name — and while that was true it was worth one editor rather than two that
 * would drift.
 *
 * It stopped being true at D23. A release's platforms each hold **two**
 * addresses, a pre-save and a stream, and exist on the record before either
 * of them does; that is `DistributionEditor`, which is a planned set rather
 * than a list of places. A social is still exactly a platform and a URL.
 *
 * The platform is **guessed from the address and then left alone**. Pasting a
 * Spotify URL should not also require saying it is Spotify, but re-guessing
 * on every keystroke would fight an operator correcting it by hand — so the
 * guess happens once, when the row is added.
 */
export function LinkEditor({ links, onChange, max, disabled = false }: LinkEditorProps): ReactNode {
  const [draft, setDraft] = useState('')

  const verdict = draft.trim() ? checkLinkUrl(draft) : { ok: false, reason: undefined }
  const full = links.length >= max

  const add = (): void => {
    if (!verdict.ok || full || disabled) return
    const url = draft.trim()
    onChange([
      ...links,
      {
        // Minted here rather than server-side: the row has to be reorderable
        // and removable before the patch is ever sent.
        id: `link-${Date.now()}-${links.length}`,
        platform: guessPlatform(url),
        url,
        label: ''
      }
    ])
    setDraft('')
  }

  const update = (id: string, patch: Partial<ArtistLink>): void => {
    onChange(links.map((link) => (link.id === id ? { ...link, ...patch } : link)))
  }

  return (
    <div className={styles.editor}>
      {links.length > 0 ? (
        <ul className={styles.list}>
          {links.map((link) => (
            <li key={link.id} className={styles.row}>
              <select
                className={styles.platform}
                value={link.platform}
                aria-label="Platform"
                disabled={disabled}
                onChange={(event) =>
                  update(link.id, { platform: event.target.value as ArtistLink['platform'] })
                }
              >
                {SOCIAL_PLATFORMS.map((platform) => (
                  <option key={platform} value={platform}>
                    {SOCIAL_PLATFORM_LABEL[platform]}
                  </option>
                ))}
              </select>

              {/*
                A label, only where the platform cannot supply one. Asking for
                it on every row would be asking the operator to name Spotify.
              */}
              {link.platform === 'other' ? (
                <input
                  className={styles.label}
                  value={link.label}
                  placeholder="Name it"
                  aria-label="Link name"
                  disabled={disabled}
                  onChange={(event) => update(link.id, { label: event.target.value })}
                />
              ) : null}

              <code className={styles.url} {...tooltipTrigger(link.url)}>
                {link.url}
              </code>

              <div className={styles.actions}>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => shell.openExternal(link.url)}
                >
                  Open
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => onChange(links.filter((entry) => entry.id !== link.id))}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.add}>
        <TextInput
          label="Add a link"
          value={draft}
          onChange={setDraft}
          placeholder="https://"
          hint={full ? `That is the ceiling of ${max}.` : (verdict.reason ?? undefined)}
          disabled={disabled || full}
          onEnter={add}
          className={styles.addInput}
        />
        <Button size="sm" variant="ghost" disabled={!verdict.ok || full || disabled} onClick={add}>
          Add
        </Button>
      </div>
    </div>
  )
}

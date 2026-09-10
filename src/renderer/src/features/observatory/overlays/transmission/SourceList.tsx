import { useState, type ReactNode } from 'react'
import type { NowPlayingSource } from '@shared/domain/nowplaying'
import {
  NOW_PLAYING_PRESETS,
  NOW_PLAYING_STYLE_LABEL,
  nowPlayingSourceUrl
} from '@shared/domain/nowplaying.constants'
import { Button } from '@renderer/components/primitives/Button'
import { SelectInput, TextInput } from '@renderer/components/primitives/Input'
import styles from './TransmissionPage.module.scss'

export interface SourceListProps {
  sources: readonly NowPlayingSource[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: (presetId: string | null, name: string) => void
  onRemove: (id: string) => void
  /** Server root, or null while the overlay server is not listening. */
  serverUrl: string | null
  onCopy: (key: string, value: string) => void
  copied: string | null
  busy: boolean
}

/**
 * Every configured browser source, and the means to make another.
 *
 * One source used to be the whole feature — a single config with a style
 * dropdown, which made the four presentations mutually exclusive across every
 * scene. OBS switches scenes, not settings, so the shape has to be picked by
 * address. The four ship already made; anything beyond them is the operator's.
 *
 * The address is drawn beside each row rather than only for the selected one.
 * Setting a scene collection up means pasting all of them in one sitting, and
 * having to select a source to see its address would make that four extra
 * clicks for no reason.
 */
export function SourceList({
  sources,
  selectedId,
  onSelect,
  onAdd,
  onRemove,
  serverUrl,
  onCopy,
  copied,
  busy
}: SourceListProps): ReactNode {
  const [presetId, setPresetId] = useState<string>('')
  const [name, setName] = useState('')

  const add = (): void => {
    onAdd(presetId || null, name.trim())
    setName('')
    setPresetId('')
  }

  return (
    <div className={styles.sources}>
      <ul className={styles.sourceList}>
        {sources.map((source) => {
          const url = serverUrl ? nowPlayingSourceUrl(serverUrl, source.slug) : null

          return (
            <li key={source.id}>
              <div
                className={styles.sourceRow}
                data-selected={source.id === selectedId || undefined}
              >
                <button
                  type="button"
                  className={styles.sourcePick}
                  onClick={() => onSelect(source.id)}
                >
                  <span className={styles.sourceName}>{source.name}</span>
                  <span className={styles.sourceStyle}>
                    {/* Just the word, not the whole descriptive label — the
                        style table's entries are a sentence each, which reads
                        right in a select and wrong in a list row. */}
                    {NOW_PLAYING_STYLE_LABEL[source.config.style].split(' ')[0]}
                  </span>
                  {source.note ? <span className={styles.sourceNote}>{source.note}</span> : null}
                </button>

                <div className={styles.sourceActions}>
                  {url ? (
                    <Button size="sm" variant="ghost" onClick={() => onCopy(source.id, url)}>
                      {copied === source.id ? 'Copied' : 'Copy URL'}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    // The last one cannot go: with no sources a browser source
                    // pointed here has nothing to resolve to.
                    disabled={busy || sources.length <= 1}
                    onClick={() => onRemove(source.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>

              {url ? <code className={styles.sourceUrl}>{url}</code> : null}
            </li>
          )
        })}
      </ul>

      <div className={styles.newSource}>
        <SelectInput
          label="Start from"
          value={presetId}
          options={[
            { value: '', label: 'BLANK' },
            ...NOW_PLAYING_PRESETS.map((preset) => ({
              value: preset.id,
              label: preset.label.toUpperCase()
            }))
          ]}
          onChange={setPresetId}
        />
        <TextInput
          label="Name"
          value={name}
          onChange={setName}
          placeholder="Leave blank to use the preset's name"
        />
        <Button size="sm" busy={busy} onClick={add}>
          Add source
        </Button>
      </div>
    </div>
  )
}

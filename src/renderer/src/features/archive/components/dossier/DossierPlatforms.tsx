import { useState, type ReactNode } from 'react'
import type { DistributionPlatform, LiveLink } from '@shared/domain/projects'
import {
  DISTRIBUTION_PLATFORM_IDS,
  DISTRIBUTION_PLATFORM_LABEL
} from '@shared/domain/projects.constants'
import { Button } from '@renderer/components/primitives/Button'
import { Panel } from '@renderer/components/primitives/Panel'
import { Checkbox, SelectInput, TextInput } from '@renderer/components/primitives/Input'
import { formatStamp } from '../../lib/present'
import type { DossierTabProps } from './types'
import { DossierGrid } from './DossierGrid'
import styles from './dossier.module.scss'

const PLATFORM_OPTIONS = DISTRIBUTION_PLATFORM_IDS.map((platform) => ({
  value: platform,
  label: DISTRIBUTION_PLATFORM_LABEL[platform]
}))

/**
 * Where the release is going, and where it landed.
 *
 * Live links are entered by hand. One aggregator link that resolves every
 * platform automatically is a later change; until it exists, a link the operator
 * typed is the only kind that can be trusted, and inventing URLs from a
 * template would produce dead links that look real.
 */
export function DossierPlatforms({ project, mutations }: DossierTabProps): ReactNode {
  const [platform, setPlatform] = useState<DistributionPlatform>('spotify')
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')

  const { targetPlatforms, liveLinks } = project.distribution

  const toggleTarget = (value: DistributionPlatform): void => {
    const next = targetPlatforms.includes(value)
      ? targetPlatforms.filter((entry) => entry !== value)
      : [...targetPlatforms, value]

    mutations.patch.mutate({ id: project.id, patch: { distribution: { targetPlatforms: next } } })
  }

  const addLink = (): void => {
    const trimmed = url.trim()
    if (!trimmed) return

    const link: LiveLink = {
      platform,
      label: platform === 'other' ? label.trim() : DISTRIBUTION_PLATFORM_LABEL[platform],
      url: trimmed,
      addedAt: Date.now()
    }

    mutations.patch.mutate({
      id: project.id,
      patch: { distribution: { liveLinks: [...liveLinks, link] } }
    })

    setUrl('')
    setLabel('')
  }

  const removeLink = (target: LiveLink): void => {
    mutations.patch.mutate({
      id: project.id,
      patch: {
        distribution: {
          liveLinks: liveLinks.filter(
            (link) => !(link.url === target.url && link.addedAt === target.addedAt)
          )
        }
      }
    })
  }

  return (
    <DossierGrid>
      <Panel
        label="Submission targets"
        index="01"
        className={styles.span3}
        aside={String(targetPlatforms.length)}
      >
        <div className={styles.stack}>
          <p className={styles.hint}>
            Where this release is being submitted. At least one is required before it can be
            scheduled.
          </p>

          <div className={styles.platformGrid}>
            {DISTRIBUTION_PLATFORM_IDS.map((entry) => (
              <Checkbox
                key={entry}
                label={DISTRIBUTION_PLATFORM_LABEL[entry]}
                checked={targetPlatforms.includes(entry)}
                disabled={mutations.patch.isPending}
                onChange={() => toggleTarget(entry)}
              />
            ))}
          </div>
        </div>
      </Panel>

      <Panel
        label="Live links"
        index="02"
        className={styles.span3}
        aside={String(liveLinks.length)}
        focal
      >
        <div className={styles.stack}>
          {liveLinks.length === 0 ? (
            <p className={styles.empty}>
              Nothing recorded yet. Once the release is out, add each platform&apos;s URL here.
            </p>
          ) : (
            <div className={styles.stackTight}>
              {liveLinks.map((link) => (
                <div key={`${link.url}-${link.addedAt}`} className={styles.linkRow}>
                  <span className={styles.linkPlatform}>
                    {link.platform === 'other'
                      ? link.label || 'OTHER'
                      : DISTRIBUTION_PLATFORM_LABEL[link.platform]}
                  </span>
                  <button
                    type="button"
                    className={styles.linkUrl}
                    title={`Open ${link.url}`}
                    onClick={() => void window.candy.shell.openExternal(link.url)}
                  >
                    {link.url}
                  </button>
                  <span className={styles.fileMeta}>{formatStamp(link.addedAt)}</span>
                  <button
                    type="button"
                    className={styles.noteAction}
                    data-danger
                    onClick={() => removeLink(link)}
                  >
                    REMOVE
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className={styles.linkForm}>
            <SelectInput
              label="Platform"
              value={platform}
              options={PLATFORM_OPTIONS}
              onChange={setPlatform}
            />
            <TextInput label="URL" value={url} onChange={setUrl} mono placeholder="https://" />
            <Button
              variant="primary"
              size="sm"
              busy={mutations.patch.isPending}
              disabled={url.trim().length === 0}
              onClick={addLink}
            >
              Add
            </Button>
          </div>

          {platform === 'other' ? (
            <TextInput
              label="Platform name"
              value={label}
              onChange={setLabel}
              placeholder="Name it as you want it listed"
            />
          ) : null}

          <p className={styles.hint}>
            A future release will accept one aggregator link and resolve the rest automatically.
            Until then these are recorded as entered.
          </p>
        </div>
      </Panel>
    </DossierGrid>
  )
}

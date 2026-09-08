import { useState, type ReactNode } from 'react'
import type { MarketingAsset, MarketingAssetStatus } from '@shared/domain/projects'
import {
  MARKETING_ASSET_KINDS,
  MARKETING_ASSET_STATUSES,
  MARKETING_STATUS_LABEL,
  VIDEO_EXTENSIONS,
  createDefaultMarketingPlan,
  describeOffset,
  isMarketingAssetSettled,
  marketingShortfall
} from '@shared/domain/projects.constants'
import { Button } from '@renderer/components/primitives/Button'
import { Meter } from '@renderer/components/primitives/Meter'
import { Panel } from '@renderer/components/primitives/Panel'
import { DateInput, SelectInput, TextArea } from '@renderer/components/primitives/Input'
import { formatCountdown, formatIsoDate, isOverdue } from '../../lib/present'
import type { DossierTabProps } from './types'
import { DossierGrid } from './DossierGrid'
import styles from './dossier.module.scss'

const STATUS_OPTIONS = MARKETING_ASSET_STATUSES.map((status) => ({
  value: status,
  label: MARKETING_STATUS_LABEL[status]
}))

/**
 * The promotional plan.
 *
 * Created automatically once the master, cover and canvas are all chosen —
 * there is nothing to promote before then — and pre-populated with the
 * deliverables a release owes: the date reveal, the artwork reveal, three
 * promotion videos, social content, the day-before post and the release-day
 * video. Each carries a date, which is what the scheduling department will read.
 */
export function DossierPromotion({ project, mutations }: DossierTabProps): ReactNode {
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({})

  const plan = project.marketing
  const deliverablesReady =
    project.deliverables.master && project.deliverables.cover && project.deliverables.canvas

  if (!plan) {
    return (
      <DossierGrid>
        <Panel label="Promotion" index="01" className={styles.span6} focal>
          <div className={styles.stack}>
            <p className={styles.empty}>
              The promotional plan opens once the three shipping files are chosen. Select the final
              master, the cover art and the canvas on the RELEASE tab and the plan appears here,
              already populated with what the release owes.
            </p>

            <div className={styles.checklist}>
              {(
                [
                  ['Final master', project.deliverables.master],
                  ['Cover art', project.deliverables.cover],
                  ['Canvas', project.deliverables.canvas]
                ] as const
              ).map(([label, value]) => (
                <div key={label} className={styles.check} data-met={!!value || undefined}>
                  <span className={styles.checkMark} data-met={!!value || undefined} />
                  <span className={styles.checkBody}>
                    <span className={styles.checkLabel}>{label}</span>
                  </span>
                </div>
              ))}
            </div>

            {deliverablesReady ? (
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  size="sm"
                  busy={mutations.patch.isPending}
                  onClick={() =>
                    mutations.patch.mutate({
                      id: project.id,
                      patch: {
                        marketing: createDefaultMarketingPlan(project.distribution.releaseDate)
                      }
                    })
                  }
                >
                  Open the plan
                </Button>
              </div>
            ) : null}
          </div>
        </Panel>
      </DossierGrid>
    )
  }

  const shortfall = marketingShortfall(plan)
  const settled = plan.assets.filter((asset) => isMarketingAssetSettled(asset.status)).length

  const save = (asset: MarketingAsset): void => {
    mutations.saveMarketingAsset.mutate({ id: project.id, asset })
  }

  const attach = async (asset: MarketingAsset): Promise<void> => {
    const selected = await window.candy.shell.selectFile({
      title: `Select the file for ${asset.title}`,
      filters: [
        { name: 'Video', extensions: VIDEO_EXTENSIONS.map((ext) => ext.slice(1)) },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (selected) save({ ...asset, assetPath: selected })
  }

  return (
    <DossierGrid>
      <Panel
        label="Plan status"
        index="01"
        className={styles.span2}
        aside={`${settled}/${plan.assets.length}`}
      >
        <div className={styles.stack}>
          <Meter
            value={plan.assets.length === 0 ? 0 : settled / plan.assets.length}
            label="Ready or published"
            readout={`${settled} of ${plan.assets.length}`}
            tone="gold"
          />

          {project.distribution.releaseDate ? (
            <p className={styles.hint}>
              Release {formatIsoDate(project.distribution.releaseDate)} ·{' '}
              {formatCountdown(project.distribution.releaseDate)}
            </p>
          ) : (
            <p className={styles.warn}>
              No release date set, so nothing can be scheduled against one. Set it on the RELEASE
              tab and every deliverable below is dated automatically.
            </p>
          )}

          {shortfall.length === 0 ? (
            <p className={styles.hint}>Every required deliverable is accounted for.</p>
          ) : (
            <div className={styles.stackTight}>
              <span className={styles.sectionLabel}>Still owed</span>
              {shortfall.map((entry) => {
                const kind = MARKETING_ASSET_KINDS.find((item) => item.id === entry.kind)
                return (
                  <p key={entry.kind} className={styles.warn}>
                    {entry.owed} × {kind?.label ?? entry.kind}
                  </p>
                )
              })}
            </div>
          )}
        </div>
      </Panel>

      <Panel label="Plan notes" index="02" className={styles.span4}>
        <TextArea
          label="Campaign notes"
          value={noteDrafts.plan ?? plan.notes}
          onChange={(value) => setNoteDrafts((current) => ({ ...current, plan: value }))}
          rows={4}
          placeholder="Angle, references, who is posting what and where"
        />
        <div className={styles.actions}>
          <Button
            variant="primary"
            size="sm"
            disabled={(noteDrafts.plan ?? plan.notes) === plan.notes}
            busy={mutations.patch.isPending}
            onClick={() =>
              mutations.patch.mutate({
                id: project.id,
                patch: { marketing: { ...plan, notes: noteDrafts.plan ?? plan.notes } }
              })
            }
          >
            File notes
          </Button>
        </div>
      </Panel>

      {MARKETING_ASSET_KINDS.map((kind, index) => {
        const assets = plan.assets.filter((asset) => asset.kind === kind.id)
        const kindSettled = assets.filter((asset) => isMarketingAssetSettled(asset.status)).length
        const short = kindSettled < kind.required

        return (
          <Panel
            key={kind.id}
            label={kind.label}
            index={String(index + 3).padStart(2, '0')}
            className={styles.span6}
            aside={
              <span className={styles.assetGroupCount} data-short={short || undefined}>
                {kindSettled}/{kind.required} · {describeOffset(kind.offsetDays)}
              </span>
            }
          >
            <div className={styles.assetGroup}>
              <p className={styles.hint}>{kind.purpose}</p>

              {assets.map((asset) => {
                const overdue =
                  !isMarketingAssetSettled(asset.status) && isOverdue(asset.scheduledFor)

                return (
                  <div
                    key={asset.id}
                    className={styles.asset}
                    data-settled={isMarketingAssetSettled(asset.status) || undefined}
                    data-overdue={overdue || undefined}
                  >
                    <div className={styles.assetHead}>
                      <input
                        className={styles.assetTitle}
                        value={titleDrafts[asset.id] ?? asset.title}
                        aria-label="Deliverable title"
                        onChange={(event) =>
                          setTitleDrafts((current) => ({
                            ...current,
                            [asset.id]: event.target.value
                          }))
                        }
                        // Committed on blur rather than per keystroke: each save
                        // refetches the record, which would fight the cursor.
                        onBlur={() => {
                          const next = titleDrafts[asset.id]
                          if (next !== undefined && next !== asset.title) {
                            save({ ...asset, title: next })
                          }
                        }}
                      />

                      <span className={styles.assetCountdown} data-overdue={overdue || undefined}>
                        {formatCountdown(asset.scheduledFor)}
                      </span>

                      {kind.repeatable ? (
                        <Button
                          size="sm"
                          variant="danger"
                          busy={mutations.removeMarketingAsset.isPending}
                          onClick={() =>
                            mutations.removeMarketingAsset.mutate({
                              id: project.id,
                              assetId: asset.id
                            })
                          }
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>

                    <div className={styles.assetControls}>
                      <SelectInput
                        label="Status"
                        value={asset.status}
                        options={STATUS_OPTIONS}
                        onChange={(status: MarketingAssetStatus) => save({ ...asset, status })}
                      />

                      <DateInput
                        label="Goes out"
                        value={asset.scheduledFor ?? ''}
                        onChange={(value) => save({ ...asset, scheduledFor: value || null })}
                      />
                    </div>

                    <div className={styles.assetFile}>
                      {asset.assetPath ? (
                        <button
                          type="button"
                          className={styles.assetFilePath}
                          title={asset.assetPath}
                          onClick={() => void window.candy.shell.reveal(asset.assetPath as string)}
                        >
                          {asset.assetPath.split(/[\\/]/).pop()}
                        </button>
                      ) : (
                        <span className={styles.empty}>No file attached</span>
                      )}
                      <Button size="sm" onClick={() => void attach(asset)}>
                        {asset.assetPath ? 'Replace' : 'Attach'}
                      </Button>
                      {asset.assetPath ? (
                        <Button size="sm" onClick={() => save({ ...asset, assetPath: null })}>
                          Clear
                        </Button>
                      ) : null}
                    </div>

                    <TextArea
                      label="Notes"
                      value={noteDrafts[asset.id] ?? asset.notes}
                      onChange={(value) =>
                        setNoteDrafts((current) => ({ ...current, [asset.id]: value }))
                      }
                      rows={2}
                      placeholder="Hook, caption, which section of the track"
                    />
                    {(noteDrafts[asset.id] ?? asset.notes) !== asset.notes ? (
                      <div className={styles.actions}>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() =>
                            save({ ...asset, notes: noteDrafts[asset.id] ?? asset.notes })
                          }
                        >
                          File note
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )
              })}

              {kind.repeatable ? (
                <div className={styles.actions}>
                  <Button
                    size="sm"
                    busy={mutations.addMarketingAsset.isPending}
                    onClick={() =>
                      mutations.addMarketingAsset.mutate({ id: project.id, kind: kind.id })
                    }
                  >
                    Add another
                  </Button>
                </div>
              ) : null}
            </div>
          </Panel>
        )
      })}
    </DossierGrid>
  )
}

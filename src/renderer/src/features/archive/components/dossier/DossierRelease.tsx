import { useState, type ReactNode } from 'react'
import type { DeliverableKind, DistributionDetails, MediaFile } from '@shared/domain/projects'
import {
  AUDIO_EXTENSIONS,
  DELIVERABLE_HINT,
  DELIVERABLE_KINDS,
  DELIVERABLE_LABEL,
  IMAGE_EXTENSIONS,
  RELEASE_KINDS,
  RELEASE_KIND_LABEL,
  VIDEO_EXTENSIONS,
  evaluateReadiness
} from '@shared/domain/projects.constants'
import { Button } from '@renderer/components/primitives/Button'
import { Panel } from '@renderer/components/primitives/Panel'
import {
  Checkbox,
  DateInput,
  SelectInput,
  TagInput,
  TextArea,
  TextInput
} from '@renderer/components/primitives/Input'
import { formatBytes } from '@renderer/lib/format'
import { Artwork } from '../Artwork'
import type { DossierTabProps } from './types'
import { DossierGrid } from './DossierGrid'
import styles from './dossier.module.scss'

/** Which discovered files each deliverable may be chosen from. */
const SOURCE: Record<
  DeliverableKind,
  keyof Pick<DossierTabProps['project'], 'audio' | 'images' | 'videos'>
> = {
  master: 'audio',
  cover: 'images',
  canvas: 'videos'
}

const BROWSE_FILTER: Record<DeliverableKind, { name: string; extensions: string[] }[]> = {
  master: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS.map((ext) => ext.slice(1)) }],
  cover: [{ name: 'Images', extensions: IMAGE_EXTENSIONS.map((ext) => ext.slice(1)) }],
  canvas: [{ name: 'Video', extensions: VIDEO_EXTENSIONS.map((ext) => ext.slice(1)) }]
}

/**
 * The distribution package.
 *
 * Two things happen here: the operator picks the three files that actually ship,
 * and fills in the metadata a distributor will ask for. Completing both is what
 * unlocks SCHEDULED, and the checklist panel states exactly what is still owed
 * rather than leaving a disabled control to be puzzled over.
 *
 * The metadata form is drafted locally and filed explicitly. Persisting on every
 * keystroke would mean a mutation per character — and each write refetches the
 * record, which would fight the cursor. An explicit file action also matches
 * what this is: submitting a record, not adjusting a preference.
 */
export function DossierRelease({ project, mutations }: DossierTabProps): ReactNode {
  const [draft, setDraft] = useState<DistributionDetails>(project.distribution)
  const [tags, setTags] = useState<string[]>(project.tags)

  /*
   * The draft is re-seeded from the server, but only while it is clean.
   *
   * The record's `updatedAt` moves for reasons unrelated to this form — picking
   * a deliverable above writes immediately — so re-seeding unconditionally
   * would discard metadata the operator had typed but not yet filed. Comparing
   * against the seed rather than against the live record is what makes that
   * distinction: after a successful file the draft equals the new server value,
   * so it reads as clean and re-seeds; mid-edit it does not.
   *
   * Adjusted during render rather than in an effect, which is the supported way
   * to reconcile state with changed props and avoids a second render pass.
   */
  const incoming = JSON.stringify([project.distribution, project.tags])
  const [seed, setSeed] = useState(incoming)
  const dirty = JSON.stringify([draft, tags]) !== seed

  if (seed !== incoming && !dirty) {
    setSeed(incoming)
    setDraft(project.distribution)
    setTags(project.tags)
  }

  const readiness = evaluateReadiness(project)
  const outstanding = readiness.filter((requirement) => !requirement.met).length

  const set = <K extends keyof DistributionDetails>(
    key: K,
    value: DistributionDetails[K]
  ): void => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const chooseDeliverable = (kind: DeliverableKind, path: string | null): void => {
    mutations.patch.mutate({ id: project.id, patch: { deliverables: { [kind]: path } } })
  }

  const browseFor = async (kind: DeliverableKind): Promise<void> => {
    const selected = await window.candy.shell.selectFile({
      title: `Select the ${DELIVERABLE_LABEL[kind].toLowerCase()}`,
      filters: BROWSE_FILTER[kind]
    })
    if (selected) chooseDeliverable(kind, selected)
  }

  return (
    <DossierGrid>
      <Panel label="Deliverables" index="01" className={styles.span4} focal>
        <div className={styles.deliverables}>
          {DELIVERABLE_KINDS.map((kind) => {
            const selected = project.deliverables[kind]
            const choices = project[SOURCE[kind]] as MediaFile[]

            return (
              <div key={kind} className={styles.deliverable}>
                <div className={styles.deliverableHead}>
                  <span className={styles.deliverableLabel}>{DELIVERABLE_LABEL[kind]}</span>
                  <span className={styles.deliverableState} data-selected={!!selected || undefined}>
                    {selected ? 'SELECTED' : 'NOT SET'}
                  </span>
                </div>

                {kind === 'cover' ? (
                  <Artwork path={selected} width={320} alt="Selected cover art" />
                ) : null}

                {kind === 'canvas' && selected ? (
                  // No frame can be extracted from a video without a decoder, so
                  // the filename is stated instead of a fabricated preview.
                  <p className={styles.hint}>{selected.split(/[\\/]/).pop()}</p>
                ) : null}

                {kind === 'master' && selected ? (
                  <p className={styles.hint}>{selected.split(/[\\/]/).pop()}</p>
                ) : null}

                {choices.length === 0 ? (
                  <p className={styles.empty}>Nothing of this kind was found in the folder.</p>
                ) : (
                  <div className={styles.deliverableChoice}>
                    {choices.map((file) => (
                      <button
                        key={file.path}
                        type="button"
                        className={styles.choice}
                        data-selected={selected === file.path || undefined}
                        title={file.path}
                        disabled={mutations.patch.isPending}
                        onClick={() =>
                          chooseDeliverable(kind, selected === file.path ? null : file.path)
                        }
                      >
                        <span className={styles.choiceName}>{file.relativePath}</span>
                        <span className={styles.choiceMeta}>{formatBytes(file.sizeBytes)}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className={styles.actions}>
                  <Button size="sm" onClick={() => void browseFor(kind)}>
                    Browse…
                  </Button>
                  {selected ? (
                    <Button size="sm" onClick={() => chooseDeliverable(kind, null)}>
                      Clear
                    </Button>
                  ) : null}
                </div>

                <p className={styles.hint}>{DELIVERABLE_HINT[kind]}</p>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel
        label="Readiness"
        index="02"
        className={styles.span2}
        aside={outstanding === 0 ? 'COMPLETE' : `${outstanding} OWED`}
      >
        <div className={styles.checklist}>
          {readiness.map((requirement) => (
            <div
              key={requirement.id}
              className={styles.check}
              data-met={requirement.met || undefined}
            >
              <span className={styles.checkMark} data-met={requirement.met || undefined} />
              <span className={styles.checkBody}>
                <span className={styles.checkLabel}>{requirement.label}</span>
                {!requirement.met && requirement.hint ? (
                  <span className={styles.checkHint}>{requirement.hint}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>

        <p className={styles.hint}>
          {outstanding === 0
            ? 'Everything a distributor asks for is on file. This release can be scheduled.'
            : 'SCHEDULED and RELEASED stay closed until every item above is on file.'}
        </p>
      </Panel>

      <Panel
        label="Distribution metadata"
        index="03"
        className={styles.span6}
        aside={dirty ? <span className={styles.dirty}>UNFILED CHANGES</span> : undefined}
      >
        <div className={styles.formGrid}>
          <TextInput
            label="Release title"
            value={draft.title}
            onChange={(value) => set('title', value)}
            placeholder="As it should appear on the platforms"
          />
          <TextInput
            label="Primary artist"
            value={draft.primaryArtist}
            onChange={(value) => set('primaryArtist', value)}
          />

          <TagInput
            label="Featuring"
            values={draft.featuring}
            onChange={(value) => set('featuring', value)}
            placeholder="Add a featured artist"
          />
          <SelectInput
            label="Release type"
            value={draft.releaseKind}
            options={RELEASE_KINDS.map((kind) => ({
              value: kind,
              label: RELEASE_KIND_LABEL[kind]
            }))}
            onChange={(value) => set('releaseKind', value)}
          />

          <DateInput
            label="Release date"
            value={draft.releaseDate ?? ''}
            onChange={(value) => set('releaseDate', value || null)}
            hint="Moving this re-dates every unpublished promotional deliverable."
          />
          <TextInput
            label="Language"
            value={draft.language}
            onChange={(value) => set('language', value)}
            placeholder="en"
          />

          <TextInput label="Genre" value={draft.genre} onChange={(value) => set('genre', value)} />
          <TextInput
            label="Sub-genre"
            value={draft.subGenre}
            onChange={(value) => set('subGenre', value)}
          />

          <TextInput label="Mood" value={draft.mood} onChange={(value) => set('mood', value)} />
          <TextInput
            label="Label"
            value={draft.label}
            onChange={(value) => set('label', value)}
            placeholder="Self-released"
          />

          <TextInput
            label="ISRC"
            value={draft.isrc}
            onChange={(value) => set('isrc', value.toUpperCase())}
            mono
            maxLength={15}
            hint="Assigned per recording. Your distributor issues one if you have none."
          />
          <TextInput
            label="UPC / EAN"
            value={draft.upc}
            onChange={(value) => set('upc', value)}
            mono
            maxLength={14}
            hint="Assigned per release."
          />

          <TextInput
            label="Copyright line"
            value={draft.copyright}
            onChange={(value) => set('copyright', value)}
            placeholder="© 2026 Your Name"
          />

          <div className={styles.stack}>
            <TagInput
              label="Tags"
              values={tags}
              onChange={setTags}
              placeholder="Add a tag"
              hint="Used to group and filter the register."
            />
            <Checkbox
              label="Explicit content"
              checked={draft.explicit}
              onChange={(value) => set('explicit', value)}
            />
          </div>

          <TextArea
            label="Credits"
            value={draft.credits}
            onChange={(value) => set('credits', value)}
            rows={4}
            className={styles.formGridWide}
            placeholder="Written, produced, mixed and mastered by…"
          />

          <TextArea
            label="Lyrics"
            value={draft.lyrics}
            onChange={(value) => set('lyrics', value)}
            rows={6}
            className={styles.formGridWide}
          />
        </div>

        <div className={styles.actions}>
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty}
            busy={mutations.patch.isPending}
            onClick={() =>
              mutations.patch.mutate({
                id: project.id,
                patch: { distribution: draft, tags }
              })
            }
          >
            File changes
          </Button>
          <Button
            size="sm"
            disabled={!dirty}
            onClick={() => {
              setDraft(project.distribution)
              setTags(project.tags)
            }}
          >
            Revert
          </Button>
        </div>
      </Panel>
    </DossierGrid>
  )
}

import { useEffect, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { getSection } from '@shared/domain/navigation'
import {
  MAX_COLOPHON_LINKS,
  MAX_DISCORD,
  MAX_EMAIL,
  MAX_PHONE,
  dialString
} from '@shared/domain/colophon.constants'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { TextInput } from '@renderer/components/primitives/Input'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { Skeleton } from '@renderer/components/primitives/Skeleton'
import { gridVariants } from '@renderer/motion/transitions'
import { useSystemStore, selectArchive } from '@renderer/app/store/system.store'
import { useColophonDraft } from '@renderer/hooks/useColophon'
import { formatIsoDate } from '@renderer/lib/format'
import { LinkEditor } from '@renderer/features/artists/components/LinkEditor'
import styles from './ColophonPage.module.scss'

/** `14 MAR 2026 · 14:07`, in the operator's own time. */
function formatFiled(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, '0')
  const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${formatIsoDate(iso)} · ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * COLOPHON: the details the website carries.
 *
 * The first department of PUBLICATION. A colophon is the note at the back of
 * a book saying who made it and where they can be found, and the website's
 * footer and contact pages are that note: the address bookings are written to,
 * the number that is called, the Discord username people message after a
 * booking, and where to follow from.
 *
 * Filed as a draft through the unsaved-changes bar, as REGULATION is, rather
 * than committing as it is typed like the roster's sheet. This is a record the
 * website will be built from, and a half-typed address should never be one.
 *
 * No focal panel. Three details and a list are read evenly; none of them is
 * the page's one object, and lending one the crimson would say otherwise.
 */
export function ColophonPage(): ReactNode {
  const section = getSection('colophon')
  const archive = useSystemStore(selectArchive)
  const ready = archive.state === 'online'

  const colophon = useColophonDraft(ready)
  const { fields, checks, edit, stored } = colophon

  /*
   * Publishes this page's unsaved-changes controller for the console chrome to
   * render, and withdraws it on unmount, exactly as REGULATION does: a
   * stranded controller would leave the rail refusing to navigate with no page
   * left to file.
   */
  const setUnsaved = useSystemStore((state) => state.setUnsaved)
  useEffect(() => {
    setUnsaved({
      dirty: colophon.dirty,
      saving: colophon.saving,
      error: colophon.error,
      subject: 'colophon',
      save: colophon.save,
      discard: colophon.discard
    })
    return () => setUnsaved(null)
  }, [colophon.dirty, colophon.saving, colophon.error, colophon.save, colophon.discard, setUnsaved])

  const filed = stored !== undefined && stored.updatedAt > 0
  const dials = fields && checks.phone.ok ? dialString(fields.phone) : ''

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        guideId="colophon"
        actions={
          ready && stored ? (
            <div className={styles.headerActions}>
              <StatusDot
                tone={filed ? 'online' : 'offline'}
                label={filed ? `Filed ${formatFiled(stored.updatedAt)}` : 'Nothing filed yet'}
              />
            </div>
          ) : null
        }
      />

      {!ready ? (
        <Panel label="Correspondence" index="01">
          <p className={styles.hint}>
            The archive is not connected, so the colophon cannot be read. NEXUS reports why.
          </p>
        </Panel>
      ) : !fields ? (
        <div className={styles.grid}>
          <Skeleton height="300px" />
          <Skeleton height="300px" />
          <Skeleton height="120px" className={styles.wide} />
        </div>
      ) : (
        <motion.div
          className={styles.grid}
          variants={gridVariants}
          initial="initial"
          animate="animate"
        >
          <Panel label="Correspondence" index="01">
            <div className={styles.fields}>
              <TextInput
                label="Email"
                layout="gutter"
                value={fields.email}
                onChange={(email) => edit({ email })}
                placeholder="name@domain.com"
                maxLength={MAX_EMAIL}
                disabled={colophon.saving}
                invalid={!checks.email.ok}
                hint={
                  checks.email.reason ??
                  'Where bookings and questions are written to. The website shows it in its footer and on its contact page.'
                }
              />
              <TextInput
                label="Phone"
                layout="gutter"
                value={fields.phone}
                onChange={(phone) => edit({ phone })}
                placeholder="+1 (902) 555-0142"
                maxLength={MAX_PHONE}
                disabled={colophon.saving}
                invalid={!checks.phone.ok}
                hint={
                  checks.phone.reason ??
                  (dials
                    ? `Dials as ${dials}.`
                    : 'As it should read on the page. What it dials is taken from its digits.')
                }
              />
              <TextInput
                label="Discord"
                layout="gutter"
                mono
                value={fields.discord}
                onChange={(discord) => edit({ discord })}
                placeholder="username"
                maxLength={MAX_DISCORD}
                disabled={colophon.saving}
                invalid={!checks.discord.ok}
                hint={
                  checks.discord.reason ??
                  'The username people message after a booking. Lowercase, without the @.'
                }
              />
            </div>
          </Panel>

          <Panel
            label="Follow"
            index="02"
            aside={
              <span className={styles.count}>
                {fields.links.length} of {MAX_COLOPHON_LINKS}
              </span>
            }
          >
            <p className={styles.lede}>
              Where the website points people to follow, in the order it lists them. The platform is
              guessed from the address; change it where it guessed wrong.
            </p>
            <LinkEditor
              links={fields.links}
              onChange={(links) => edit({ links })}
              max={MAX_COLOPHON_LINKS}
              disabled={colophon.saving}
            />
          </Panel>

          {/*
            Where the record stands, said plainly.

            The website does not read this yet, and a page that let the
            operator believe otherwise would be fabricating a state. The
            honest readout is that it is kept here and published nowhere.
          */}
          <Panel label="Publication" index="03" className={styles.wide}>
            <FieldGrid columns={3}>
              <Field label="Kept" value="In the archive, on this machine" />
              <Field
                label="Published"
                value="Not yet"
                hint="Nothing reads the colophon from outside. Publishing arrives with the website itself."
              />
              <Field
                label="Last filed"
                value={filed ? formatFiled(stored.updatedAt) : 'Never'}
                mono
              />
            </FieldGrid>
          </Panel>
        </motion.div>
      )}
    </div>
  )
}

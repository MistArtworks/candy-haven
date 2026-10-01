import { useEffect, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { getSection } from '@shared/domain/navigation'
import { MAX_LINK_URL } from '@shared/domain/artists.constants'
import {
  COLOPHON_DETAILS,
  MAX_BASED_IN,
  MAX_DISCORD,
  MAX_EMAIL,
  MAX_NAME,
  MAX_PHONE,
  MAX_TELEGRAM,
  MAX_TIME_ZONE,
  PROFILE_GROUPS,
  PROFILE_GROUP_SPEC,
  PROFILE_PLATFORMS,
  PROFILE_PLATFORM_LABEL,
  dialString,
  isNavbarProfile,
  localTimeZone,
  platformsIn,
  profileExample,
  telegramLink,
  whatsappLink,
  type ColophonDetail,
  type ProfileGroup,
  type ProfilePlatform
} from '@shared/domain/colophon.constants'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { TextInput } from '@renderer/components/primitives/Input'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { Skeleton } from '@renderer/components/primitives/Skeleton'
import { gridVariants } from '@renderer/motion/transitions'
import { useSystemStore, selectArchive } from '@renderer/app/store/system.store'
import { useColophonDraft, type ColophonDraft } from '@renderer/hooks/useColophon'
import { formatIsoDate } from '@renderer/lib/format'
import * as shell from '@renderer/lib/shell'
import styles from './ColophonPage.module.scss'

interface DetailField {
  label: string
  placeholder: string
  maxLength: number
  mono?: boolean
  /** What the field says under it while it holds nothing to report on. */
  note: string
}

/** How each detail is drawn. The rules themselves live in the domain. */
const DETAIL_FIELD: Record<ColophonDetail, DetailField> = {
  email: {
    label: 'Booking email',
    placeholder: 'bookings@domain.com',
    maxLength: MAX_EMAIL,
    note: 'Where bookings and questions are written to. The website shows it in its footer and on its contact page.'
  },
  managementEmail: {
    label: 'Management email',
    placeholder: 'management@domain.com',
    maxLength: MAX_EMAIL,
    note: 'For management: labels, brands and partnerships.'
  },
  pressEmail: {
    label: 'Press email',
    placeholder: 'press@domain.com',
    maxLength: MAX_EMAIL,
    note: 'For press, interviews and features.'
  },
  phone: {
    label: 'Phone number',
    placeholder: '+1 (902) 555-0142',
    maxLength: MAX_PHONE,
    note: 'As it should read on the page. What it dials is taken from its digits.'
  },
  whatsapp: {
    label: 'WhatsApp number',
    placeholder: '+1 902 555 0142',
    maxLength: MAX_PHONE,
    note: 'With its country code. It may be the phone number above, or another line.'
  },
  discord: {
    label: 'Discord username',
    placeholder: 'username',
    maxLength: MAX_DISCORD,
    mono: true,
    note: 'The username people message after a booking. Lowercase, without the @.'
  },
  telegram: {
    label: 'Telegram username',
    placeholder: 'username',
    maxLength: MAX_TELEGRAM,
    mono: true,
    note: 'Without the @. Five characters at least.'
  },
  basedIn: {
    label: 'Based in',
    placeholder: 'City, Country',
    maxLength: MAX_BASED_IN,
    note: 'Where the artist works from, as the website prints it.'
  },
  timeZone: {
    label: 'Time zone',
    placeholder: 'Europe/London',
    maxLength: MAX_TIME_ZONE,
    mono: true,
    note: 'The zone, not an offset, so summer time takes care of itself.'
  },
  management: {
    label: 'Management',
    placeholder: 'Name or company',
    maxLength: MAX_NAME,
    note: 'Who manages the artist. Left empty while it is the artist.'
  },
  agency: {
    label: 'Booking agency',
    placeholder: 'Agency',
    maxLength: MAX_NAME,
    note: 'The agency that books the shows, when there is one.'
  },
  label: {
    label: 'Label',
    placeholder: 'Label',
    maxLength: MAX_NAME,
    note: 'The label the records come out on. Left empty while independent.'
  },
  pressKit: {
    label: 'Press kit',
    placeholder: 'https://',
    maxLength: MAX_LINK_URL,
    mono: true,
    note: 'The electronic press kit: biography, photographs and riders, at any address that opens.'
  }
}

/** The details in each of the two upper panels. */
const CORRESPONDENCE: readonly ColophonDetail[] = COLOPHON_DETAILS.slice(0, 7)
const PARTICULARS: readonly ColophonDetail[] = COLOPHON_DETAILS.slice(7)

/** `14 MAR 2026 · 14:07`, in the operator's own time. */
function formatFiled(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, '0')
  const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${formatIsoDate(iso)} · ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** `It is 14:07 there now, GMT-3.`: the time in a zone, for the field to show. */
function timeIn(zone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'shortOffset'
  }).formatToParts(new Date())
  const part = (type: string): string => parts.find((entry) => entry.type === type)?.value ?? ''
  return `It is ${part('hour')}:${part('minute')} there now, ${part('timeZoneName')}.`
}

/** Where a detail opens, when it opens anywhere. */
function detailLink(detail: ColophonDetail, value: string, ok: boolean): string {
  if (!ok || !value.trim()) return ''
  if (detail === 'whatsapp') return whatsappLink(value)
  if (detail === 'telegram') return telegramLink(value)
  if (detail === 'pressKit') return value.trim()
  return ''
}

/** What a detail says under it while it is acceptable. */
function detailHint(detail: ColophonDetail, value: string, link: string): string {
  if (!value.trim()) return DETAIL_FIELD[detail].note
  if (detail === 'phone') {
    const dials = dialString(value)
    return dials ? `Dials as ${dials}.` : DETAIL_FIELD[detail].note
  }
  if (detail === 'whatsapp' || detail === 'telegram') {
    return link ? `Opens at ${link.replace(/^https:\/\//, '')}.` : DETAIL_FIELD[detail].note
  }
  if (detail === 'timeZone') return timeIn(value.trim())
  return DETAIL_FIELD[detail].note
}

/** What a platform's field says under it while its address is acceptable. */
function profileHint(platform: ProfilePlatform, set: boolean): string | undefined {
  const label = PROFILE_PLATFORM_LABEL[platform]
  if (isNavbarProfile(platform)) {
    return set
      ? 'In the navbar and the footer.'
      : `Not set. The navbar and the footer leave ${label} out until it is.`
  }
  if (platform === 'apple' && !set) {
    return 'Not set. The website leaves Apple Music out until it is.'
  }
  return undefined
}

/** A text action in a field's gutter: Open, Use local. */
function Action({
  label,
  onPress,
  disabled,
  name
}: {
  label: string
  onPress: () => void
  disabled: boolean
  name?: string
}): ReactNode {
  return (
    <button
      type="button"
      className={styles.action}
      disabled={disabled}
      aria-label={name}
      onClick={onPress}
    >
      {label}
    </button>
  )
}

/**
 * COLOPHON: the details the website carries.
 *
 * The first department of PUBLICATION. A colophon is the note at the back of
 * a book saying who made it and where they can be found, and the website's
 * footer and contact pages are that note: every address and number people
 * reach the artist through, who represents them and where they are, and their
 * profile on every platform the colophon knows.
 *
 * Filed as a draft through the unsaved-changes bar, as REGULATION is, rather
 * than committing as it is typed like the roster's sheet. This is a record the
 * website will be built from, and a half-typed address should never be one.
 *
 * No focal panel. The details and the profiles are read evenly; none of them
 * is the page's one object, and lending one the crimson would say otherwise.
 */
export function ColophonPage(): ReactNode {
  const section = getSection('colophon')
  const archive = useSystemStore(selectArchive)
  const ready = archive.state === 'online'

  const colophon = useColophonDraft(ready)
  const { fields, stored } = colophon

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
  const setUp = (platforms: readonly ProfilePlatform[]): number =>
    fields
      ? platforms.filter(
          (platform) => fields.profiles[platform].trim() && colophon.checks.profiles[platform].ok
        ).length
      : 0

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
          <Skeleton height="520px" />
          <Skeleton height="520px" />
          <Skeleton height="320px" className={styles.wide} />
        </div>
      ) : (
        <motion.div
          className={styles.grid}
          variants={gridVariants}
          initial="initial"
          animate="animate"
        >
          <Panel label="Correspondence" index="01">
            <Details details={CORRESPONDENCE} colophon={colophon} />
          </Panel>

          <Panel label="Particulars" index="02">
            <Details details={PARTICULARS} colophon={colophon} />
          </Panel>

          {/*
            A field per platform, every platform named, in a panel per kind.
            Not a list to add to: the website draws each platform behind its
            own mark and has nowhere to put a second one, and an empty field
            says plainly which profile is still missing.
          */}
          {PROFILE_GROUPS.map((group, position) => (
            <ProfilePanel
              key={group}
              group={group}
              index={String(position + 3).padStart(2, '0')}
              set={setUp(platformsIn(group))}
              colophon={colophon}
            />
          ))}

          {/*
            Where the record stands, said plainly.

            The website does not read this yet, and a page that let the
            operator believe otherwise would be fabricating a state. The
            honest readout is that it is kept here and published nowhere.
          */}
          <Panel
            label="Publication"
            index={String(PROFILE_GROUPS.length + 3).padStart(2, '0')}
            className={styles.wide}
          >
            <FieldGrid columns={4}>
              <Field label="Kept" value="In the archive, on this machine" />
              <Field
                label="Published"
                value="Not yet"
                hint="Nothing reads the colophon from outside. Publishing arrives with the website itself."
              />
              <Field
                label="Profiles set"
                value={`${setUp(PROFILE_PLATFORMS)} of ${PROFILE_PLATFORMS.length}`}
                mono
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

/** A column of details, each with the rule and the readout its kind needs. */
function Details({
  details,
  colophon
}: {
  details: readonly ColophonDetail[]
  colophon: ColophonDraft
}): ReactNode {
  const { fields, checks, edit, saving } = colophon
  if (!fields) return null

  const local = localTimeZone()

  return (
    <div className={styles.fields}>
      {details.map((detail) => {
        const spec = DETAIL_FIELD[detail]
        const value = fields[detail]
        const check = checks[detail]
        const link = detailLink(detail, value, check.ok)
        const offerLocal = detail === 'timeZone' && value.trim() !== local

        return (
          <TextInput
            key={detail}
            label={spec.label}
            layout="gutter"
            mono={spec.mono}
            value={value}
            onChange={(next) => edit({ [detail]: next })}
            placeholder={spec.placeholder}
            maxLength={spec.maxLength}
            disabled={saving}
            invalid={!check.ok}
            hint={check.reason ?? detailHint(detail, value, link)}
            aside={
              link || offerLocal ? (
                <span className={styles.actions}>
                  {link ? (
                    <Action
                      label="Open"
                      disabled={saving}
                      onPress={() => shell.openExternal(link)}
                    />
                  ) : null}
                  {offerLocal ? (
                    <Action
                      label="Use local"
                      name={`Use this machine's time zone, ${local}`}
                      disabled={saving}
                      onPress={() => edit({ timeZone: local })}
                    />
                  ) : null}
                </span>
              ) : undefined
            }
          />
        )
      })}
    </div>
  )
}

/** One kind of platform: its purpose, then a field for each, two columns across. */
function ProfilePanel({
  group,
  index,
  set,
  colophon
}: {
  group: ProfileGroup
  index: string
  set: number
  colophon: ColophonDraft
}): ReactNode {
  const { fields, checks, edit, saving } = colophon
  if (!fields) return null

  const platforms = platformsIn(group)
  const spec = PROFILE_GROUP_SPEC[group]

  return (
    <Panel
      label={spec.label}
      index={index}
      className={styles.wide}
      aside={
        <span className={styles.count}>
          {set} of {platforms.length} set
        </span>
      }
    >
      <p className={styles.lede}>{spec.purpose}</p>
      <div className={styles.profiles}>
        {platforms.map((platform) => {
          const url = fields.profiles[platform]
          const check = checks.profiles[platform]
          const opens = check.ok && url.trim().length > 0
          return (
            <TextInput
              key={platform}
              label={PROFILE_PLATFORM_LABEL[platform]}
              layout="gutter"
              mono
              value={url}
              onChange={(next) => edit({ profiles: { [platform]: next } })}
              placeholder={profileExample(platform)}
              maxLength={MAX_LINK_URL}
              disabled={saving}
              invalid={!check.ok}
              hint={check.reason ?? profileHint(platform, opens)}
              aside={
                opens ? (
                  <Action
                    label="Open"
                    name={`Open ${PROFILE_PLATFORM_LABEL[platform]}`}
                    disabled={saving}
                    onPress={() => shell.openExternal(url.trim())}
                  />
                ) : undefined
              }
            />
          )
        })}
      </div>
    </Panel>
  )
}

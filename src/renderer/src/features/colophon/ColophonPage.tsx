import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { getSection } from '@shared/domain/navigation'
import { MAX_LINK_URL, checkLinkUrl, type NameCheck } from '@shared/domain/artists.constants'
import {
  MAX_DISCORD,
  MAX_EMAIL,
  MAX_PHONE,
  PROFILE_PLATFORMS,
  PROFILE_PLATFORM_LABEL,
  dialString,
  isCoreProfile,
  isNavbarProfile,
  listedPlatforms,
  profilePlatformOf,
  type ColophonProfiles,
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
import { useColophonDraft } from '@renderer/hooks/useColophon'
import { formatIsoDate } from '@renderer/lib/format'
import * as shell from '@renderer/lib/shell'
import styles from './ColophonPage.module.scss'

/** What each platform's address looks like, as the field's example. */
const PROFILE_PLACEHOLDER: Record<ProfilePlatform, string> = {
  instagram: 'https://www.instagram.com/…',
  spotify: 'https://open.spotify.com/artist/…',
  apple: 'https://music.apple.com/…/artist/…',
  soundcloud: 'https://soundcloud.com/…',
  youtube: 'https://www.youtube.com/@…',
  'youtube-music': 'https://music.youtube.com/channel/…',
  deezer: 'https://www.deezer.com/artist/…',
  tidal: 'https://tidal.com/artist/…',
  amazon: 'https://music.amazon.com/artists/…',
  bandcamp: 'https://….bandcamp.com',
  beatport: 'https://www.beatport.com/artist/…',
  beatsource: 'https://www.beatsource.com/artist/…',
  traxsource: 'https://www.traxsource.com/artist/…',
  mixcloud: 'https://www.mixcloud.com/…',
  audiomack: 'https://audiomack.com/…',
  qobuz: 'https://www.qobuz.com/…/interpreter/…',
  pandora: 'https://www.pandora.com/artist/…',
  anghami: 'https://play.anghami.com/artist/…',
  boomplay: 'https://www.boomplay.com/artists/…',
  jiosaavn: 'https://www.jiosaavn.com/artist/…',
  gaana: 'https://gaana.com/artist/…'
}

/** `14 MAR 2026 · 14:07`, in the operator's own time. */
function formatFiled(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, '0')
  const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${formatIsoDate(iso)} · ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** What a platform's field says under it while its address is acceptable. */
function profileHint(platform: ProfilePlatform, set: boolean): string | undefined {
  const label = PROFILE_PLATFORM_LABEL[platform]
  if (set) return isNavbarProfile(platform) ? 'In the navbar and the footer.' : undefined
  if (isNavbarProfile(platform)) {
    return `Not set. The navbar and the footer leave ${label} out until it is.`
  }
  if (isCoreProfile(platform)) return `Not set. The website leaves ${label} out until it is.`
  return 'Not set. Remove it if there is no profile here yet.'
}

/**
 * What the add field makes of what has been pasted into it.
 *
 * Recognised by its address, the way the roster's link editor guesses a
 * platform, but here the guess is the whole decision: an address goes under
 * the platform it is on, or nowhere. There is no picker to correct it with,
 * because a profile filed under the wrong platform is exactly the mistake
 * each field refuses.
 */
function readAddition(
  draft: string,
  profiles: Readonly<ColophonProfiles>
): { platform: ProfilePlatform | null; check: NameCheck } {
  const url = draft.trim()
  if (!url) return { platform: null, check: { ok: false } }

  const opens = checkLinkUrl(url)
  if (!opens.ok) return { platform: null, check: opens }

  const platform = profilePlatformOf(url)
  if (!platform) {
    return {
      platform: null,
      check: { ok: false, reason: 'That address is on none of the platforms the colophon knows.' }
    }
  }
  if (profiles[platform]?.trim()) {
    const label = PROFILE_PLATFORM_LABEL[platform]
    return {
      platform,
      check: {
        ok: false,
        reason: `${label} is on the page already, with an address. Change it in its own field.`
      }
    }
  }
  return { platform, check: { ok: true } }
}

/**
 * COLOPHON: the details the website carries.
 *
 * The first department of PUBLICATION. A colophon is the note at the back of
 * a book saying who made it and where they can be found, and the website's
 * footer and contact pages are that note: the address bookings are written to,
 * the number that is called, the Discord username people message after a
 * booking, and the artist's profile on every platform people follow and
 * listen on.
 *
 * Filed as a draft through the unsaved-changes bar, as REGULATION is, rather
 * than committing as it is typed like the roster's sheet. This is a record the
 * website will be built from, and a half-typed address should never be one.
 *
 * No focal panel. Three details and a set of profiles are read evenly; none of
 * them is the page's one object, and lending one the crimson would say
 * otherwise.
 */
export function ColophonPage(): ReactNode {
  const section = getSection('colophon')
  const archive = useSystemStore(selectArchive)
  const ready = archive.state === 'online'

  const colophon = useColophonDraft(ready)
  const { fields, checks, edit, setProfile, removeProfile, stored } = colophon

  // What is being pasted into the add field. The page's own, not the draft's:
  // nothing typed here is filed until Add puts it under its platform.
  const [adding, setAdding] = useState('')

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

  const listed = fields ? listedPlatforms(fields.profiles) : []
  const setUp = listed.filter(
    (platform) => fields?.profiles[platform]?.trim() && checks.profiles[platform]?.ok
  ).length
  const unlisted = PROFILE_PLATFORMS.filter((platform) => !listed.includes(platform))

  const addition = fields ? readAddition(adding, fields.profiles) : null
  const add = (): void => {
    if (!addition?.check.ok || !addition.platform || colophon.saving) return
    setProfile(addition.platform, adding.trim())
    setAdding('')
  }

  const additionHint = (): string => {
    if (addition?.check.reason) return addition.check.reason
    if (addition?.check.ok && addition.platform) {
      const label = PROFILE_PLATFORM_LABEL[addition.platform]
      return listed.includes(addition.platform)
        ? `That is ${label}. Add puts it in its field above.`
        : `That is ${label}. Add puts it on the page.`
    }
    if (unlisted.length === 0) return 'Every platform the colophon knows is on the page.'
    return `Paste a profile address and it is placed under its own platform. Also known: ${unlisted
      .map((platform) => PROFILE_PLATFORM_LABEL[platform])
      .join(', ')}.`
  }

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
          <Skeleton height="260px" />
          <Skeleton height="260px" />
          <Skeleton height="360px" className={styles.wide} />
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
                label="Booking email"
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
                label="Phone number"
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
                label="Discord username"
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

          {/*
            Where the record stands, said plainly, beside the details rather
            than under the profiles: the profiles grow as platforms are added,
            and this should not move down the page each time one is.

            The website does not read this yet, and a page that let the
            operator believe otherwise would be fabricating a state. The
            honest readout is that it is kept here and published nowhere.
          */}
          <Panel label="Publication" index="02">
            <FieldGrid columns={1}>
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

          {/*
            A field per platform, not a free list: the website draws each
            platform behind its own mark and has nowhere to put a second one,
            and an empty field says plainly which profile is still missing.

            The five the website cannot do without are always here. The rest
            arrive by pasting an address, and leave again with Remove, so the
            page carries the platforms the artist is actually on rather than
            opening on sixteen empty fields.
          */}
          <Panel
            label="Profiles"
            index="03"
            className={styles.wide}
            aside={
              <span className={styles.count}>
                {setUp} of {listed.length} set
              </span>
            }
          >
            <p className={styles.lede}>
              Where the artist is followed and heard. Each address must be on its own platform, and
              one left empty is left off the website. The navbar and the footer draw Instagram,
              SoundCloud, Spotify and YouTube; the rest are kept for the website to carry.
            </p>
            <div className={styles.profiles}>
              {listed.map((platform) => {
                const url = fields.profiles[platform] ?? ''
                const check = checks.profiles[platform] ?? { ok: true }
                const label = PROFILE_PLATFORM_LABEL[platform]
                const opens = check.ok && url.trim().length > 0
                const removable = !isCoreProfile(platform)
                return (
                  <TextInput
                    key={platform}
                    label={label}
                    layout="gutter"
                    mono
                    value={url}
                    onChange={(next) => setProfile(platform, next)}
                    placeholder={PROFILE_PLACEHOLDER[platform]}
                    maxLength={MAX_LINK_URL}
                    disabled={colophon.saving}
                    invalid={!check.ok}
                    hint={check.reason ?? profileHint(platform, opens)}
                    aside={
                      opens || removable ? (
                        <span className={styles.actions}>
                          {opens ? (
                            <button
                              type="button"
                              className={styles.action}
                              disabled={colophon.saving}
                              onClick={() => shell.openExternal(url.trim())}
                            >
                              Open
                            </button>
                          ) : null}
                          {removable ? (
                            <button
                              type="button"
                              className={styles.action}
                              disabled={colophon.saving}
                              aria-label={`Remove ${label}`}
                              onClick={() => removeProfile(platform)}
                            >
                              Remove
                            </button>
                          ) : null}
                        </span>
                      ) : undefined
                    }
                  />
                )
              })}

              <TextInput
                label="Add a platform"
                layout="gutter"
                mono
                value={adding}
                onChange={setAdding}
                onEnter={add}
                placeholder="https://"
                maxLength={MAX_LINK_URL}
                disabled={colophon.saving}
                invalid={adding.trim().length > 0 && !addition?.check.ok}
                hint={additionHint()}
                className={styles.add}
                aside={
                  addition?.check.ok ? (
                    <button
                      type="button"
                      className={styles.action}
                      disabled={colophon.saving}
                      onClick={add}
                    >
                      Add
                    </button>
                  ) : undefined
                }
              />
            </div>
          </Panel>
        </motion.div>
      )}
    </div>
  )
}

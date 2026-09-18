import { useMemo, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { getSection } from '@shared/domain/navigation'
import type { ArtistDraft, ArtistPatch, ArtistRole, ArtistSummary } from '@shared/domain/artists'
import { ARTIST_ROLES, ARTIST_ROLE_LABEL, artistNameKey } from '@shared/domain/artists.constants'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Plate } from '@renderer/components/primitives/Plate'
import { initialsOf } from '@renderer/lib/initials'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { Skeleton } from '@renderer/components/primitives/Skeleton'
import { gridVariants } from '@renderer/motion/transitions'
import { useArtistMutations, useArtists } from '@renderer/hooks/useArtists'
import { useSystemStore, selectArchive } from '@renderer/app/store/system.store'
import { ArtistDialog } from './components/ArtistDialog'
import { ArtistSheet } from './components/ArtistSheet'
import styles from './ArtistsPage.module.scss'

/**
 * ARTISTS — the roster.
 *
 * Who the practice works with, and what they are on. A flat register rather
 * than a tree: there is no hierarchy among people, and inventing one would be
 * the same mistake the ARCHIVE's filing tree deliberately avoids by keeping
 * tags flat.
 *
 * Deliberately **not** the ARCHIVE's `artist` folder kind. That is a shelf —
 * where a project's files sit on disk. This is who made the work, and a track
 * can credit four people while sitting in one folder. See docs/DISCOGRAPHY.md,
 * decision D3.
 *
 * No focal panel. The roster is a directory read evenly, and giving one
 * person the crimson treatment would claim the page's single focal object for
 * whoever happened to be listed first — the same call `OverlayCard` makes.
 */
export function ArtistsPage(): ReactNode {
  const section = getSection('artists')
  const archive = useSystemStore(selectArchive)
  const ready = archive.state === 'online'

  const { data, isLoading } = useArtists(ready)
  const mutations = useArtistMutations()

  const [search, setSearch] = useState('')
  const [favouritesOnly, setFavouritesOnly] = useState(false)
  const [roleFilter, setRoleFilter] = useState<ArtistRole[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const roster = useMemo(() => data ?? [], [data])

  const shown = useMemo(() => {
    const needle = artistNameKey(search)
    return roster.filter((artist) => {
      if (favouritesOnly && !artist.favourite) return false
      /*
       * Roles match with OR, unlike the ARCHIVE's tags which match with AND.
       *
       * The two look alike and are asked differently. Tags narrow one shelf —
       * adding `Deep` to `140` means "both", and more results would be the
       * opposite of what adding it looks like it should do. Roles are a
       * *category* of person: picking VOCALIST and then WRITER means "show me
       * either", because almost nobody is both and AND would empty the page.
       */
      if (roleFilter.length > 0 && !roleFilter.some((role) => artist.roles.includes(role))) {
        return false
      }
      if (!needle) return true
      // Real name is searched too: an operator who knows somebody by their
      // legal name should find them without remembering the alias.
      return artist.nameKey.includes(needle) || artistNameKey(artist.realName).includes(needle)
    })
  }, [roster, search, favouritesOnly, roleFilter])

  const filtered = favouritesOnly || roleFilter.length > 0 || search.trim().length > 0

  const clearFilters = (): void => {
    setSearch('')
    setFavouritesOnly(false)
    setRoleFilter([])
  }

  const open = openId ? (roster.find((artist) => artist.id === openId) ?? null) : null

  const report = (cause: unknown): void => {
    const failure = cause as Error & { hint?: string | null }
    setNotice(failure.hint ? `${failure.message} ${failure.hint}` : failure.message)
  }

  const add = (draft: ArtistDraft): void => {
    setNotice(null)

    mutations.create.mutate(draft, {
      onSuccess: (created) => {
        setAdding(false)
        /*
         * Straight into the sheet.
         *
         * The dialog takes everything that can be set before the record
         * exists; the picture cannot, because storing one keys the file by
         * the artist's id. Handing over means the one field the dialog had
         * to leave out is the first thing in front of the operator.
         */
        setOpenId(created.id)
      },
      onError: report
    })
  }

  const patch = (id: string, value: ArtistPatch): void => {
    setNotice(null)
    mutations.update.mutate({ id, patch: value }, { onError: report })
  }

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        guideId="artists"
        actions={
          <div className={styles.headerActions}>
            <StatusDot
              tone={roster.length > 0 ? 'online' : 'offline'}
              label={`${roster.length} on the roster`}
            />
          </div>
        }
      />

      {notice ? (
        <div className={styles.notice} role="alert">
          <span>{notice}</span>
          <button type="button" className={styles.dismiss} onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {!ready ? (
        <Panel label="Roster" index="01">
          <p className={styles.hint}>
            The archive is not connected, so the roster cannot be read. NEXUS reports why.
          </p>
        </Panel>
      ) : (
        <>
          {/*
            Two rows, split by what they are for.
            The first is what you *do* on this page; the second is what you
            are looking at. They were one row, which put a text field that
            creates a record beside three that filter one — and the eye had
            no way to tell the difference.
          */}
          <div className={styles.bar}>
            <div className={styles.barRow}>
              <div className={styles.searchWrap}>
                <input
                  className={styles.search}
                  value={search}
                  aria-label="Search the roster"
                  placeholder="Search by name or real name"
                  onChange={(event) => setSearch(event.target.value)}
                />
                {search ? (
                  <button
                    type="button"
                    className={styles.clearSearch}
                    aria-label="Clear the search"
                    onClick={() => setSearch('')}
                  >
                    ✕
                  </button>
                ) : null}
              </div>

              <span className={styles.spacer} />

              <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
                Add an artist
              </Button>
            </div>

            <div className={styles.barRow}>
              <span className={styles.filterLabel}>Filter</span>

              <button
                type="button"
                className={styles.filterChip}
                data-on={favouritesOnly || undefined}
                aria-pressed={favouritesOnly}
                onClick={() => setFavouritesOnly((current) => !current)}
              >
                ◆ Favourites
              </button>

              <span className={styles.filterDivider} aria-hidden="true" />

              {ARTIST_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  className={styles.filterChip}
                  data-on={roleFilter.includes(role) || undefined}
                  aria-pressed={roleFilter.includes(role)}
                  onClick={() =>
                    setRoleFilter((current) =>
                      current.includes(role)
                        ? current.filter((entry) => entry !== role)
                        : [...current, role]
                    )
                  }
                >
                  {ARTIST_ROLE_LABEL[role]}
                </button>
              ))}

              <span className={styles.spacer} />

              {/*
                The count, and a way out. Both appear only when filtering: a
                readout saying "40 of 40" on an unfiltered page is noise, and
                a Clear button with nothing to clear is a dead control.
              */}
              {filtered ? (
                <>
                  <span className={styles.count}>
                    {shown.length} of {roster.length}
                  </span>
                  <Button size="sm" variant="ghost" onClick={clearFilters}>
                    Clear
                  </Button>
                </>
              ) : (
                <span className={styles.count}>
                  {roster.length} {roster.length === 1 ? 'artist' : 'artists'}
                </span>
              )}
            </div>
          </div>

          <motion.div
            className={styles.grid}
            variants={gridVariants}
            initial="initial"
            animate="animate"
          >
            {isLoading ? (
              <>
                <Skeleton height="148px" className={styles.span2} />
                <Skeleton height="148px" className={styles.span2} />
                <Skeleton height="148px" className={styles.span2} />
              </>
            ) : shown.length === 0 ? (
              <Panel label="Roster" index="01" className={styles.span6}>
                <p className={styles.hint}>
                  {roster.length === 0
                    ? 'Nobody on the roster yet. Add the people you work with and they can be credited on projects in the ARCHIVE and on releases in the DISCOGRAPHY.'
                    : 'Nobody matches that.'}
                </p>
              </Panel>
            ) : (
              shown.map((artist, index) => (
                <ArtistCard
                  key={artist.id}
                  artist={artist}
                  index={index}
                  onOpen={() => setOpenId(artist.id)}
                  onToggleFavourite={() => patch(artist.id, { favourite: !artist.favourite })}
                />
              ))
            )}
          </motion.div>
        </>
      )}

      {adding ? (
        <ArtistDialog
          busy={mutations.create.isPending}
          error={notice}
          onSubmit={add}
          onCancel={() => {
            setAdding(false)
            setNotice(null)
          }}
        />
      ) : null}

      <AnimatePresence>
        {open ? (
          <ArtistSheet
            key={open.id}
            artist={open}
            busy={mutations.update.isPending || mutations.setPicture.isPending}
            error={notice}
            onPatch={(value) => patch(open.id, value)}
            onSetPicture={(sourcePath) => {
              setNotice(null)
              mutations.setPicture.mutate({ id: open.id, sourcePath }, { onError: report })
            }}
            onRemove={() => {
              setNotice(null)
              mutations.remove.mutate(open.id, {
                onSuccess: () => setOpenId(null),
                onError: report
              })
            }}
            onClose={() => setOpenId(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}

interface ArtistCardProps {
  artist: ArtistSummary
  index: number
  onOpen: () => void
  onToggleFavourite: () => void
}

/**
 * One entry on the roster.
 *
 * The plate leads, because a face is how somebody is recognised and the whole
 * point of a picture field is that the register becomes scannable. The counts
 * beneath it are what makes this a register rather than an address book —
 * "who have I actually worked with" is the question it answers.
 */
function ArtistCard({ artist, index, onOpen, onToggleFavourite }: ArtistCardProps): ReactNode {
  const counts = [
    artist.projectCount > 0
      ? `${artist.projectCount} project${artist.projectCount === 1 ? '' : 's'}`
      : null,
    artist.releaseCount > 0
      ? `${artist.releaseCount} release${artist.releaseCount === 1 ? '' : 's'}`
      : null
  ].filter(Boolean)

  return (
    <Panel
      label={artist.name}
      index={String(index + 1).padStart(2, '0')}
      className={styles.span2}
      aside={
        <button
          type="button"
          className={styles.favourite}
          data-on={artist.favourite || undefined}
          aria-pressed={artist.favourite}
          aria-label={artist.favourite ? 'Remove favourite' : 'Favourite'}
          onClick={onToggleFavourite}
        >
          ◆
        </button>
      }
    >
      <button type="button" className={styles.card} onClick={onOpen}>
        <Plate
          path={artist.picture.copiedPath}
          fallback={initialsOf(artist.name)}
          size={72}
          alt=""
        />

        <div className={styles.cardBody}>
          {artist.realName ? <span className={styles.realName}>{artist.realName}</span> : null}

          {artist.roles.length > 0 ? (
            <span className={styles.roles}>
              {artist.roles.map((role) => ARTIST_ROLE_LABEL[role]).join(' · ')}
            </span>
          ) : null}

          <span className={styles.counts}>
            {counts.length > 0 ? counts.join(' · ') : 'Not credited yet'}
          </span>

          {artist.links.length > 0 ? (
            <span className={styles.linkCount}>
              {artist.links.length} link{artist.links.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>

        {/* The operator's own record leads the roster and says so. */}
        {artist.isOperator ? <span className={styles.self}>THIS IS ME</span> : null}
      </button>
    </Panel>
  )
}

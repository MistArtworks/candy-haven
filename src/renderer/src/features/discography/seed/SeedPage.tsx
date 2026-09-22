import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import type {
  SeedChoice,
  SeedCredentials,
  SeedDecision,
  SeedEnvImport,
  SeedRecord
} from '@shared/domain/seed'
import { SEED_CHOICES, SEED_CHOICE_LABEL, SEED_PHASE_LABEL } from '@shared/domain/seed'
import {
  DISTRIBUTION_PLATFORM_LABEL,
  RELEASE_KIND_LABEL,
  formatIsrc
} from '@shared/domain/discography.constants'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Dialog } from '@renderer/components/primitives/Dialog'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { TextArea, TextInput } from '@renderer/components/primitives/Input'
import { gridVariants } from '@renderer/motion/transitions'
import { formatIsoDate } from '@renderer/lib/format'
import { useSeed } from '@renderer/hooks/useSeed'
import { HarvestLog } from './HarvestLog'
import styles from './SeedPage.module.scss'

/**
 * THE SEEDER — temporary. Delete this folder with the feature.
 *
 * Not on the rail, and deliberately hard to arrive at by accident: it is
 * reached from one button on DISCOGRAPHY and nowhere else. See
 * `docs/DISCOGRAPHY_SEEDER.md` §7 for the removal checklist.
 *
 * ## Three screens, one at a time
 *
 * The page is a sequence rather than a dashboard, because the operator does
 * these once and in order:
 *
 *   **Credentials** → **Harvest** → **Review** → **Written**
 *
 * **Harvest** is a modal that narrates itself — see `HarvestLog`. It is
 * the first of two gates rather than a spinner: when the reading finishes
 * it asks to continue, and only then is the proposal revealed.
 *
 * **Review** is the second, and the whole feature. A harvest that wrote straight to the
 * catalogue would be a tool nobody could point at a catalogue that already
 * has records in it. So the plan is drawn in full — every record, every
 * link, every track, and every call the adjudicator was not sure about —
 * and *nothing at all happens* until the operator has read it and pressed
 * the second button.
 *
 * Anything flagged can be overruled, and any record can be ticked off.
 * Either gesture rebuilds the plan from the cached harvest, so what is on
 * screen is always what writing would do.
 */

const EMPTY: SeedCredentials = {
  spotifyClientId: '',
  spotifyClientSecret: '',
  spotifyArtistUrl: '',
  tidalClientId: '',
  tidalClientSecret: '',
  youtubeApiKey: '',
  youtubeChannelUrl: '',
  youtubeTopicChannelUrl: '',
  soundcloudTrackUrls: '',
  jevApiKey: '',
  appleStorefront: 'ca'
}

/** Why a link can be trusted, in four words or fewer. */
const VIA_LABEL: Record<string, string> = {
  upc: 'by UPC',
  isrc: 'by ISRC',
  title: 'by title',
  source: 'the source'
}

const MATCHED_LABEL: Record<string, string> = {
  upc: 'matched on its UPC',
  isrc: 'matched on a shared ISRC',
  url: 'matched on a platform link',
  title: 'matched on title and year',
  none: ''
}

export function SeedPage(): ReactNode {
  const navigate = useNavigate()
  const seed = useSeed()
  const [form, setForm] = useState<SeedCredentials>(EMPTY)
  const [confirming, setConfirming] = useState(false)
  const [undoing, setUndoing] = useState(false)
  /** What the last env file filled in, so the form can account for itself. */
  const [imported, setImported] = useState<SeedEnvImport | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  const set = <K extends keyof SeedCredentials>(key: K, value: SeedCredentials[K]): void =>
    setForm((current) => ({ ...current, [key]: value }))

  /*
   * Load an env file into the form.
   *
   * Replaces the form wholesale rather than merging into it. A half-loaded
   * form — three fields from the file and two left over from a previous
   * paste — is the one state nobody could reason about, and the operator
   * can still edit any field afterwards.
   */
  const loadEnv = async (): Promise<void> => {
    setImportError('')
    setImporting(true)
    try {
      const result = await window.candy.seed.loadEnv()
      if (!result) return
      setForm(result.credentials)
      setImported(result)
    } catch (caught) {
      setImportError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setImporting(false)
    }
  }

  const { plan, outcome, journal, undone, log, showLog, progress, working } = seed

  /** Spotify is the spine; without it there is nothing to match against. */
  const canRun =
    form.spotifyClientId.trim() !== '' &&
    form.spotifyClientSecret.trim() !== '' &&
    form.spotifyArtistUrl.trim() !== ''

  const flagged = useMemo(
    () => plan?.decisions.filter((decision) => decision.flagged) ?? [],
    [plan]
  )
  const settled = useMemo(
    () => plan?.decisions.filter((decision) => !decision.flagged) ?? [],
    [plan]
  )

  const running =
    working || !['idle', 'review', 'done', 'failed'].includes(progress.phase)

  return (
    <motion.div className={styles.page} variants={gridVariants} initial="hidden" animate="visible">
      <PageHeader
        index={0}
        label="THE SEEDER"
        purpose="Fill the catalogue from the platforms the music is already on."
        kind="TEMPORARY"
        epigraph="Run once. Nothing is written until you have read the proposal and said so."
        actions={
          <div className={styles.headerActions}>
            <StatusDot
              tone={progress.phase === 'failed' ? 'error' : running ? 'pending' : 'online'}
              label={SEED_PHASE_LABEL[progress.phase]}
              pulse={running}
            />
            <Button variant="ghost" size="sm" onClick={() => navigate('/discography')}>
              Back to the catalogue
            </Button>
          </div>
        }
      />

      {seed.error ? (
        <div className={styles.alarm} role="alert">
          {seed.error}
        </div>
      ) : null}

      {/*
        THE UNDO — the last run, still on record.
        Drawn first because it describes something that has *already*
        happened to the catalogue, which outranks anything being proposed.
      */}
      {journal ? (
        <Panel
          label="THE LAST RUN CAN BE TAKEN BACK"
          index="00"
          aside={
            <span className={styles.aside}>
              {journal.writtenAt ? journal.writtenAt.slice(0, 16).replace('T', ' ') : 'on record'}
            </span>
          }
        >
          <p className={styles.blurb}>
            {journal.releases.filter((entry) => entry.created).length} records were raised,{' '}
            {journal.releases.filter((entry) => !entry.created).length} were added to, and{' '}
            {journal.artistIds.length} artists joined the roster. Undo reverses{' '}
            <strong>exactly that</strong> — anything you have changed since is left alone, and a
            record that was already in the catalogue keeps everything except what this run put on
            it.
          </p>
          {journal.artistNames.length > 0 ? (
            <p className={styles.recordNote}>
              Leaving the roster: {journal.artistNames.join(', ')}.
            </p>
          ) : null}
          <div className={styles.commitRow}>
            <Button variant="danger" onClick={() => setUndoing(true)} disabled={running}>
              Undo the last run
            </Button>
            <Button variant="ghost" onClick={() => void seed.accept()} disabled={running}>
              Keep it — stop offering
            </Button>
          </div>
        </Panel>
      ) : null}

      {undone ? (
        <Panel label="TAKEN BACK" index="00">
          <div className={styles.tally}>
            <Figure value={undone.releasesRemoved} caption="records removed" />
            <Figure value={undone.releasesReverted} caption="records reverted" />
            <Figure value={undone.tracksRemoved} caption="tracks removed" />
            <Figure value={undone.linksRemoved} caption="links removed" />
            <Figure value={undone.artistsRemoved} caption="artists removed" />
          </div>
          {undone.failures.length > 0 ? (
            <ul className={styles.warnings}>
              {undone.failures.map((failure) => (
                <li key={failure.title}>
                  <strong>{failure.title}</strong> — {failure.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      ) : null}

      {/* ------------------------------------------------------ 1 · credentials */}
      {!plan || showLog ? (
        <Panel
          label="CREDENTIALS"
          index="01"
          aside={<span className={styles.aside}>held for this run only</span>}
        >
          <p className={styles.blurb}>
            These are read once, kept in memory while the harvest runs, and forgotten when the
            window closes. They are never saved to settings and never written to disk.
          </p>

          <div className={styles.importRow}>
            <Button variant="ghost" onClick={() => void loadEnv()} busy={importing} disabled={running}>
              Load from a file
            </Button>
            <p className={styles.importNote}>
              {imported ? (
                <>
                  <strong>{imported.fileName}</strong> filled {imported.filled.length}{' '}
                  {imported.filled.length === 1 ? 'field' : 'fields'}
                  {imported.soundcloudCount > 0
                    ? ` and ${imported.soundcloudCount} SoundCloud links from ${imported.soundcloudFrom}`
                    : ''}
                  .
                  {imported.ignored.length > 0
                    ? ` Ignored ${imported.ignored.length}: ${imported.ignored.join(', ')}.`
                    : ''}
                  {imported.soundcloudCount === 0 && imported.soundcloudFrom
                    ? ` No SoundCloud links — ${imported.soundcloudFrom}.`
                    : ''}
                </>
              ) : (
                'Takes a .env file and fills everything below, including the SoundCloud links it points at.'
              )}
            </p>
          </div>

          {importError ? (
            <p className={styles.importError} role="alert">
              {importError}
            </p>
          ) : null}

          <div className={styles.formGrid}>
            <div className={styles.group}>
              <h3 className={styles.groupLabel}>SPOTIFY — required</h3>
              <p className={styles.groupNote}>
                The spine. It is the only source carrying an ISRC per recording and a UPC per
                record, which is what every other platform is matched against.
              </p>
              <TextInput
                label="Client id"
                value={form.spotifyClientId}
                onChange={(value) => set('spotifyClientId', value)}
                mono
              />
              <TextInput
                label="Client secret"
                value={form.spotifyClientSecret}
                onChange={(value) => set('spotifyClientSecret', value)}
                password
              />
              <TextInput
                label="Artist link"
                value={form.spotifyArtistUrl}
                onChange={(value) => set('spotifyArtistUrl', value)}
                placeholder="https://open.spotify.com/artist/…"
                hint="Keyed by id, never by name — another act shares the name."
              />
            </div>

            <div className={styles.group}>
              <h3 className={styles.groupLabel}>TIDAL — optional</h3>
              <p className={styles.groupNote}>
                Matched by ISRC, so its links are exact. Left out, no record gets a TIDAL link.
              </p>
              <TextInput
                label="Client id"
                value={form.tidalClientId}
                onChange={(value) => set('tidalClientId', value)}
                mono
              />
              <TextInput
                label="Client secret"
                value={form.tidalClientSecret}
                onChange={(value) => set('tidalClientSecret', value)}
                password
              />
              <TextInput
                label="Apple storefront"
                value={form.appleStorefront}
                onChange={(value) => set('appleStorefront', value)}
                mono
                maxLength={2}
                hint="Two letters. Apple lookups are per storefront."
              />
            </div>

            <div className={styles.group}>
              <h3 className={styles.groupLabel}>YOUTUBE — optional</h3>
              <p className={styles.groupNote}>
                Two different channels. The Topic one is auto-generated and holds one Art Track
                per released recording; the other is the one he posts to.
              </p>
              <TextInput
                label="API key"
                value={form.youtubeApiKey}
                onChange={(value) => set('youtubeApiKey', value)}
                password
              />
              <TextInput
                label="Main channel"
                value={form.youtubeChannelUrl}
                onChange={(value) => set('youtubeChannelUrl', value)}
                placeholder="https://www.youtube.com/@handle"
              />
              <TextInput
                label="Topic channel"
                value={form.youtubeTopicChannelUrl}
                onChange={(value) => set('youtubeTopicChannelUrl', value)}
                placeholder="https://www.youtube.com/channel/UC…"
                hint="Must not be the same channel as above."
              />
            </div>

            <div className={styles.group}>
              <h3 className={styles.groupLabel}>SOUNDCLOUD &amp; JEV — optional</h3>
              <p className={styles.groupNote}>
                SoundCloud has no key for an Artist account, so its tracks are read one link at a
                time. Jev decides the handful of cases a title cannot; without it they all come to
                you instead.
              </p>
              <TextArea
                label="Track links"
                value={form.soundcloudTrackUrls}
                onChange={(value) => set('soundcloudTrackUrls', value)}
                rows={5}
                placeholder={'https://soundcloud.com/…\nhttps://soundcloud.com/…'}
                hint="One per line."
              />
              <TextInput
                label="Jev API key"
                value={form.jevApiKey}
                onChange={(value) => set('jevApiKey', value)}
                password
                hint="A TypeSafe key, beginning apikey_."
              />
            </div>
          </div>

          <div className={styles.runRow}>
            <Button
              variant="primary"
              onClick={() => void seed.run(form)}
              disabled={!canRun || running}
              busy={running}
              className={styles.runButton}
            >
              {running ? 'Harvesting…' : 'Harvest the catalogue'}
            </Button>
            <p className={styles.runNote}>
              Reads six services and proposes what to write. <strong>Writes nothing.</strong>
            </p>
          </div>

        </Panel>
      ) : null}

      {/* ----------------------------------------------------------- 2 · review */}
      {plan && !outcome && !showLog ? (
        <>
          <Panel
            label="WHAT THIS WOULD DO"
            index="02"
            focal
            aside={<span className={styles.aside}>nothing has been written</span>}
          >
            <div className={styles.tally}>
              <Figure value={plan.summary.creating} caption="records raised" />
              <Figure value={plan.summary.updating} caption="records updated" />
              <Figure value={plan.summary.recordings} caption="recordings" />
              <Figure value={plan.summary.links} caption="links added" />
              <Figure value={plan.summary.dropped} caption="uploads dropped" />
              <Figure
                value={plan.summary.flagged}
                caption="need your eye"
                tone={plan.summary.flagged > 0 ? 'warn' : undefined}
              />
            </div>

            <p className={styles.blurb}>
              Harvested from {plan.artist.name || 'the artist'}
              {plan.harvestedAt ? ` on ${plan.harvestedAt.slice(0, 10)}` : ''}. A record already in
              the catalogue is <strong>updated, never replaced</strong> — links are added, missing
              identifiers are filled, and nothing is ever deleted.
            </p>

            {plan.warnings.length > 0 ? (
              <ul className={styles.warnings}>
                {plan.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}

            <div className={styles.commitRow}>
              <Button
                variant="primary"
                onClick={() => setConfirming(true)}
                disabled={running || plan.summary.records === 0}
                className={styles.commitButton}
              >
                {`Write ${plan.summary.records} record${plan.summary.records === 1 ? '' : 's'} to the catalogue`}
              </Button>
              <Button variant="ghost" onClick={() => void seed.reset()} disabled={running}>
                Discard and start again
              </Button>
            </div>
            {plan.summary.flagged > 0 ? (
              <p className={styles.commitWarn}>
                {plan.summary.flagged} call{plan.summary.flagged === 1 ? '' : 's'} below{' '}
                {plan.summary.flagged === 1 ? 'is' : 'are'} unresolved. You can write anyway — the
                proposal shown is what will happen.
              </p>
            ) : null}
          </Panel>

          {flagged.length > 0 ? (
            <Panel
              label="DECIDE THESE"
              index="03"
              aside={<span className={styles.aside}>{flagged.length} uncertain</span>}
            >
              <p className={styles.blurb}>
                SoundCloud and YouTube carry no identifier, only a title. These are the ones the
                adjudicator could not settle — the number is how sure it was.
              </p>
              {flagged.map((decision) => (
                <DecisionRow
                  key={decision.key}
                  decision={decision}
                  disabled={running}
                  onChoose={(choice) => void seed.decide(decision.key, choice)}
                />
              ))}
            </Panel>
          ) : null}

          <Panel
            label="THE PROPOSAL"
            index={flagged.length > 0 ? '04' : '03'}
            aside={
              <span className={styles.aside}>
                {plan.summary.records} on · {plan.summary.excluded} off
              </span>
            }
          >
            <p className={styles.blurb}>
              Untick anything you do not want. Every change rebuilds the whole proposal, so the
              figures above always describe exactly this list.
            </p>
            <div className={styles.records}>
              {plan.records.map((record) => (
                <RecordCard
                  key={record.key}
                  record={record}
                  disabled={running}
                  onToggle={(include) => void seed.include(record.key, include)}
                />
              ))}
            </div>
          </Panel>

          {settled.length > 0 ? (
            <Panel
              label="DECIDED WITHOUT YOU"
              index={flagged.length > 0 ? '05' : '04'}
              aside={<span className={styles.aside}>{settled.length} confident</span>}
            >
              <p className={styles.blurb}>
                Resolved at the confident ends of the distribution. Change any of them if the
                adjudicator got it wrong.
              </p>
              {settled.map((decision) => (
                <DecisionRow
                  key={decision.key}
                  decision={decision}
                  disabled={running}
                  quiet
                  onChoose={(choice) => void seed.decide(decision.key, choice)}
                />
              ))}
            </Panel>
          ) : null}
        </>
      ) : null}

      {/* ------------------------------------------------------------ 3 · done */}
      {outcome ? (
        <Panel label="WRITTEN" index="02" focal>
          <div className={styles.tally}>
            <Figure value={outcome.created} caption="records raised" />
            <Figure value={outcome.updated} caption="records updated" />
            <Figure value={outcome.tracksAdded} caption="tracks added" />
            <Figure value={outcome.linksAdded} caption="links added" />
            <Figure value={outcome.artistsCreated} caption="artists added" />
            <Figure value={outcome.artworkStored} caption="sleeves stored" />
            <Figure value={outcome.portraitsStored} caption="portraits stored" />
          </div>

          {outcome.failures.length > 0 ? (
            <>
              <h3 className={styles.groupLabel}>
                {outcome.failures.length} could not be written
              </h3>
              <ul className={styles.warnings}>
                {outcome.failures.map((failure) => (
                  <li key={failure.title}>
                    <strong>{failure.title}</strong> — {failure.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <p className={styles.blurb}>
            The proposal above has been rebuilt against the catalogue as it now stands. Every
            record reads as complete, which is what makes pressing the button again do nothing.
          </p>

          <div className={styles.commitRow}>
            <Button variant="primary" onClick={() => navigate('/discography')}>
              Open the catalogue
            </Button>
            <Button variant="ghost" onClick={() => void seed.reset()}>
              Clear the seeder
            </Button>
          </div>
        </Panel>
      ) : null}

      {showLog ? (
        <HarvestLog
          log={log}
          progress={progress}
          plan={plan}
          running={running}
          error={seed.error}
          onContinue={seed.dismissLog}
          onDiscard={() => {
            seed.dismissLog()
            void seed.reset()
          }}
        />
      ) : null}

      {undoing && journal ? (
        <Dialog
          title="Undo the last seed run?"
          subtitle={`${journal.releases.length} records · ${journal.artistIds.length} artists`}
          confirmLabel="Undo it"
          canConfirm={!running}
          busy={running}
          danger
          footnote="Only what that run wrote comes off. Anything you have done since is untouched."
          onCancel={() => setUndoing(false)}
          onConfirm={() => {
            setUndoing(false)
            void seed.undo()
          }}
        >
          <p className={styles.blurb}>
            The {journal.releases.filter((entry) => entry.created).length} records it raised will
            be deleted. The {journal.releases.filter((entry) => !entry.created).length} it added to
            will keep everything except the rows and identifiers it contributed.
          </p>
        </Dialog>
      ) : null}

      {confirming && plan ? (
        <Dialog
          title="Write this to the catalogue?"
          subtitle={`${plan.summary.creating} raised · ${plan.summary.updating} updated · ${plan.summary.recordings} recordings`}
          confirmLabel="Write it"
          canConfirm={!running}
          busy={running}
          footnote="Records already in the catalogue are added to, never replaced. Nothing is deleted."
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            void seed.apply()
          }}
        >
          <p className={styles.blurb}>
            This is the last stop. Everything on the proposal you just read will be written to
            DISCOGRAPHY, and {plan.summary.excluded > 0 ? `the ${plan.summary.excluded} you ticked off will not be` : 'nothing else will be'}.
          </p>
        </Dialog>
      ) : null}
    </motion.div>
  )
}

// ------------------------------------------------------------------ pieces

function Figure({
  value,
  caption,
  tone
}: {
  value: number
  caption: string
  tone?: 'warn'
}): ReactNode {
  return (
    <div className={`${styles.figure} ${tone === 'warn' && value > 0 ? styles.figureWarn : ''}`}>
      <span className={styles.figureValue}>{String(value).padStart(2, '0')}</span>
      <span className={styles.figureCaption}>{caption}</span>
    </div>
  )
}

function DecisionRow({
  decision,
  disabled,
  quiet = false,
  onChoose
}: {
  decision: SeedDecision
  disabled: boolean
  quiet?: boolean
  onChoose: (choice: SeedChoice) => void
}): ReactNode {
  const current = decision.choice ?? decision.proposal

  return (
    <div className={`${styles.decision} ${quiet ? styles.decisionQuiet : ''}`}>
      <div className={styles.decisionHead}>
        <span className={styles.decisionSource}>{decision.source.toUpperCase()}</span>
        <span className={styles.decisionTitle}>{decision.title}</span>
        <span className={styles.decisionScore}>{decision.probability.toFixed(2)}</span>
      </div>
      <p className={styles.decisionReason}>
        {decision.reason}
        {decision.choice ? ' · you overruled this' : ''}
      </p>
      <div className={styles.choices}>
        {SEED_CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            className={`${styles.choice} ${current === choice ? styles.choiceOn : ''}`}
            disabled={disabled}
            onClick={() => onChoose(choice)}
          >
            {SEED_CHOICE_LABEL[choice]}
            {choice === 'merge' && decision.against ? (
              <span className={styles.choiceAs}>as {decision.against}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}

function RecordCard({
  record,
  disabled,
  onToggle
}: {
  record: SeedRecord
  disabled: boolean
  onToggle: (include: boolean) => void
}): ReactNode {
  const updating = record.match.action === 'update'

  return (
    <article className={`${styles.record} ${record.include ? '' : styles.recordOff}`}>
      <header className={styles.recordHead}>
        <label className={styles.tick}>
          <input
            type="checkbox"
            checked={record.include}
            disabled={disabled}
            onChange={(event) => onToggle(event.target.checked)}
          />
          <span className={styles.tickBox} aria-hidden="true" />
        </label>

        <div className={styles.recordIdentity}>
          <h4 className={styles.recordTitle}>{record.title}</h4>
          <p className={styles.recordMeta}>
            <span className={styles.chip}>{RELEASE_KIND_LABEL[record.kind]}</span>
            {record.origin === 'exclusive' ? (
              <span className={`${styles.chip} ${styles.chipGold}`}>NOT ON THE STORES</span>
            ) : null}
            {record.origin === 'compilation' ? (
              <span className={`${styles.chip} ${styles.chipGold}`}>EXTERNAL — NOT HIS</span>
            ) : null}
            {record.releaseDate ? <span>{formatIsoDate(record.releaseDate)}</span> : null}
            {record.upc ? <span className={styles.mono}>UPC {record.upc}</span> : null}
            {record.label ? <span>{record.label}</span> : null}
          </p>
        </div>

        <span className={`${styles.action} ${updating ? styles.actionUpdate : ''}`}>
          {updating ? 'UPDATE' : 'RAISE'}
        </span>
      </header>

      {updating ? (
        <p className={styles.recordNote}>
          Already in the catalogue as <strong>{record.match.title}</strong>,{' '}
          {MATCHED_LABEL[record.match.matchedOn]}.
        </p>
      ) : null}
      {record.note ? <p className={styles.recordNote}>{record.note}</p> : null}

      <div className={styles.recordBody}>
        <ol className={styles.tracks}>
          {record.tracks.map((track) => (
            <li key={`${track.position}-${track.title}`} className={styles.track}>
              <span className={styles.trackNumber}>{String(track.position).padStart(2, '0')}</span>
              <span className={styles.trackTitle}>{track.title}</span>
              {track.isrc ? (
                <span className={styles.trackIsrc}>{formatIsrc(track.isrc)}</span>
              ) : null}
              {track.present ? <span className={styles.trackHeld}>already held</span> : null}
            </li>
          ))}
        </ol>

        <ul className={styles.links}>
          {record.distribution.map((link) => (
            <li key={link.platform} className={styles.link}>
              <span className={styles.linkPlatform}>
                {DISTRIBUTION_PLATFORM_LABEL[link.platform]}
              </span>
              <span
                className={`${styles.linkVia} ${
                  link.via === 'title' ? styles.linkViaSoft : ''
                }`}
              >
                {VIA_LABEL[link.via]}
              </span>
            </li>
          ))}
          {record.distribution.length === 0 ? (
            <li className={styles.linkNone}>no platform links</li>
          ) : null}
        </ul>
      </div>
    </article>
  )
}

import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ReleaseWindow, ScheduleEntry } from '@shared/domain/transmissions'
import { Button } from '@renderer/components/primitives/Button'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { formatCountdown, formatIsoDate, isOverdue } from '@renderer/lib/format'
import styles from '../TransmissionsPage.module.scss'

/**
 * The next release, and whether its package is owed yet.
 *
 * The view's single focal object. It reports one thing — what is coming and how
 * long there is — because a focal panel that carried five figures would be a
 * summary, and the brief's rule is that a view has one centre.
 *
 * With nothing scheduled it says so rather than showing a zeroed countdown.
 * A fabricated `0 DAYS` reads as an imminent release that does not exist.
 */

export interface NextTransmissionProps {
  release: ScheduleEntry | null
  window: ReleaseWindow | undefined
  leadDays: number
}

export function NextTransmission({
  release,
  window: releaseWindow,
  leadDays
}: NextTransmissionProps): ReactNode {
  const navigate = useNavigate()

  if (!release) {
    return (
      <div className={styles.focalEmpty}>
        <p className={styles.focalEmptyLead}>No transmission scheduled.</p>
        <p className={styles.focalEmptyHint}>
          Set a release date on a project in the ARCHIVE and it will appear here.
        </p>
        <Button size="sm" variant="ghost" onClick={() => navigate('/archive')}>
          Open the register
        </Button>
      </div>
    )
  }

  const submissionDue = releaseWindow ? isOverdue(releaseWindow.submitBy) : false

  return (
    <div className={styles.focal}>
      <p className={styles.focalCountdown}>{formatCountdown(release.date)}</p>
      <p className={styles.focalTitle}>{release.title}</p>
      {release.primaryArtist ? <p className={styles.focalArtist}>{release.primaryArtist}</p> : null}

      <FieldGrid columns={1}>
        <Field label="Release date" value={formatIsoDate(release.date)} mono />
        <Field
          label="Submit by"
          value={releaseWindow ? formatIsoDate(releaseWindow.submitBy) : '—'}
          mono
          hint={`${leadDays} day distributor lead`}
        />
      </FieldGrid>

      <div className={styles.focalStatus}>
        <StatusDot
          tone={submissionDue ? 'error' : 'online'}
          label={submissionDue ? 'Submission window passed' : 'Submission window open'}
        />
      </div>

      {release.projectId ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/archive?project=${release.projectId}`)}
        >
          Open the dossier
        </Button>
      ) : null}
    </div>
  )
}

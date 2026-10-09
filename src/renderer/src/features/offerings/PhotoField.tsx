import type { ReactNode } from 'react'
import type { Offering } from '@shared/domain/offerings'
import { OFFERING_LIMITS, PHOTO_MIN } from '@shared/domain/offerings.constants'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { useOfferingPhoto, type OfferingsActions } from '@renderer/hooks/useOfferings'
import lore from '@renderer/features/lore/Lore.module.scss'
import styles from './Offerings.module.scss'

/**
 * A service's photo: the two shapes the website cuts from it (the card in
 * the list, the banner over the details), what it shows for anyone who
 * can't see it, and picking another. The shapes here are cut from the
 * middle; the website cuts around what draws the eye, so they're close
 * rather than exact.
 */
export function PhotoField({
  offering,
  website,
  alt,
  onAlt,
  actions
}: {
  offering: Offering
  website: string
  alt: string
  onAlt: (alt: string) => void
  actions: OfferingsActions
}): ReactNode {
  const { photo } = offering
  const version = `${photo.source}|${photo.file?.copiedPath ?? ''}|${photo.file?.copiedAt ?? 0}`
  const source = useOfferingPhoto(offering.id, version)
  const sent = photo.sent.some((entry) => entry.website === website)

  const choose = async (): Promise<void> => {
    const path = await window.candy.shell.selectFile({
      title: 'Choose the service’s photo',
      filters: [{ name: 'Photos', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    })
    if (path) await actions.setPhoto({ id: offering.id, path })
  }

  const where =
    photo.source === 'site'
      ? 'The website’s own photo for it. Choose another to replace it.'
      : photo.source === 'file'
        ? sent
          ? 'Picked here, and on the website.'
          : 'Picked here: it goes to the website with the next publish.'
        : `No photo yet. At least ${PHOTO_MIN.width} pixels wide and ${PHOTO_MIN.height} tall.`

  return (
    <div className={styles.photo}>
      <div className={styles.card} aria-hidden="true">
        {source ? <img src={source} alt="" /> : <span className={styles.noPhoto}>Card</span>}
      </div>
      <div className={styles.photoSide}>
        <span className={lore.sectionLabel}>Photo</span>
        <div className={styles.wide} aria-hidden="true">
          {source ? <img src={source} alt="" /> : <span className={styles.noPhoto}>Banner</span>}
        </div>
        <p className={lore.footnote}>{where}</p>
        <div className={lore.actions}>
          <Button size="sm" busy={actions.pending === 'photo'} onClick={() => void choose()}>
            {photo.source === 'none' ? 'Choose a photo' : 'Choose another'}
          </Button>
        </div>
        <TextInput
          label="What it shows"
          value={alt}
          onChange={onAlt}
          maxLength={OFFERING_LIMITS.alt}
          placeholder="Candy at the desk, headphones on"
          hint="Read out for people who can't see it."
        />
      </div>
    </div>
  )
}

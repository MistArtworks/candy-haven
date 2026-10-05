import { useEffect } from 'react'
import {
  SITE_ICON_LENGTH,
  allPins,
  isGroup,
  siteNameOf,
  updatePin,
  type SiteInfo,
  type StripPin
} from '@shared/domain/strip'
import { useSystemStore } from '@renderer/app/store/system.store'
import { savePins } from './useStrip'

/** The side a website's icon is kept at: crisp at twice the size the strip draws it. */
const ICON_SIDE = 48

/** Pins looked up since Haven started, so one that can't be reached isn't asked again and again. */
const asked = new Set<string>()

/**
 * Gives website pins their site's own icon, once. Each one without an icon
 * is looked up (main/app/site.ts), its icon drawn into a small PNG and kept
 * with the pin. A site that has none keeps the link glyph and isn't asked
 * again; one that can't be reached is asked again when Haven next starts. A
 * pin still named after its address takes the name the site gives itself:
 * YouTube, rather than youtube.com.
 *
 * Run by the strip's own window alone, so each pin is looked up once.
 */
export function useSiteIcons(pins: readonly StripPin[], active: boolean): void {
  useEffect(() => {
    if (!active) return
    const due = allPins(pins).filter(
      (pin) => pin.target.kind === 'link' && pin.icon === undefined && !asked.has(pin.id)
    )
    if (!due.length) return
    for (const pin of due) asked.add(pin.id)
    void (async () => {
      for (const pin of due) {
        if (pin.target.kind === 'link') await lookUpAndKeep(pin.id, pin.target.url)
      }
    })()
  }, [pins, active])
}

/**
 * Looks a website pin up now and keeps what's found: for "Look for its icon
 * again". Says whether an icon was found; null when the site couldn't be reached.
 */
export async function lookUpAndKeep(pinId: string, url: string): Promise<boolean | null> {
  const found = await lookUp(url)
  if (!found) return null
  // Read afresh: the pins may have changed while the site was being asked.
  const pins = useSystemStore.getState().settings?.strip.pins
  if (!pins) return null
  await savePins(
    updatePin(pins, pinId, (pin) => {
      if (isGroup(pin) || pin.target.kind !== 'link' || pin.target.url !== url) return pin
      const named =
        found.name && pin.label === siteNameOf(url) ? found.name.slice(0, 80) : pin.label
      return { ...pin, label: named, icon: found.icon }
    })
  )
  return found.icon !== ''
}

/** A site's name, and its icon as a PNG ('' for none); null when it couldn't be reached. */
async function lookUp(url: string): Promise<{ name: string | null; icon: string } | null> {
  try {
    const site = await window.candy.strip.site(url)
    if (!site.reached) return null
    return { name: site.name, icon: site.icon ? ((await toPng(site.icon)) ?? '') : '' }
  } catch {
    return null
  }
}

/**
 * The icon drawn into a small square PNG, whatever it came as (ICO, SVG,
 * PNG, WebP), centred and whole. Null when it can't be drawn, or draws as
 * next to nothing (a transparent pixel some sites send).
 */
async function toPng(icon: NonNullable<SiteInfo['icon']>): Promise<string | null> {
  const image = new Image()
  image.src = `data:${icon.type};base64,${icon.data}`
  try {
    await image.decode()
  } catch {
    return null
  }
  const canvas = document.createElement('canvas')
  canvas.width = ICON_SIDE
  canvas.height = ICON_SIDE
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  const width = image.naturalWidth || ICON_SIDE
  const height = image.naturalHeight || ICON_SIDE
  const fit = Math.min(ICON_SIDE / width, ICON_SIDE / height)
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    (ICON_SIDE - width * fit) / 2,
    (ICON_SIDE - height * fit) / 2,
    width * fit,
    height * fit
  )
  const { data } = context.getImageData(0, 0, ICON_SIDE, ICON_SIDE)
  let seen = 0
  for (let alpha = 3; alpha < data.length; alpha += 4) if (data[alpha] > 24) seen += 1
  if (seen < ICON_SIDE * ICON_SIDE * 0.04) return null
  const png = canvas.toDataURL('image/png')
  return png.length <= SITE_ICON_LENGTH ? png : null
}

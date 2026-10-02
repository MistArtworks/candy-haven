import { app } from 'electron'
import { LIVE_WEBSITE_URL, LOCAL_WEBSITE_URL, websiteOrigin } from '@shared/domain/inbox.constants'
import type { Settings } from '@shared/domain/settings'

/**
 * The website being read, as an origin: REGULATION's address when one is
 * set; otherwise the live site when installed, and the development server
 * on this machine when run from source, so a development copy never writes
 * to the live site's records. CONTACT, SERVICES and LORE all read it here.
 */
export function websiteFor(settings: Settings): string {
  return (
    websiteOrigin(settings.integrations.websiteUrl) ??
    (app.isPackaged ? LIVE_WEBSITE_URL : LOCAL_WEBSITE_URL)
  )
}

/** `https://candy-heist.vercel.app` → `candy-heist.vercel.app`, for messages. */
export function hostOf(origin: string): string {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

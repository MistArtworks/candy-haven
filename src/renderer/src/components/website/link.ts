/** How the website is reached, as each department that works on it holds it. */
export interface WebsiteLink {
  state: 'unconfigured' | 'signed-out' | 'syncing' | 'online' | 'offline'
  message: string
  /** The website, as an origin. */
  website: string
  syncedAt: number | null
}

/** Whether someone's signed in, so the department opens. */
export const isSignedIn = (link: WebsiteLink): boolean =>
  link.state !== 'signed-out' && link.state !== 'unconfigured'

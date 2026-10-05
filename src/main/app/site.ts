import type { SiteInfo } from '@shared/domain/strip'
import { getLogger } from '@main/core/logger'

const logger = getLogger('site')

/** How long the page, and then each icon, may take. */
const TIMEOUT_MS = 6_000
/** Enough of a page to read its head, where its icons are declared. */
const PAGE_BYTES = 512 * 1024
/** Far more than any icon: an answer larger than this isn't one. */
const ICON_BYTES = 512 * 1024
/** Icons tried, best first, before giving up. */
const TRIES = 4
/**
 * Asked as a browser asks: some sites answer anything else with a challenge
 * page instead of themselves.
 */
const AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/134.0.0.0 Safari/537.36'

const NOTHING: SiteInfo = { reached: false, name: null, icon: null }

/**
 * A pinned website's name and icon, asked of the site itself and nothing in
 * between: its page, for the icons its head declares and the name it gives
 * itself, then the best of those icons, else `/favicon.ico`.
 *
 * The icon goes back as it came; the strip draws it into a small PNG it
 * keeps with the pin (renderer/features/strip/siteIcon.ts). Node's own fetch,
 * so none of the console's cookies go with it.
 */
export async function siteInfo(address: string): Promise<SiteInfo> {
  const url = new URL(address)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return NOTHING

  let page: { url: URL; head: string }
  try {
    page = await fetchPage(url)
  } catch (error) {
    logger.info(`${url.host} couldn't be reached for its icon`, error)
    return NOTHING
  }

  const tries = unique([...iconsIn(page.head, page.url), new URL('/favicon.ico', page.url).href])
  let icon: SiteInfo['icon'] = null
  for (const href of tries.slice(0, TRIES)) {
    icon = await fetchIcon(href).catch(() => null)
    if (icon) break
  }
  return { reached: true, name: nameIn(page.head), icon }
}

/** The page's head, read until it ends; empty when the answer isn't a page. */
async function fetchPage(url: URL): Promise<{ url: URL; head: string }> {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  // Where it ended up, after redirects: what the icons' addresses are relative to.
  const landed = new URL(response.url || url.href)
  const type = response.headers.get('content-type') ?? ''
  // Reached, even when it says no: its icon may still be at /favicon.ico.
  if (!response.ok || !type.includes('html') || !response.body) {
    await response.body?.cancel().catch(() => undefined)
    return { url: landed, head: '' }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let read = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    read += value.byteLength
    text += decoder.decode(value, { stream: true })
    const end = text.search(/<\/head\s*>|<body[\s>]/i)
    if (end >= 0 || read >= PAGE_BYTES) {
      await reader.cancel().catch(() => undefined)
      if (end >= 0) text = text.slice(0, end)
      break
    }
  }
  return { url: landed, head: text }
}

/**
 * The icons a page's head declares, best first for the strip: one that
 * scales (an SVG), then one between 48 and 256 pixels, then an app tile
 * (apple-touch-icon), then the small ones. Safari's one-colour mask-icon
 * is left out.
 */
function iconsIn(head: string, base: URL): string[] {
  const found: { href: string; score: number }[] = []
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/)
    const touch = rel.some((one) => one.startsWith('apple-touch-icon'))
    if (!rel.includes('icon') && !touch) continue
    const href = attribute(tag, 'href')
    if (!href) continue
    let resolved: string
    try {
      resolved = new URL(decodeEntities(href.trim()), base).href
    } catch {
      continue
    }
    if (!/^(https?|data):/i.test(resolved)) continue
    found.push({ href: resolved, score: scoreOf(tag, resolved, touch) })
  }
  return found.sort((a, b) => b.score - a.score).map((one) => one.href)
}

function scoreOf(tag: string, href: string, touch: boolean): number {
  const type = (attribute(tag, 'type') ?? '').toLowerCase()
  const sizes = (attribute(tag, 'sizes') ?? '').toLowerCase()
  if (type.includes('svg') || /\.svg([?#]|$)/i.test(href) || sizes === 'any') return 1500
  if (touch) return 900
  const sides = [...sizes.matchAll(/(\d+)x\d+/g)].map((match) => Number(match[1]))
  const side = sides.length ? Math.max(...sides) : 0
  if (side >= 48 && side <= 256) return 1000 + side
  if (side > 256) return 800
  return 100 + (side || 32)
}

/** The name a site gives itself: og:site_name, else application-name. */
function nameIn(head: string): string | null {
  const names = new Map<string, string>()
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attribute(tag, 'property') ?? attribute(tag, 'name') ?? '').toLowerCase()
    if (key !== 'og:site_name' && key !== 'application-name') continue
    const content = decodeEntities(attribute(tag, 'content') ?? '').trim()
    if (content && !names.has(key)) names.set(key, content.slice(0, 60))
  }
  return names.get('og:site_name') ?? names.get('application-name') ?? null
}

async function fetchIcon(href: string): Promise<SiteInfo['icon']> {
  if (href.startsWith('data:')) return fromDataAddress(href)
  const response = await fetch(href, {
    redirect: 'follow',
    headers: { 'user-agent': AGENT, accept: 'image/svg+xml,image/png,image/*;q=0.8,*/*;q=0.5' },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  const type = response.ok ? imageType(response.headers.get('content-type'), href) : null
  if (!type || !response.body) {
    await response.body?.cancel().catch(() => undefined)
    return null
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > ICON_BYTES) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  return size ? { type, data: Buffer.concat(chunks).toString('base64') } : null
}

const EXTENSION_TYPE: Record<string, string> = {
  ico: 'image/x-icon',
  png: 'image/png',
  svg: 'image/svg+xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp'
}

/**
 * An answer's image type: as it says, or by the address's extension when it
 * says something vague (an .ico is often sent as octet-stream). A page sent
 * back instead (a "not found" with a 200) is no icon.
 */
function imageType(contentType: string | null, href: string): string | null {
  const said = (contentType ?? '').split(';')[0].trim().toLowerCase()
  if (said.startsWith('image/')) return said
  if (said.includes('html') || said.includes('json')) return null
  const extension = /\.([a-z]+)(?:[?#]|$)/i.exec(new URL(href).pathname)?.[1]?.toLowerCase()
  return (extension && EXTENSION_TYPE[extension]) || null
}

/** An icon written into the page itself: `data:image/svg+xml,…` or base64. */
function fromDataAddress(href: string): SiteInfo['icon'] {
  const comma = href.indexOf(',')
  if (comma < 0) return null
  const meta = href.slice(5, comma).split(';')
  const type = (meta[0] || '').toLowerCase()
  if (!type.startsWith('image/')) return null
  const body = href.slice(comma + 1)
  let data: string
  try {
    data = meta.includes('base64') ? body : Buffer.from(decodeURIComponent(body)).toString('base64')
  } catch {
    return null
  }
  return data.length && data.length <= (ICON_BYTES * 4) / 3 ? { type, data } : null
}

/** An attribute's value in a tag, quoted or not; null when it has none. */
function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag)
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith('#')) {
      const point = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return point > 0 && point < 0x110000 ? String.fromCodePoint(point) : whole
    }
    return ENTITIES[code.toLowerCase()] ?? whole
  })
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

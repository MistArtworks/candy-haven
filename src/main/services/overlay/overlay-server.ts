import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { is } from '@electron-toolkit/utils'
import type { OverlayServerInfo } from '@shared/domain/rite'
import {
  liveOverlayAddresses,
  overlayDocument,
  resolveOverlayAddress
} from '@shared/domain/overlays'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { getPaths } from '@main/core/paths'
import { TypedEmitter } from '@main/core/emitter'

const logger = getLogger('overlay:server')

/**
 * Local HTTP server for OBS browser sources.
 *
 * ### Why server-sent events rather than a WebSocket
 *
 * The data only ever flows one way. The operator acts through the console, which
 * reaches the main process over IPC; the overlay is a display and never sends
 * anything back. That makes SSE a better fit than a WebSocket on three counts:
 * it needs no dependency beyond `node:http`, `EventSource` reconnects by itself,
 * and an OBS browser source is reloaded and re-shown constantly — every scene
 * switch, every "Refresh cache" — so free reconnection is worth more here than a
 * return channel nobody would use.
 *
 * ### Serving the pages
 *
 * One document per overlay, keyed by the slug in the shared overlay registry:
 * `/selection` serves `overlays/selection.html`. Each is a separate OBS browser
 * source, so they are separate builds rather than one page switching modes, and
 * the registry is the only place the mapping is declared.
 *
 * In a packaged build those documents sit alongside the console in
 * `out/renderer`, served straight off disk. In development that directory is
 * stale or absent because electron-vite serves the renderer from memory, so
 * requests are proxied to the dev server instead. The address the operator
 * pastes into OBS is identical either way, which matters — an overlay URL that
 * changes between dev and production is one they would have to fix in OBS every
 * time.
 *
 * Bound to loopback only. Nothing here is reachable from the network.
 */

/** Where the built overlay documents live, relative to the renderer root. */
const OVERLAY_DIR = 'overlays'

/** How many ports to try past the configured one before giving up. */
const PORT_SCAN_ATTEMPTS = 12

/**
 * Keep-alive comment interval.
 *
 * Chromium will hold an idle event stream open, but an intermediate proxy or a
 * suspended browser source may not. A comment line is not delivered as an event,
 * so this costs the client nothing.
 */
const HEARTBEAT_MS = 15_000

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
}

interface OverlayServerEvents {
  info: OverlayServerInfo
}

export class OverlayServer extends TypedEmitter<OverlayServerEvents> {
  private server: Server | null = null
  private port: number | null = null
  private error: string | null = null
  private readonly clients = new Set<ServerResponse>()
  private heartbeat: NodeJS.Timeout | null = null

  /**
   * Snapshot suppliers, keyed by channel.
   *
   * A browser source that attaches mid-spin — or to a running countdown — must
   * receive the current state immediately rather than waiting for the next
   * change, or it renders an idle overlay until the operator touches something.
   *
   * Keyed by channel because one server feeds every overlay: each page
   * subscribes to the same stream and keeps the frames it recognises.
   */
  private readonly snapshots = new Map<string, () => unknown>()

  /**
   * Extra routes, registered by services that need one.
   *
   * Kept generic so the server has no idea what OAuth is: the Spotify link
   * needs a loopback redirect target and this server is already listening on
   * loopback, which is cheaper and tidier than standing up a second listener
   * for the length of one authorisation.
   */
  private readonly routes = new Map<string, (url: URL, res: ServerResponse) => void>()

  get info(): OverlayServerInfo {
    return {
      running: this.server !== null && this.port !== null,
      url: this.port === null ? null : `http://127.0.0.1:${this.port}/`,
      port: this.port,
      clients: this.clients.size,
      error: this.error
    }
  }

  /** Registers the current-state supplier for a channel. */
  registerSnapshot(channel: string, supplier: () => unknown): void {
    this.snapshots.set(channel, supplier)
  }

  /** Registers a handler for an exact pathname. */
  registerRoute(pathname: string, handler: (url: URL, res: ServerResponse) => void): void {
    this.routes.set(pathname, handler)
  }

  /**
   * Binds the server, scanning upward if the configured port is taken.
   *
   * A busy port must not be fatal — it would take the whole department down
   * over something as ordinary as a leftover process. The actual URL is
   * surfaced in the console, so a shifted port is visible rather than silent.
   */
  async start(preferredPort: number): Promise<OverlayServerInfo> {
    if (this.server) return this.info

    const server = createServer((req, res) => {
      this.handle(req, res).catch((cause) => {
        logger.error('Overlay request failed', cause)
        if (!res.headersSent) res.writeHead(500)
        res.end()
      })
    })

    // Browser sources open and close constantly; a short keep-alive stops
    // sockets accumulating without cutting live event streams.
    server.keepAliveTimeout = 30_000

    for (let attempt = 0; attempt < PORT_SCAN_ATTEMPTS; attempt += 1) {
      const candidate = preferredPort + attempt
      try {
        await this.listen(server, candidate)
        this.server = server
        this.port = candidate
        this.error = null

        if (attempt > 0) {
          logger.warn(`Overlay port ${preferredPort} unavailable; listening on ${candidate}`)
        }
        logger.info(`Overlay server listening on http://127.0.0.1:${candidate}/`)

        this.heartbeat = setInterval(() => this.ping(), HEARTBEAT_MS)
        this.emit('info', this.info)
        return this.info
      } catch (cause) {
        const code = (cause as NodeJS.ErrnoException).code
        if (code !== 'EADDRINUSE' && code !== 'EACCES') {
          this.error = cause instanceof Error ? cause.message : String(cause)
          this.emit('info', this.info)
          throw AppError.from(cause, {
            code: ErrorCode.Unknown,
            hint: 'The overlay server could not start. See the log for details.',
            recoverable: true
          })
        }
      }
    }

    this.error = `No free port in ${preferredPort}–${preferredPort + PORT_SCAN_ATTEMPTS - 1}.`
    this.emit('info', this.info)
    throw new AppError('The overlay server could not claim a port.', {
      code: ErrorCode.ArchivePortUnavailable,
      hint: `Ports ${preferredPort} to ${preferredPort + PORT_SCAN_ATTEMPTS - 1} are all in use. Change the overlay port in REGULATION.`,
      recoverable: true
    })
  }

  private listen(server: Server, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (cause: Error): void => {
        server.removeListener('listening', onListening)
        reject(cause)
      }
      const onListening = (): void => {
        server.removeListener('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, '127.0.0.1')
    })
  }

  /**
   * Pushes a payload to every attached browser source.
   *
   * Frames are tagged with their channel so a page can ignore traffic for
   * overlays it is not rendering — the countdown source should not be doing
   * work every time a petition is filed.
   */
  broadcast(channel: string, payload: unknown): void {
    if (this.clients.size === 0) return
    const frame = `data: ${JSON.stringify({ channel, payload })}

`
    for (const client of this.clients) {
      client.write(frame)
    }
  }

  private ping(): void {
    for (const client of this.clients) {
      client.write(': ping\n\n')
    }
  }

  async stop(): Promise<void> {
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }

    for (const client of this.clients) {
      client.end()
    }
    this.clients.clear()

    const server = this.server
    this.server = null
    this.port = null
    if (!server) return

    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      // Event streams hold sockets open indefinitely, so anything still
      // attached has to be destroyed or `close` never fires and quit stalls.
      server.closeAllConnections?.()
    })
    logger.info('Overlay server stopped')
    this.emit('info', this.info)
  }

  // ---------------------------------------------------------------- routing

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' })
      res.end()
      return
    }

    const route = this.routes.get(url.pathname)
    if (route) {
      route(url, res)
      return
    }

    if (url.pathname === '/events') {
      this.attachStream(req, res)
      return
    }

    if (url.pathname === '/state') {
      const body = JSON.stringify(
        Object.fromEntries([...this.snapshots].map(([channel, supplier]) => [channel, supplier()]))
      )
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      })
      res.end(body)
      return
    }

    if (url.pathname === '/') {
      this.serveDirectory(res)
      return
    }

    const assetPath = this.resolveOverlayPath(url.pathname)

    if (assetPath === null) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(
        `No overlay is served at ${url.pathname}.
` +
          `See http://127.0.0.1:${this.port ?? ''}/ for the addresses that are live.
`
      )
      return
    }

    if (is.dev && process.env.ELECTRON_RENDERER_URL) {
      this.proxyToDevServer(assetPath, url.search, req, res)
      return
    }

    await this.serveStatic(assetPath, res)
  }

  /**
   * Maps a request path to a file under the renderer root.
   *
   * A single bare segment that matches a shipped overlay's slug resolves to its
   * document. Anything else with a slash or an extension — hashed assets,
   * nested paths — is passed through untouched.
   *
   * Returns null for a bare segment that is not a live overlay, which the
   * caller turns into a 404. Reserved slugs must not fall through: in
   * development they would reach the dev server's SPA fallback and be answered
   * with the *console's* document, so a browser source pointed at an
   * uncommissioned overlay would silently render the app instead of failing.
   */
  private resolveOverlayPath(pathname: string): string | null {
    const slug = pathname.replace(/^\/+/, '').replace(/\/+$/, '')

    if (!slug.includes('/') && !slug.includes('.')) {
      // Matches an overlay's own slug *or* any of its extra addresses, so
      // `/concord` and `/concord-widget` both resolve to the concord document.
      const resolved = resolveOverlayAddress(slug)
      return resolved?.overlay.implemented
        ? `/${OVERLAY_DIR}/${overlayDocument(resolved.overlay)}.html`
        : null
    }

    return pathname
  }

  /**
   * Root listing of the served overlays.
   *
   * Diagnostic, not a design surface: it exists so that pasting the bare server
   * address into a browser tells the operator which paths are live instead of
   * returning a bare 404. The console is where addresses are actually copied
   * from.
   */
  private serveDirectory(res: ServerResponse): void {
    // Every address, not every overlay: an overlay serving both a full scene
    // and a corner widget has two, and this page exists to be the answer to
    // "what can I point OBS at".
    const rows = liveOverlayAddresses()
      .map(
        (address) =>
          `<li><a href="/${address.slug}">/${address.slug}</a> &mdash; ${address.label} ` +
          `(${address.canvas.width}&times;${address.canvas.height})</li>`
      )
      .join('')

    const body =
      `<!doctype html><meta charset="utf-8"><title>Candy Haven overlays</title>` +
      `<style>body{background:#0c0c0c;color:#ddcfb2;font:13px ui-monospace,monospace;padding:32px}` +
      `a{color:#d2a961}h1{font-size:13px;letter-spacing:.2em;color:#8a8071;font-weight:400}` +
      `ul{list-style:none;padding:0;line-height:2}</style>` +
      `<h1>CANDY HAVEN &middot; OVERLAY SOURCES</h1><ul>${rows}</ul>`

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    })
    res.end(body)
  }

  /**
   * Attaches a browser source to the event stream.
   *
   * The current state goes out immediately on connect, before any change, so a
   * source that is re-shown mid-rite renders the correct frame straight away.
   */
  private attachStream(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      // Disables response buffering in anything sitting in front of us; without
      // it a proxy can hold events until its buffer fills, which for a stream
      // this quiet means indefinitely.
      'X-Accel-Buffering': 'no'
    })
    res.write('retry: 2000\n\n')

    // One frame per channel, so a page attaching mid-anything is current
    // before it paints.
    for (const [channel, supplier] of this.snapshots) {
      res.write(`data: ${JSON.stringify({ channel, payload: supplier() })}

`)
    }

    this.clients.add(res)
    this.emit('info', this.info)
    logger.info(`Overlay client attached (${this.clients.size} total)`)

    const detach = (): void => {
      if (!this.clients.delete(res)) return
      this.emit('info', this.info)
      logger.info(`Overlay client detached (${this.clients.size} remaining)`)
    }

    req.on('close', detach)
    req.on('error', detach)
  }

  /**
   * Development passthrough to the Vite dev server.
   *
   * Only HTTP is proxied. Vite's injected HMR client dials the dev server
   * directly on its own absolute URL, so hot reload keeps working through this
   * without the proxy needing to understand WebSocket upgrades.
   */
  private proxyToDevServer(
    path: string,
    search: string,
    req: IncomingMessage,
    res: ServerResponse
  ): void {
    const target = new URL(process.env.ELECTRON_RENDERER_URL as string)

    const upstream = httpRequest(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        method: req.method,
        path: `${path}${search}`,
        headers: { ...req.headers, host: target.host }
      },
      (proxied) => {
        res.writeHead(proxied.statusCode ?? 502, proxied.headers)
        proxied.pipe(res)
      }
    )

    upstream.on('error', (cause) => {
      logger.warn(`Overlay dev proxy failed for ${path}`, cause)
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Overlay dev server unreachable.')
    })

    req.pipe(upstream)
  }

  private async serveStatic(assetPath: string, res: ServerResponse): Promise<void> {
    const root = getPaths().overlayRoot
    const resolved = this.safeResolve(root, assetPath)

    if (!resolved) {
      res.writeHead(403)
      res.end()
      return
    }

    try {
      const info = await stat(resolved)
      if (!info.isFile()) throw new Error('Not a file')

      res.writeHead(200, {
        'Content-Type': MIME[extname(resolved).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': info.size,
        // The console ships its overlay assets with hashed filenames, but the
        // entry document must never be cached or a rebuilt overlay would keep
        // serving the previous bundle to OBS.
        'Cache-Control': assetPath.endsWith('.html') ? 'no-store' : 'public, max-age=3600'
      })
      createReadStream(resolved).pipe(res)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found. Build the app before serving overlays from a packaged build.')
    }
  }

  /**
   * Confines a request path to the overlay root.
   *
   * The same discipline as the archive's zip extraction: normalise first, then
   * require the result to still sit under the root, so `..` segments and
   * absolute paths cannot escape.
   */
  private safeResolve(root: string, assetPath: string): string | null {
    const decoded = decodeURIComponent(assetPath).replace(/^\/+/, '')
    if (decoded.length === 0) return null

    const candidate = normalize(join(root, decoded))
    const bounded = root.endsWith(sep) ? root : `${root}${sep}`
    return candidate.startsWith(bounded) ? candidate : null
  }
}

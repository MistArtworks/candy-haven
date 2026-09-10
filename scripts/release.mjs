#!/usr/bin/env node
/**
 * Cuts a release: tag, draft, build, upload. One step, ending in a draft the
 * operator publishes by hand.
 *
 * ## Why it does not use `electron-builder --publish`
 *
 * That flag runs the GitHub publisher once per artifact, concurrently. Both
 * invocations ask "does the release exist", both are told no, and both create
 * one — so the assets land split across two releases that then have to be
 * merged by hand. Reproduced twice, on v0.2.0 and v1.0.0.
 *
 * Creating the release *first* and uploading into it is what avoids that, and
 * is why this script exists rather than a flag.
 *
 * ## Why the draft is not published
 *
 * Clients have `autoDownload` on and take a new version unattended the moment
 * one goes live. Publishing is the review gate, and it stays a human act.
 *
 * ## Usage
 *
 *   npm run release                     bump package.json first, then this
 *   npm run release -- --skip-build     re-upload from an existing release/
 *   npm run release -- --dry-run        say what it would do, touch nothing
 *
 * The token lives at `~/.ch-release-token`, or in `GH_TOKEN`. It is never
 * printed, and it is the one thing here that must not end up in a log.
 */

import { spawnSync } from 'node:child_process'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OWNER = 'MistArtworks'
const REPO = 'candy-haven'
const API = `https://api.github.com/repos/${OWNER}/${REPO}`
const UPLOADS = `https://uploads.github.com/repos/${OWNER}/${REPO}`

const argv = process.argv.slice(2)
const skipBuild = argv.includes('--skip-build')
const dryRun = argv.includes('--dry-run')

const say = (message) => console.log(`  ${message}`)
const step = (message) => console.log(`\n▸ ${message}`)

/**
 * Stops, with a reason.
 *
 * Thrown rather than `process.exit`. Exiting while a `fetch` is still in flight
 * tears the event loop down underneath libuv, which prints an assertion failure
 * on top of the message that actually mattered.
 */
class ReleaseError extends Error {
  constructor(message, hint) {
    super(hint ? `${message}\n  ${hint}` : message)
    this.name = 'ReleaseError'
  }
}

function die(message, hint) {
  throw new ReleaseError(message, hint)
}

/**
 * The executable to spawn for a command.
 *
 * Windows resolves `npx` to `npx.cmd`, which `spawnSync` will not find without
 * either a shell or the extension. The extension is the better half of that
 * trade: `shell: true` with an argument *array* is deprecated in Node, and is
 * also how an unescaped argument becomes a second command.
 */
function executable(command) {
  return process.platform === 'win32' && command === 'npx' ? 'npx.cmd' : command
}

/** Runs a command, inheriting stdio. Dies on a non-zero exit. */
function run(command, args) {
  const result = spawnSync(executable(command), args, { cwd: ROOT, stdio: 'inherit' })
  if (result.error) die(`Could not run ${command}: ${result.error.message}`)
  if (result.status !== 0) die(`\`${command} ${args.join(' ')}\` failed with ${result.status}.`)
}

/** Runs a command and returns its stdout, trimmed. */
function capture(command, args) {
  const result = spawnSync(executable(command), args, { cwd: ROOT, encoding: 'utf8' })
  return (result.stdout ?? '').trim()
}

let TOKEN = ''

function readToken() {
  const fromEnv = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim()
  if (fromEnv) return fromEnv

  const file = join(homedir(), '.ch-release-token')
  if (!existsSync(file)) {
    die(
      'No GitHub token.',
      `Put one at ${file}, or set GH_TOKEN. It needs write access to ${OWNER}/${REPO}.`
    )
  }

  const token = readFileSync(file, 'utf8').trim()
  if (!token) die(`${file} is empty.`)
  return token
}

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `token ${TOKEN}`,
      accept: 'application/vnd.github+json',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })

  const text = await response.text()
  const parsed = text ? JSON.parse(text) : null

  if (!response.ok) {
    die(`GitHub refused ${method} ${path} (${response.status}): ${parsed?.message ?? text}`)
  }

  return parsed
}

/**
 * The tag, created and pushed if it is not there yet.
 *
 * Refuses on a dirty tree. A release built from uncommitted work is one nobody
 * can reproduce, and the tag would point at something that never existed in the
 * history. Untracked files count: one of them may be a build input.
 */
function ensureTag(version) {
  const dirty = capture('git', ['status', '--porcelain'])
  if (dirty) {
    die(
      `The working tree is not clean:\n${dirty}`,
      'Commit, stash or ignore these before releasing.'
    )
  }

  if (capture('git', ['tag', '--list', version]) === version) {
    say(`tag ${version} already exists`)
  } else {
    say(`tagging ${version}`)
    if (!dryRun) run('git', ['tag', '-a', version, '-m', `Candy Haven ${version}`])
  }

  // Pushed unconditionally: the tag may exist locally from an earlier attempt
  // that failed before reaching the remote, and pushing one already there is a
  // no-op rather than an error.
  say(dryRun ? 'would push main and the tag' : 'pushing main and the tag')
  if (!dryRun) {
    run('git', ['push', 'origin', 'HEAD:main'])
    run('git', ['push', 'origin', version])
  }
}

/**
 * The draft, reused if one already exists for this tag.
 *
 * Reuse is the point: a re-run after a failed upload must not leave two
 * releases behind, which is the exact failure this script exists to avoid.
 *
 * Note that a draft's `tag_name` is set but the tag is not *attached* until it
 * is published, so its `html_url` reads `untagged-<hash>` until then. That is
 * GitHub's behaviour and not a fault.
 */
async function ensureDraft(version, notes) {
  const releases = await api('/releases?per_page=100')
  const existing = releases.find((release) => release.tag_name === version)

  if (existing) {
    if (!existing.draft) {
      die(
        `Release ${version} is already published.`,
        'Bump the version, or delete the release on GitHub if it was a mistake.'
      )
    }
    say(`reusing draft ${existing.id}`)
    return existing
  }

  say('creating the draft')
  if (dryRun) return { id: 0, assets: [], html_url: '(dry run)' }

  return api('/releases', {
    method: 'POST',
    body: { tag_name: version, name: version, body: notes, draft: true, prerelease: false }
  })
}

/**
 * Uploads one asset, replacing any of the same name.
 *
 * GitHub rejects a duplicate name outright, so without the delete a re-run
 * would fail on everything it had already managed to send — which matters when
 * one of these is a hundred megabytes over a domestic connection.
 */
async function upload(release, path, contentType) {
  const name = path.split(/[\\/]/).pop()
  const size = statSync(join(ROOT, path)).size

  const clash = (release.assets ?? []).find((asset) => asset.name === name)
  if (clash) {
    say(`replacing ${name}`)
    if (!dryRun) await api(`/releases/assets/${clash.id}`, { method: 'DELETE' })
  }

  say(`${dryRun ? 'would upload' : 'uploading'} ${name} (${(size / 1_048_576).toFixed(1)} MB)`)
  if (dryRun) return

  const response = await fetch(
    `${UPLOADS}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: {
        authorization: `token ${TOKEN}`,
        accept: 'application/vnd.github+json',
        'content-type': contentType,
        'content-length': String(size)
      },
      body: createReadStream(join(ROOT, path)),
      // Node streams a request body only when told the protocol permits it.
      duplex: 'half'
    }
  )

  if (!response.ok) die(`Upload of ${name} failed (${response.status}): ${await response.text()}`)
}

async function main() {
  TOKEN = readToken()

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const version = pkg.version

  console.log(`\nCandy Haven ${version}${dryRun ? '  (dry run)' : ''}`)

  /*
   * Notes come from a file rather than being generated.
   *
   * A changelog assembled from commit subjects reads like a changelog assembled
   * from commit subjects. `RELEASE_NOTES.md` is written for whoever is about to
   * be handed the build, and the in-app notice renders it verbatim.
   */
  const notesPath = join(ROOT, 'RELEASE_NOTES.md')
  if (!existsSync(notesPath)) {
    die(
      'RELEASE_NOTES.md is missing.',
      'Write the notes for this version there; the in-app notice renders them verbatim.'
    )
  }

  const notes = readFileSync(notesPath, 'utf8').trim()
  if (!notes) die('RELEASE_NOTES.md is empty.')

  step('Tag')
  ensureTag(version)

  step('Draft')
  const release = await ensureDraft(version, notes)

  step('Build')
  if (skipBuild) say('skipped')
  else if (dryRun) say('would run electron-builder --win')
  else run('npx', ['electron-builder', '--win'])

  step('Assets')
  const installer = `release/CandyHaven-Setup-${version}.exe`
  const assets = [
    [installer, 'application/octet-stream'],
    [`${installer}.blockmap`, 'application/octet-stream'],
    ['release/latest.yml', 'text/yaml']
  ]

  for (const [path] of assets) {
    if (existsSync(join(ROOT, path))) continue
    if (dryRun) {
      say(`${path} is not built yet`)
      continue
    }
    die(
      `${path} is missing.`,
      skipBuild ? 'Run without --skip-build.' : 'The build did not make it.'
    )
  }

  for (const [path, type] of assets) {
    if (existsSync(join(ROOT, path))) await upload(release, path, type)
  }

  console.log(`\n✓ Draft ready — review and publish by hand.\n  ${release.html_url}\n`)
}

try {
  await main()
} catch (cause) {
  console.error(`\n✕ ${cause instanceof ReleaseError ? cause.message : (cause?.stack ?? cause)}\n`)
  process.exitCode = 1
}

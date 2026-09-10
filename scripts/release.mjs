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
 *   npm run release              bump package.json yourself first, then this
 *   npm run release -- --skip-build   re-upload from an existing release/ dir
 *   npm run release -- --dry-run      say what it would do, touch nothing
 *
 * The token lives at `~/.ch-release-token`, or in `GH_TOKEN`. It is never
 * printed, and it is the one thing here that must not end up in a log.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs'
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

function die(message, hint) {
  console.error(`\n✕ ${message}`)
  if (hint) console.error(`  ${hint}`)
  process.exit(1)
}

/** Runs a command, inheriting stdio. Dies on a non-zero exit. */
function run(command, args, { allowFail = false } = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: true })
  if (result.status !== 0 && !allowFail) {
    die(`\`${command} ${args.join(' ')}\` failed with ${result.status}.`)
  }
  return result.status === 0
}

/** Runs a command and returns its stdout, trimmed. */
function capture(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', shell: true })
  return (result.stdout ?? '').trim()
}

// ---------------------------------------------------------------------- token

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

// ------------------------------------------------------------------- requests

async function api(path, { method = 'GET', body, base = API, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `token ${TOKEN}`,
      accept: 'application/vnd.github+json',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  })

  const text = await response.text()
  const parsed = text ? JSON.parse(text) : null

  if (!response.ok) {
    const detail = parsed?.message ?? response.statusText
    die(`GitHub refused ${method} ${path} (${response.status}): ${detail}`)
  }

  return parsed
}

// ---------------------------------------------------------------------- steps

/**
 * The tag, created and pushed if it is not there yet.
 *
 * Refuses on a dirty tree. A release built from uncommitted work is a build
 * nobody can reproduce, and the tag would point at something that never existed
 * in the history.
 */
function ensureTag(version) {
  const dirty = capture('git', ['status', '--porcelain'])
  if (dirty) {
    die(
      'The working tree has uncommitted changes.',
      'Commit or stash them: a release must be reproducible from the tag.'
    )
  }

  const existing = capture('git', ['tag', '--list', version])
  if (existing === version) {
    say(`tag ${version} already exists`)
  } else {
    say(`tagging ${version}`)
    if (!dryRun) run('git', ['tag', '-a', version, '-m', `Candy Haven ${version}`])
  }

  // Pushed unconditionally: the tag may exist locally from an earlier attempt
  // that failed before it reached the remote, and pushing one already there is
  // a no-op rather than an error.
  say('pushing main and the tag')
  if (!dryRun) {
    run('git', ['push', 'origin', 'HEAD:main'])
    run('git', ['push', 'origin', version])
  }
}

/**
 * The draft, reused if one already exists for this tag.
 *
 * Reuse is the point. A re-run after a failed upload must not leave two
 * releases behind, which is the exact failure this script was written to avoid.
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
    body: {
      tag_name: version,
      name: version,
      body: notes,
      draft: true,
      prerelease: false
    }
  })
}

/**
 * Uploads one asset, replacing any of the same name.
 *
 * GitHub rejects a duplicate name outright, so a re-run would fail on every
 * file it had already managed to send. Deleting first makes the script safe to
 * run twice, which — given one of these is a hundred megabytes over a domestic
 * connection — it will be.
 */
async function upload(release, path, contentType) {
  const name = path.split(/[\\/]/).pop()
  const size = statSync(join(ROOT, path)).size

  const clash = (release.assets ?? []).find((asset) => asset.name === name)
  if (clash) {
    say(`replacing ${name}`)
    if (!dryRun) await api(`/releases/assets/${clash.id}`, { method: 'DELETE' })
  }

  say(`uploading ${name} (${(size / 1_048_576).toFixed(1)} MB)`)
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
      // Node streams a request body only when told the protocol allows it.
      duplex: 'half'
    }
  )

  if (!response.ok) {
    die(`Upload of ${name} failed (${response.status}): ${await response.text()}`)
  }
}

// ----------------------------------------------------------------------- main

const TOKEN = readToken()

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
if (skipBuild) {
  say('skipped')
} else {
  run('npx', ['electron-builder', '--win'])
}

step('Assets')
const installer = `release/CandyHaven-Setup-${version}.exe`
for (const path of [installer, `${installer}.blockmap`, 'release/latest.yml']) {
  if (!existsSync(join(ROOT, path))) {
    die(`${path} is missing.`, skipBuild ? 'Run without --skip-build.' : 'The build did not produce it.')
  }
}

await upload(release, installer, 'application/octet-stream')
await upload(release, `${installer}.blockmap`, 'application/octet-stream')
await upload(release, 'release/latest.yml', 'text/yaml')

/*
 * The draft's `html_url` reads `untagged-<hash>` and that is not a fault.
 * GitHub does not attach a draft to its tag until it is published, so the
 * permanent URL does not exist yet. The link below still opens the right page.
 */
console.log(`\n✓ Draft ready — review and publish by hand.\n  ${release.html_url}\n`)

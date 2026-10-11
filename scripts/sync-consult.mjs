#!/usr/bin/env node
/**
 * Copies the consultation engine from the website, so CONSULTATION plays a
 * producer's feedback back through exactly the tools he used on the page.
 *
 * The website (candy-heist, beside this repository) holds the master
 * copies. They import nothing outside themselves except zod, so they drop
 * in here unchanged:
 *
 *   candy-heist/src/lib/consult/engine/*  →  src/shared/consult/engine/
 *   candy-heist/src/lib/consult/audio/*   →  src/shared/consult/audio/
 *
 *   npm run sync:consult            copy them over
 *   npm run sync:consult -- --check report any difference, change nothing
 *
 * Edit the website's copies, never these: the next sync would undo it, and
 * the check exists to say so. The same arrangement as sync-planets.mjs,
 * kept as its own script so either can run without the other.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = resolve(ROOT, process.env.CANDY_HEIST_DIR ?? '../candy-heist')
const CHECK = process.argv.includes('--check')

const FOLDERS = [
  ['src/lib/consult/engine', 'src/shared/consult/engine'],
  ['src/lib/consult/audio', 'src/shared/consult/audio']
]

/** The source files of a folder: code only, never its tests. */
const sources = (dir) =>
  readdirSync(dir).filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name))

const hash = (text) => createHash('sha256').update(text).digest('hex')

if (!existsSync(SITE)) {
  console.error(`✕ No website found at ${SITE}. Set CANDY_HEIST_DIR to where it is.`)
  process.exit(1)
}

const pairs = []
for (const [from, to] of FOLDERS) {
  const source = join(SITE, from)
  for (const name of sources(source)) pairs.push([join(source, name), join(ROOT, to, name)])
  // A file gone from the website goes from here too.
  const target = join(ROOT, to)
  if (existsSync(target))
    for (const name of sources(target))
      if (!existsSync(join(source, name))) pairs.push([null, join(target, name)])
}

let differences = 0
for (const [from, to] of pairs) {
  const shown = relative(ROOT, to)
  const want = from ? readFileSync(from, 'utf8') : null
  const have = existsSync(to) ? readFileSync(to, 'utf8') : null
  if (want !== null && have !== null && hash(want) === hash(have)) continue
  differences += 1
  if (CHECK) {
    console.log(`  differs  ${shown}`)
    continue
  }
  if (want === null) {
    rmSync(to)
    console.log(`  removed  ${shown}`)
  } else {
    mkdirSync(dirname(to), { recursive: true })
    writeFileSync(to, want)
    console.log(`  copied   ${shown}`)
  }
}

if (CHECK && differences) {
  console.error(`✕ ${differences} file(s) differ from the website. Run npm run sync:consult.`)
  process.exit(1)
}
console.log(
  differences
    ? `✓ ${CHECK ? 'Checked' : 'Synced'} ${pairs.length} file(s), ${differences} changed.`
    : `✓ The consultation engine matches the website (${pairs.length} file(s)).`
)

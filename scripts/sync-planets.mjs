#!/usr/bin/env node
/**
 * Copies the planet engine (and the lore's markdown reader) from the
 * website, so LORE's previews draw exactly what the site draws.
 *
 * The website (candy-heist, beside this repository) holds the master
 * copies. They import nothing outside themselves except zod, react and
 * marked, so they drop in here unchanged:
 *
 *   candy-heist/src/lib/planets/engine/*   →  src/shared/planets/engine/
 *   candy-heist/src/lib/planets/react/*    →  src/shared/planets/react/
 *   candy-heist/src/lib/markdown/blocks.ts →  src/renderer/src/lib/markdown/blocks.ts
 *
 *   npm run sync:planets            copy them over
 *   npm run sync:planets -- --check report any difference, change nothing
 *
 * Edit the website's copies, never these: the next sync would undo it, and
 * the check exists to say so.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = resolve(ROOT, process.env.CANDY_HEIST_DIR ?? '../candy-heist')
const CHECK = process.argv.includes('--check')

const FOLDERS = [
  ['src/lib/planets/engine', 'src/shared/planets/engine'],
  ['src/lib/planets/react', 'src/shared/planets/react']
]
const FILES = [['src/lib/markdown/blocks.ts', 'src/renderer/src/lib/markdown/blocks.ts']]

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
for (const [from, to] of FILES) pairs.push([join(SITE, from), join(ROOT, to)])

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
  console.error(`✕ ${differences} file(s) differ from the website. Run npm run sync:planets.`)
  process.exit(1)
}
console.log(
  differences
    ? `✓ ${CHECK ? 'Checked' : 'Synced'} ${pairs.length} file(s), ${differences} changed.`
    : `✓ The planet engine matches the website (${pairs.length} file(s)).`
)

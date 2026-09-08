/**
 * Pinned MongoDB Community release used for the embedded archive.
 *
 * The URL and digest below are taken verbatim from MongoDB's published release
 * manifest (https://downloads.mongodb.org/current.json). The full Windows
 * archive is large because it ships debug symbols; the provisioner extracts
 * only `bin/` (minus .pdb files), which lands at roughly 80 MB on disk.
 *
 * To serve a trimmed, self-hosted archive instead, override the source with the
 * CANDY_HAVEN_MONGO_URL / CANDY_HAVEN_MONGO_SHA256 environment variables, or
 * edit PINNED_RELEASE. Nothing else in the codebase needs to change.
 */
export interface MongoRelease {
  version: string
  url: string
  /** Lowercase hex SHA-256 of the archive; `null` disables digest verification. */
  sha256: string | null
}

const PINNED_RELEASE: MongoRelease = {
  version: '8.0.29',
  url: 'https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.29.zip',
  sha256: '4b1fc74acbd7fbdc3bb9a70dc7f133cf401488196a9d6e6a3ee8471c58eea44b'
}

export function resolveMongoRelease(): MongoRelease {
  const url = process.env.CANDY_HAVEN_MONGO_URL?.trim()
  if (!url) return PINNED_RELEASE

  const sha256 = process.env.CANDY_HAVEN_MONGO_SHA256?.trim().toLowerCase() || null
  return {
    version: process.env.CANDY_HAVEN_MONGO_VERSION?.trim() || 'custom',
    url,
    sha256
  }
}

/**
 * Archive members worth keeping. Debug symbols and the sharding router are
 * discarded — the embedded archive only ever runs a standalone `mongod`.
 */
export function shouldExtractEntry(entryPath: string): boolean {
  const normalized = entryPath.replace(/\\/g, '/').toLowerCase()

  if (normalized.endsWith('/')) return false
  if (normalized.endsWith('.pdb')) return false
  if (normalized.includes('/bin/mongos')) return false

  if (/\/bin\/[^/]+$/.test(normalized)) return true

  // Keep licence and attribution files alongside the binaries.
  return /\/(license[^/]*|third-party-notices[^/]*|mpl-2\.0)$/i.test(normalized)
}

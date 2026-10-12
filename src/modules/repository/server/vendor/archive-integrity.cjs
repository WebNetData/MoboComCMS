// @ts-check
// One read-only local inspector for the Repository application and existing integrity CLI.
const fs = require('node:fs/promises'), { constants } = require('node:fs')
const path = require('node:path'), { createHash } = require('node:crypto')
const ARCHIVE_NAME = /^[0-9a-f-]{36}\.zip$/
const MAX_BYTES = 3 * 1024 * 1024 // Diagnostic I/O ceiling; not a claim that larger legacy files are invalid.
/** @typedef {{directory?:string,limit?:number,afterReleaseId?:number,afterFileId?:string,verifyHashes?:boolean}} Options */
/** @typedef {{state:string,size?:number,sha256?:string,modifiedAt?:string}} FileObservation */
/** @typedef {{releaseId?:number,productId?:number,fileId?:string,reason:string,size?:number,modifiedAt?:string}} ArchiveIssue */

/** @param {string} directory @param {string} fileId @param {boolean} verifyHashes @returns {Promise<FileObservation>} */
async function inspectFile(directory, fileId, verifyHashes) {
  if (!ARCHIVE_NAME.test(fileId)) return { state: 'invalid-file-id' }
  const filename = path.join(directory, fileId)
  let handle
  try {
    const before = await fs.lstat(filename)
    if (!before.isFile() || before.isSymbolicLink()) return { state: 'unsafe-file-type' }
    if (before.size > MAX_BYTES) return { state: 'inspection-size-limit', size: before.size }
    handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
    const opened = await handle.stat()
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs) return { state: 'changed-during-inspection' }
    let digest
    if (verifyHashes) {
      const hash = createHash('sha256')
      for await (const chunk of handle.createReadStream({ autoClose: false, start: 0, end: MAX_BYTES })) hash.update(chunk)
      digest = hash.digest('hex')
    }
    const after = await handle.stat(), current = await fs.lstat(filename)
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || current.dev !== after.dev || current.ino !== after.ino || current.size !== after.size || current.mtimeMs !== after.mtimeMs || current.ctimeMs !== after.ctimeMs || !current.isFile() || current.isSymbolicLink()) return { state: 'changed-during-inspection' }
    return { state: 'regular', size: after.size, modifiedAt: after.mtime.toISOString(), ...(digest ? { sha256: digest } : {}) }
  } catch (error) {
    const code = /** @type {NodeJS.ErrnoException} */ (error).code
    return { state: code === 'ENOENT' ? 'missing' : code === 'ELOOP' ? 'unsafe-file-type' : 'unavailable' }
  } finally { await handle?.close() }
}

/** Stream names; retain at most limit+1 sorted candidates, never follow directory entries. */
/** @param {string} directory @param {string} after @param {number} limit */
async function pageNames(directory, after, limit) {
  /** @type {string[]} */ const selected = []
  let visited = 0, matching = 0, ignored = 0
  const handle = await fs.opendir(directory)
  for await (const entry of handle) {
    visited++
    if (!ARCHIVE_NAME.test(entry.name)) { ignored++; continue }
    if (entry.name <= after) continue
    matching++
    let left = 0, right = selected.length
    while (left < right) { const middle = (left + right) >>> 1; if (selected[middle] < entry.name) left = middle + 1; else right = middle }
    if (left <= limit) { selected.splice(left, 0, entry.name); if (selected.length > limit + 1) selected.pop() }
  }
  return { names: selected.slice(0, limit), capped: matching > limit, visited, ignored }
}

/** @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} db @param {Options} [options] */
async function repositoryArchiveIssues(db, options = {}) {
  const limit = options.limit ?? 250, afterReleaseId = options.afterReleaseId ?? 0, afterFileId = options.afterFileId ?? ''
  if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isSafeInteger(afterReleaseId) || afterReleaseId < 0 || afterReleaseId > 2147483647 || (afterFileId && !ARCHIVE_NAME.test(afterFileId))) throw Error('invalid Repository archive cursor or limit')
  const directory = path.resolve(options.directory || path.join(process.cwd(), 'storage', 'repository'))
  /** @type {{unreferenced:ArchiveIssue[],missing:ArchiveIssue[],unsafe:ArchiveIssue[],mismatch:ArchiveIssue[]}} */ const groups = { unreferenced: [], missing: [], unsafe: [], mismatch: [] }
  const rows = await db.repoRelease.findMany({ where: { id: { gt: afterReleaseId } }, orderBy: { id: 'asc' }, take: limit + 1, select: { id: true, productId: true, fileId: true, size: true, sha256: true } })
  const releases = rows.slice(0, limit), releaseCapped = rows.length > limit
  let directoryState = 'ready', page = { names: /** @type {string[]} */ ([]), capped: false, visited: 0, ignored: 0 }
  try {
    const real = await fs.realpath(directory)
    const same = process.platform === 'win32' ? real.toLowerCase() === directory.toLowerCase() : real === directory
    if (!same || (await fs.lstat(directory)).isSymbolicLink()) directoryState = 'unsafe-directory'
    else page = await pageNames(directory, afterFileId, limit)
  } catch (error) { directoryState = /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT' ? 'missing-directory' : 'unavailable-directory' }
  /** @type {Map<string, FileObservation>} */ const observations = new Map()
  const observe = async (/** @type {string} */ fileId) => {
    if (!observations.has(fileId)) observations.set(fileId, directoryState === 'ready' ? await inspectFile(directory, fileId, options.verifyHashes === true) : { state: directoryState })
    return /** @type {FileObservation} */ (observations.get(fileId))
  }
  for (const release of releases) {
    const file = ARCHIVE_NAME.test(release.fileId) ? await observe(release.fileId) : { state: 'invalid-file-id' }
    const item = { releaseId: release.id, productId: release.productId, ...(ARCHIVE_NAME.test(release.fileId) ? { fileId: release.fileId } : {}), reason: file.state }
    if (file.state === 'missing' || file.state === 'missing-directory') groups.missing.push(item)
    else if (file.state !== 'regular') groups.unsafe.push(item)
    else if (file.size !== release.size || (options.verifyHashes && file.sha256 !== release.sha256)) groups.mismatch.push({ ...item, reason: file.size !== release.size ? 'size-mismatch' : 'hash-mismatch' })
  }
  if (directoryState === 'unsafe-directory' || directoryState === 'unavailable-directory') groups.unsafe.push({ reason: directoryState })
  const referenced = new Set()
  for (let start = 0; start < page.names.length; start += 100) {
    const refs = await db.repoRelease.groupBy({ by: ['fileId'], where: { fileId: { in: page.names.slice(start, start + 100) } } })
    for (const row of refs) referenced.add(row.fileId)
  }
  for (const fileId of page.names) {
    const file = await observe(fileId)
    if (file.state !== 'regular') groups.unsafe.push({ fileId, reason: file.state })
    else if (!referenced.has(fileId)) groups.unreferenced.push({ fileId, size: file.size, modifiedAt: file.modifiedAt, reason: 'no-release-reference' })
  }
  return {
    groups, directoryState, verifyHashes: options.verifyHashes === true, limit,
    afterReleaseId, nextAfterReleaseId: releaseCapped ? releases.at(-1)?.id ?? null : null, releaseCapped, scannedReleases: releases.length,
    afterFileId, nextAfterFileId: page.capped ? page.names.at(-1) ?? null : null, fileCapped: page.capped, scannedFiles: page.names.length,
    continuation: releaseCapped || page.capped ? { afterReleaseId: releases.at(-1)?.id ?? afterReleaseId, afterFileId: page.names.at(-1) ?? afterFileId } : null,
    visitedDirectoryEntries: page.visited, ignoredDirectoryEntries: page.ignored, mutationAllowed: /** @type {false} */ (false),
  }
}
module.exports = { repositoryArchiveIssues }

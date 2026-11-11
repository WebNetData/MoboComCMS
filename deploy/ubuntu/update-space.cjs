#!/usr/bin/env node
'use strict'
// Disk space and retention for the updater's private sibling directories, one owner for the update scripts
// (self-update.sh, update.sh, package-update.sh) and the Server Panel (/admin/updates). Runs as the service user, which
// created these directories; it never needs or takes root.
//
//   node update-space.cjs list    <app> [--lock DIR]                               → JSON: snapshots, sizes, free space
//   node update-space.cjs ensure  <app> [--lock DIR --own-lock] [--min-mb N]      → frees removable snapshots, oldest
//                                                                                    first, only while space is short;
//                                                                                    exit 3 when still short
//   node update-space.cjs prune   <app> [--lock DIR --own-lock] [--current NAME]  → removes what the policy allows
//   node update-space.cjs discard <app> NAME --own-lock                            → removes the caller's own candidate
//                                                                                    that was never adopted
//
// A snapshot is `<parent>/.mobocom-build.XXXXXXXX` (Git updates) or `<parent>/.package.XXXXXXXX` (signed packages).
// Its `before/` holds the build (and, for packages, the code) that ran before that update. Retention policy:
//   • while the update lock exists and the caller does not hold it, nothing is removed (an update or recovery runs);
//   • the caller's own current directory, any directory whose update stopped after adoption ("adopted", or
//     "building" with bytes in before/) and any before/ that holds only part of a build are never removed: an
//     operator decides;
//   • nothing is removed while the installed build itself is incomplete (no .next/BUILD_ID);
//   • per kind, the newest UPDATE_KEEP_SNAPSHOTS (default 1, at least 1) snapshots that can still restore a previous
//     build are kept; every other snapshot, failed candidate and interrupted deletion is removable.

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const SNAPSHOT = /^\.(mobocom-build|package)\.[A-Za-z0-9]{8}$/
const TRASH = /^\.mobocom-trash\.[A-Za-z0-9]{8,}$/
const STATUSES = ['building', 'adopted', 'healthy', 'rolled-back', 'failed']
const MB = 1024 * 1024
const MARGIN = 1024 * MB

class SpaceError extends Error { constructor(message, code = 2) { super(message); this.code = code } }

function isDir(file) { try { const s = fs.lstatSync(file); return s.isDirectory() && !s.isSymbolicLink() } catch { return false } }
function nonEmpty(file) { try { return fs.readFileSync(file, 'utf8').trim().length > 0 } catch { return false } }
function hasEntries(dir) { try { return isDir(dir) && fs.readdirSync(dir).length > 0 } catch { return false } }
function readStatus(dir) {
  try { const s = fs.readFileSync(path.join(dir, 'status'), 'utf8').trim(); return STATUSES.includes(s) ? s : '' } catch { return '' }
}

/** Bytes a tree occupies on disk (du), or the sum of its file sizes where du is missing. Never follows links. */
function diskBytes(target) {
  if (!fs.existsSync(target)) return 0
  try { return Number(execFileSync('du', ['-skx', target], { encoding: 'utf8', timeout: 300_000, stdio: ['ignore', 'pipe', 'ignore'] }).split(/\s/)[0]) * 1024 }
  catch { /* fall back to walking */ }
  let total = 0
  const walk = (file) => {
    let s
    try { s = fs.lstatSync(file) } catch { return }
    total += s.blocks ? s.blocks * 512 : s.size
    if (s.isDirectory()) for (const name of fs.readdirSync(file)) walk(path.join(file, name))
  }
  walk(target)
  return total
}

let freedSoFar = 0
function freeBytes(dir) {
  // Tests only: a fixed free space that grows by what this run removed.
  if (process.env.UPDATE_SPACE_FREE_MB) return Number(process.env.UPDATE_SPACE_FREE_MB) * MB + freedSoFar
  const s = fs.statfsSync(dir)
  return s.bavail * s.bsize
}

/** When the update started: a file each kind writes once, else the directory itself. */
function startedAt(dir, kind) {
  for (const name of kind === 'git' ? ['previous-commit'] : ['release.mbrelease', 'manifest.json']) {
    try { return fs.statSync(path.join(dir, name)).mtimeMs } catch { /* next */ }
  }
  try { return fs.statSync(dir).mtimeMs } catch { return 0 }
}

/** Can this snapshot still put back the build that ran before its update? */
function restorable(dir, kind) {
  if (kind === 'git') return nonEmpty(path.join(dir, 'before', '.next', 'BUILD_ID')) && isDir(path.join(dir, 'before', 'node_modules'))
  return hasEntries(path.join(dir, 'before'))
}

function options(argv) {
  const out = { lock: '', ownLock: false, current: '', minMb: Number(process.env.UPDATE_MIN_FREE_MB || 4096), keep: Number(process.env.UPDATE_KEEP_SNAPSHOTS || 1), sizes: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--lock') out.lock = argv[++i] || ''
    else if (a === '--own-lock') out.ownLock = true
    else if (a === '--current') out.current = argv[++i] || ''
    else if (a === '--min-mb') out.minMb = Number(argv[++i])
    else if (a === '--keep') out.keep = Number(argv[++i])
    else if (a === '--no-sizes') out.sizes = false
    else throw new SpaceError(`unknown option ${JSON.stringify(a)}`)
  }
  if (!Number.isInteger(out.keep) || out.keep < 1 || out.keep > 20) throw new SpaceError('keep must be between 1 and 20')
  if (!Number.isFinite(out.minMb) || out.minMb < 0) throw new SpaceError('min-mb must be a number of MB')
  if (out.current && !SNAPSHOT.test(out.current)) throw new SpaceError('current must name an update directory')
  return out
}

function appDir(value) {
  if (!value) throw new SpaceError('name the application directory')
  const app = fs.realpathSync(value)
  if (!isDir(app)) throw new SpaceError('the application directory does not exist')
  return app
}
const defaultLock = (app) => path.join(process.env.UPDATE_STATE_DIR || path.join(app, 'storage', 'update'), 'lock')

/** Every snapshot next to the app, with what the policy decides about it. */
function inventory(app, opt) {
  const parent = path.dirname(app)
  const locked = fs.existsSync(opt.lock || defaultLock(app)) && !opt.ownLock
  const installed = nonEmpty(path.join(app, '.next', 'BUILD_ID')) || fs.existsSync(path.join(app, '.release.json'))
  const entries = []
  for (const name of fs.readdirSync(parent)) {
    const dir = path.join(parent, name)
    if (!isDir(dir)) continue
    const match = SNAPSHOT.exec(name)
    if (match) {
      const kind = match[1] === 'package' ? 'package' : 'git'
      const status = readStatus(dir)
      entries.push({ name, kind, status: status || 'legacy', startedAt: startedAt(dir, kind), restorable: restorable(dir, kind), beforeUsed: hasEntries(path.join(dir, 'before')), dir })
    } else if (TRASH.test(name)) entries.push({ name, kind: 'trash', status: 'deleting', startedAt: startedAt(dir, 'trash'), restorable: false, beforeUsed: false, dir })
  }
  entries.sort((a, b) => b.startedAt - a.startedAt)
  const kept = { git: 0, package: 0 }
  for (const e of entries) {
    e.protected = ''
    if (locked) e.protected = 'update-running'
    else if (!installed) e.protected = 'installation-incomplete'
    else if (e.name === opt.current) {
      e.protected = 'current-update'
      // The update that just finished holds the newest restorable build: it is the one kept, not an older one.
      if (e.restorable && ['healthy', 'legacy'].includes(e.status)) kept[e.kind]++
    }
    // Stopped after adoption began, or a previous build only partly moved: the only copy of something may be here.
    else if (e.status === 'adopted' || (e.status === 'building' && e.beforeUsed) || (e.beforeUsed && !e.restorable)) e.protected = 'interrupted'
    else if (e.restorable && ['healthy', 'legacy'].includes(e.status) && kept[e.kind] < opt.keep) { kept[e.kind]++; e.protected = 'latest-restorable' }
    e.bytes = opt.sizes ? diskBytes(e.dir) : 0
  }
  return { parent, locked, entries }
}

const publicEntry = ({ dir, beforeUsed, ...e }) => ({ ...e, removable: !e.protected, startedAt: e.startedAt ? new Date(e.startedAt).toISOString() : '' })

/** What a new build needs: source, a fresh node_modules and .next of today's size, npm cache growth and a margin. */
function need(app, minMb) {
  const deps = diskBytes(path.join(app, 'node_modules')), build = diskBytes(path.join(app, '.next'))
  let source = 0
  try {
    const files = execFileSync('git', ['-C', app, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * MB, timeout: 60_000, stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean)
    for (const f of files) { try { source += fs.lstatSync(path.join(app, f)).size } catch { /* deleted */ } }
  } catch { source = 512 * MB } // a package install has no Git index; its payload is already on disk
  const estimate = Math.ceil((deps + build) * 1.15) + source + MARGIN
  return { needBytes: Math.max(estimate, minMb * MB), estimateBytes: estimate, floorBytes: minMb * MB, parts: { dependencies: deps, build, source, margin: MARGIN } }
}

/** Renames into a trash name first, so an interrupted deletion is recognised and finished later. */
function remove(entry, parent) {
  const target = path.join(parent, entry.name)
  if (path.dirname(target) !== parent || !(SNAPSHOT.test(entry.name) || TRASH.test(entry.name)) || !isDir(target)) throw new SpaceError(`refusing to remove ${entry.name}`)
  let doomed = target
  if (!TRASH.test(entry.name)) {
    doomed = path.join(parent, `.mobocom-trash.${entry.name.slice(-8)}${Date.now().toString(36)}`)
    fs.renameSync(target, doomed)
  }
  fs.rmSync(doomed, { recursive: true, force: true, maxRetries: 2 })
  freedSoFar += entry.bytes
  return entry.bytes
}

function prune(app, opt, until) {
  const { parent, entries } = inventory(app, opt)
  const removed = []
  let freed = 0
  // Oldest first, so the most recent history stays the longest.
  for (const e of entries.filter(x => !x.protected).reverse()) {
    if (until && until()) break
    try { freed += remove(e, parent); removed.push({ name: e.name, bytes: e.bytes }) }
    catch (error) { process.stderr.write(`[space] could not remove ${e.name}: ${error.message}\n`) }
  }
  return { removed, freedBytes: freed }
}

function mb(bytes) { return Math.round(bytes / MB) }

function main(argv) {
  const [command, appArg, ...rest] = argv
  if (command === 'discard') {
    const [name, ...more] = rest
    const opt = options(more), app = appDir(appArg), parent = path.dirname(app), dir = path.join(parent, name || '')
    if (!opt.ownLock || !SNAPSHOT.test(name || '') || !isDir(dir)) throw new SpaceError('discard takes the caller\'s own update directory')
    const status = readStatus(dir)
    // Only a candidate that never touched the running site: nothing in before/ means nothing was moved out of the app.
    if (!['building', 'failed'].includes(status) || hasEntries(path.join(dir, 'before'))) throw new SpaceError(`kept ${name}: it holds a previous build (${status || 'unknown'})`, 4)
    remove({ name, bytes: 0 }, parent)
    return { discarded: name }
  }
  const opt = options(rest), app = appDir(appArg)
  if (command === 'list') {
    const { locked, entries } = inventory(app, opt), required = need(app, opt.minMb)
    const list = entries.map(publicEntry)
    return { locked, keep: opt.keep, freeBytes: freeBytes(app), ...required, totalBytes: list.reduce((s, e) => s + e.bytes, 0), removableBytes: list.filter(e => e.removable).reduce((s, e) => s + e.bytes, 0), entries: list }
  }
  if (command === 'prune') {
    const result = prune(app, opt)
    return { ...result, freeBytes: freeBytes(app) }
  }
  if (command === 'ensure') {
    const required = need(app, opt.minMb)
    let free = freeBytes(app), result = { removed: [], freedBytes: 0 }
    if (free < required.needBytes) {
      process.stderr.write(`[space] ${mb(free)} MB free, about ${mb(required.needBytes)} MB needed; removing old update directories the policy allows\n`)
      result = prune(app, opt, () => freeBytes(app) >= required.needBytes)
      free = freeBytes(app)
    }
    const report = { ...required, freeBytes: free, ...result, enough: free >= required.needBytes }
    if (!report.enough) {
      process.stdout.write(JSON.stringify(report) + '\n')
      throw new SpaceError(`only ${mb(free)} MB free; about ${mb(required.needBytes)} MB is needed to build the new version (dependencies ${mb(required.parts.dependencies)} MB, build ${mb(required.parts.build)} MB, source ${mb(required.parts.source)} MB, margin ${mb(MARGIN)} MB). Free space, or remove old update directories in /admin/updates`, 3)
    }
    return report
  }
  throw new SpaceError('usage: update-space.cjs list|ensure|prune|discard <app> [options]')
}

module.exports = { inventory, need, prune, main, SNAPSHOT, TRASH }

if (require.main === module) {
  try { process.stdout.write(JSON.stringify(main(process.argv.slice(2))) + '\n') }
  catch (error) {
    process.stderr.write(`[space] ${error instanceof SpaceError ? error.message : `failed: ${error.message}`}\n`)
    process.exit(error instanceof SpaceError ? error.code : 1)
  }
}

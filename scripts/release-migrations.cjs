// Which migrations belong to which release.
//
//   node scripts/release-migrations.cjs            checks the manifest against prisma/migrations (part of `npm run check`)
//   node scripts/release-migrations.cjs list [v]   prints the migrations of a release, or the unreleased ones
//   node scripts/release-migrations.cjs seal <v>   closes the unreleased migrations as release <v> (the owner, at release)
//
// prisma/release-manifest.json holds two things: `releases`, each with the migrations it shipped and the
// SHA-256 of every migration.sql as it shipped; and `unreleased`, the migrations merged since the last
// release. The check fails when a migration is in neither or in both, when a listed migration is gone,
// when a migration of a shipped release has been edited, or when an unreleased migration sorts before a
// shipped one (it would run out of order on a server that already has the newer ones).
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')

const ROOT = path.resolve(__dirname, '..'), DIR = path.join(ROOT, 'prisma', 'migrations'), MANIFEST = path.join(ROOT, 'prisma', 'release-manifest.json')
const VERSION = /^\d+\.\d+\.\d+$/
const compareVersions = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] }

/** The migration folders with the hash of their SQL (line endings aside, so a checkout on Windows reads the same). */
function readMigrations(dir = DIR) {
  return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().map((name) => {
    const file = path.join(dir, name, 'migration.sql')
    const sql = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null
    return { name, sha256: sql === null ? '' : crypto.createHash('sha256').update(sql).digest('hex') }
  })
}

/** Every way the manifest and the migrations on disk can disagree. Empty when they agree. */
function verify(manifest, migrations) {
  const problems = []
  const releases = manifest && typeof manifest.releases === 'object' && manifest.releases ? manifest.releases : {}
  const unreleased = Array.isArray(manifest?.unreleased) ? manifest.unreleased : []
  const onDisk = new Map(migrations.map((migration) => [migration.name, migration.sha256]))
  const owner = new Map()
  const claim = (name, where) => { if (owner.has(name)) problems.push(`${name} is listed twice: in ${owner.get(name)} and in ${where}`); else owner.set(name, where) }
  const versions = Object.keys(releases)
  for (const version of versions) {
    if (!VERSION.test(version)) problems.push(`"${version}" is not a release version (x.y.z)`)
    for (const entry of releases[version].migrations || []) {
      claim(entry.name, `release ${version}`)
      if (!onDisk.has(entry.name)) problems.push(`${entry.name} of release ${version} is missing from prisma/migrations`)
      else if (onDisk.get(entry.name) !== entry.sha256) problems.push(`${entry.name} of release ${version} was edited after it shipped: write a new migration instead`)
    }
  }
  for (const name of unreleased) { claim(name, 'unreleased'); if (!onDisk.has(name)) problems.push(`${name} is listed as unreleased but is not in prisma/migrations`) }
  for (const migration of migrations) {
    if (!owner.has(migration.name)) problems.push(`${migration.name} belongs to no release: add it to "unreleased" in prisma/release-manifest.json`)
    if (!migration.sha256) problems.push(`${migration.name} has no migration.sql`)
  }
  const shipped = versions.flatMap((version) => (releases[version].migrations || []).map((entry) => entry.name)).sort()
  const lastShipped = shipped[shipped.length - 1]
  for (const name of unreleased) if (lastShipped && name < lastShipped) problems.push(`${name} is unreleased but sorts before ${lastShipped}, which already shipped: it would run out of order`)
  // A later release never holds a migration that sorts before one of an earlier release.
  const ordered = [...versions].filter((version) => VERSION.test(version)).sort(compareVersions)
  let ceiling = ''
  for (const version of ordered) {
    const names = (releases[version].migrations || []).map((entry) => entry.name).sort()
    if (names.length && ceiling && names[0] < ceiling) problems.push(`release ${version} holds ${names[0]}, which sorts before a migration of an earlier release`)
    if (names.length) ceiling = names[names.length - 1]
  }
  return problems
}

/** The manifest after the unreleased migrations are closed as a release. */
function seal(manifest, migrations, version) {
  if (!VERSION.test(version)) throw new Error(`"${version}" is not a release version (x.y.z)`)
  if (manifest.releases[version]) throw new Error(`release ${version} is already closed`)
  const latest = Object.keys(manifest.releases).filter((item) => VERSION.test(item)).sort(compareVersions).pop()
  if (latest && compareVersions(version, latest) <= 0) throw new Error(`release ${version} is not newer than ${latest}`)
  const hashes = new Map(migrations.map((migration) => [migration.name, migration.sha256]))
  const names = [...manifest.unreleased].sort()
  return { releases: { ...manifest.releases, [version]: { migrations: names.map((name) => ({ name, sha256: hashes.get(name) || '' })) } }, unreleased: [] }
}

const load = () => JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
const save = (manifest) => fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)

if (require.main === module) {
  const [command, argument] = process.argv.slice(2)
  const migrations = readMigrations()
  if (command === 'seal') {
    const manifest = load()
    const problems = verify(manifest, migrations)
    if (problems.length) { console.error(problems.map((line) => ` - ${line}`).join('\n')); process.exit(1) }
    const next = seal(manifest, migrations, String(argument || ''))
    save(next)
    console.log(`Release ${argument} closed with ${next.releases[argument].migrations.length} migration(s).`)
  } else if (command === 'list') {
    const manifest = load()
    const names = argument ? (manifest.releases[argument]?.migrations || []).map((entry) => entry.name) : manifest.unreleased
    console.log(names.length ? names.join('\n') : argument ? `Release ${argument} has no migrations (or does not exist).` : 'No unreleased migrations.')
  } else {
    const problems = verify(load(), migrations)
    if (problems.length) { console.error(`Release manifest and migrations disagree:\n${problems.map((line) => ` - ${line}`).join('\n')}`); process.exit(1) }
    const manifest = load()
    console.log(`Release migrations OK (${Object.keys(manifest.releases).length} release(s), ${manifest.unreleased.length} unreleased migration(s))`)
  }
}

module.exports = { readMigrations, verify, seal, compareVersions }

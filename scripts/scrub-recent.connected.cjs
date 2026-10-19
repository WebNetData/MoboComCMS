// Real PostgreSQL background source-trace cleaning; settings and image copying are isolated.
// Only draft posts of this script carry the marker word, so no other row needs work.
const assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript-api'), {PrismaClient} = require('@prisma/client')
const db = new PrismaClient(), seed = `scrub-recent-${Date.now()}`, word = `tracemark${Date.now()}`
const baseline = process.env.SCRUB_RECENT_BASELINE
let saved = null
// SCRUB_RECENT_BASELINE=<git ref> runs the service of that revision to reproduce the old behaviour.
const source = file => baseline && file === 'src/modules/downloads/server/scrub.ts' ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8'}) : fs.readFileSync(file, 'utf8')
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/modules/settings/server': {getSettings: async () => ({siteUrl: 'http://localhost'}), readJsonSetting: async () => saved, writeJsonSetting: async (_key, value) => {saved = JSON.parse(JSON.stringify(value))}},
 '@/modules/downloads/server/guard': {getDownloadSettings: async () => ({scrubWords: [word], scrubLinks: 'off', autoLocalize: false})},
 '@/modules/downloads/server/files': {importImage: async () => {throw new Error('not used')}, logImportFailure: () => {}},
}
function load(file, cache = new Map()) {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(source(file), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  if (Object.hasOwn(mocks, name)) return mocks[name]
  if (name.startsWith('@/')) {const base = `src/${name.slice(2)}`; return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '/index.ts', cache)}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
const marked = () => db.post.count({where: {slug: {startsWith: seed}, content: {contains: word}}})
async function main() {
 const service = load('src/modules/downloads/server/scrub.ts')
 await db.post.createMany({data: Array.from({length: 150}, (_, i) => ({slug: `${seed}-${String(i).padStart(3, '0')}`, title: `${seed} ${i}`, content: '<p>clean text</p>', status: 'DRAFT'}))})
 // First run: remembers the newest rows and starts the edit window.
 assert.deepEqual(await service.scrubRecent(), {changed: 0})
 await new Promise(resolve => setTimeout(resolve, 50))
 // A bulk edit (an import, a search-and-replace) puts a source name into all 150 older posts.
 await db.post.updateMany({where: {slug: {startsWith: seed}}, data: {content: `<p>copied from ${word} today</p>`}})
 const first = await service.scrubRecent(), second = await service.scrubRecent()
 if (baseline) {
  assert.equal(first.changed, 100); assert.equal(second.changed, 0); assert.equal(await marked(), 50)
  console.log(`Reproduced at ${baseline}: of 150 edited posts only the first 100 were cleaned and the edit window moved on; 50 kept the source name`)
  return
 }
 assert.deepEqual(first, {changed: 150}); assert.equal(await marked(), 0, 'every edited post is cleaned')
 assert.deepEqual(second, {changed: 0})
 // A run that is out of time keeps the edit window, so the next run finishes the rest.
 await new Promise(resolve => setTimeout(resolve, 50))
 const window = saved.since
 await db.post.updateMany({where: {slug: {startsWith: seed}}, data: {content: `<p>again ${word}</p>`}})
 const short = await service.scrubRecent(-1)
 assert.equal(short.changed, 0); assert.equal(saved.since, window, 'an unfinished run does not move the edit window'); assert.equal(await marked(), 150)
 assert.deepEqual(await service.scrubRecent(), {changed: 150}); assert.equal(await marked(), 0); assert.notEqual(saved.since, window)
 // New posts are still picked up by id.
 await db.post.create({data: {slug: `${seed}-new`, title: `${seed} new`, content: `<p>fresh ${word}</p>`, status: 'DRAFT'}})
 assert.deepEqual(await service.scrubRecent(), {changed: 1}); assert.equal(await marked(), 0)
 console.log('PostgreSQL 150 edited posts cleaned in one run, unfinished run keeping the edit window, new post by id passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {await db.post.deleteMany({where: {slug: {startsWith: seed}}})} finally {await db.$disconnect()}
})

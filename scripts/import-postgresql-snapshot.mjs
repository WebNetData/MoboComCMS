import fs from 'node:fs'
import crypto from 'node:crypto'
import { PrismaClient, Prisma } from '@prisma/client'

const file = process.argv[2] || 'var/sqlite-export.json'
const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'))
if (snapshot.format !== 'happvpn-sqlite-snapshot-v1') throw new Error('unsupported snapshot format')
const unsigned = { format: snapshot.format, source: snapshot.source, tables: snapshot.tables }
const expectedHash = crypto.createHash('sha256').update(JSON.stringify(unsigned, Object.keys(unsigned).sort())).digest('hex')
// Python writes sorted nested keys too; recompute with a deterministic canonicalizer below instead.
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']'
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k)+':'+stable(v[k])).join(',') + '}'
  return JSON.stringify(v)
}
const sourceHash = crypto.createHash('sha256').update(stable(unsigned)).digest('hex')
if (sourceHash !== snapshot.sha256) throw new Error('snapshot checksum mismatch; export may be corrupt')

const database = new PrismaClient()
let client = database
const models = Prisma.dmmf.datamodel.models
const byName = new Map(models.map(m => [m.name, m]))
const snapshotModels = Object.keys(snapshot.tables).filter(name => byName.has(name))
const unknownModels = Object.keys(snapshot.tables).filter(name => !byName.has(name))
if (unknownModels.length) throw new Error('unrecognized snapshot tables: ' + unknownModels.join(', '))

function delegateName(model) { return model[0].toLowerCase() + model.slice(1) }
function scalarMap(model) { return new Map(model.fields.filter(f => f.kind === 'scalar' || f.kind === 'enum').map(f => [f.name, f])) }
function decodeWrapped(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if ('$int' in v) return v.$int
    if ('$float' in v) return v.$float
    if ('$bool' in v) return v.$bool
    if ('$bytes' in v) return Buffer.from(v.$bytes, 'base64')
  }
  return v
}
function hydrate(value, field) {
  if (value === null || value === undefined) return value
  value = decodeWrapped(value)
  if (field.type === 'BigInt') return BigInt(value)
  if (field.type === 'Int') return Number(value)
  if (field.type === 'Float') return Number(value)
  if (field.type === 'Boolean') return typeof value === 'boolean' ? value : Number(value) !== 0
  if (field.type === 'DateTime') {
    if (typeof value === 'string' && /^-?\d+$/.test(value)) return new Date(Number(value))
    return new Date(value)
  }
  if (field.type === 'Bytes') return Buffer.isBuffer(value) ? value : Buffer.from(value)
  return value
}
function rowForCreate(model, row) {
  const fields = scalarMap(model); const out = {}
  for (const [key, value] of Object.entries(row)) if (fields.has(key)) out[key] = hydrate(value, fields.get(key))
  return out
}
function orderSelfReferences(model, rows) {
  const relations = model.fields.filter(f => f.kind === 'object' && f.type === model.name && f.relationFromFields?.length)
  if (!relations.length) return rows
  const pending = new Set(rows), result = []
  while (pending.size) {
    const ready = [...pending].filter(row => relations.every(relation => {
      const values = relation.relationFromFields.map(k => decodeWrapped(row[k]))
      if (values.some(v => v == null)) return true
      return ![...pending].some(parent => parent !== row && relation.relationToFields.every((key,i) => String(decodeWrapped(parent[key])) === String(values[i])))
    }))
    if (!ready.length) throw new Error('self-relation cycle in ' + model.name)
    for (const row of ready) { pending.delete(row); result.push(row) }
  }
  return result
}
function canonicalScalar(value, field) {
  if (value === null || value === undefined) return null
  value = decodeWrapped(value)
  if (field.type === 'BigInt') return String(value)
  if (field.type === 'Int') return Number(value)
  if (field.type === 'Float') return Number(value)
  if (field.type === 'Boolean') return typeof value === 'boolean' ? value : Number(value) !== 0
  if (field.type === 'DateTime') {
    const d = value instanceof Date ? value : (typeof value === 'string' && /^-?\d+$/.test(value) ? new Date(Number(value)) : new Date(value))
    return d.toISOString()
  }
  if (field.type === 'Bytes') return Buffer.isBuffer(value) ? value.toString('base64') : Buffer.from(value).toString('base64')
  return value
}
function canonicalRows(model, rows) {
  const fields = scalarMap(model)
  return rows.map(row => {
    const out = {}
    for (const [name, field] of fields) if (Object.prototype.hasOwnProperty.call(row, name)) out[name] = canonicalScalar(row[name], field)
    return out
  }).sort((a,b) => stable(a).localeCompare(stable(b)))
}
function digest(model, rows) { return crypto.createHash('sha256').update(stable(canonicalRows(model, rows))).digest('hex') }

function dependencyOrder() {
  const wanted = new Set(snapshotModels), deps = new Map()
  for (const name of wanted) {
    const model = byName.get(name); const set = new Set()
    for (const f of model.fields) if (f.kind === 'object' && f.relationFromFields?.length && f.type !== name && wanted.has(f.type)) set.add(f.type)
    deps.set(name, set)
  }
  const out=[]; const remaining=new Set(wanted)
  while (remaining.size) {
    const ready=[...remaining].filter(n => [...deps.get(n)].every(d => !remaining.has(d))).sort()
    if (!ready.length) throw new Error('foreign-key dependency cycle: '+[...remaining].join(', '))
    for (const n of ready) { out.push(n); remaining.delete(n) }
  }
  return out
}

async function ensureEmpty() {
  const nonEmpty=[]
  for (const name of byName.keys()) {
    const delegate=client[delegateName(name)]
    if (!delegate?.count) continue
    const count=await delegate.count()
    if (count) nonEmpty.push(`${name}=${count}`)
  }
  if (nonEmpty.length) throw new Error('target PostgreSQL database is not empty: '+nonEmpty.slice(0,10).join(', '))
}
async function resetSequence(model) {
  const id = model.fields.find(f => f.isId && f.type === 'Int' && f.hasDefaultValue && typeof f.default === 'object' && f.default?.name === 'autoincrement')
  if (!id) return
  const table = model.dbName || model.name
  const q = s => '"'+String(s).replaceAll('"','""')+'"'
  // pg_get_serial_sequence parses its text argument as an SQL identifier, so a
  // CamelCase table must be passed already quoted ('"AuditLog"') or it is folded
  // to lowercase and the relation is not found.
  const relation = q(table).replaceAll("'", "''")
  const column = String(id.dbName || id.name).replaceAll("'", "''")
  const sql = `SELECT setval(pg_get_serial_sequence('${relation}', '${column}'), COALESCE((SELECT MAX(${q(id.dbName || id.name)}) FROM ${q(table)}), 1), (SELECT COUNT(*) > 0 FROM ${q(table)}))`
  await client.$executeRawUnsafe(sql)
}

try {
  await database.$transaction(async tx => {
  client = tx
  await ensureEmpty()
  const order=dependencyOrder()
  for (const name of order) {
    const model=byName.get(name), rows=orderSelfReferences(model,snapshot.tables[name] || []), delegate=client[delegateName(name)]
    for (let i=0;i<rows.length;i+=250) await delegate.createMany({ data: rows.slice(i,i+250).map(r => rowForCreate(model,r)) })
    process.stdout.write(`Imported ${name}: ${rows.length}\n`)
  }
  for (const name of order) await resetSequence(byName.get(name))
  let bad=false
  for (const name of order) {
    const model=byName.get(name), delegate=client[delegateName(name)], source=snapshot.tables[name] || [], target=await delegate.findMany()
    const a=digest(model,source), b=digest(model,target)
    if (source.length !== target.length || a !== b) { console.error(`VERIFY FAILED ${name}: source=${source.length}/${a} target=${target.length}/${b}`); bad=true }
  }
  if (bad) throw new Error('PostgreSQL verification failed')
  console.log('PostgreSQL import verified: row counts and canonical digests match')
  }, { timeout: 600000, maxWait: 10000 })
} finally {
  await database.$disconnect()
}

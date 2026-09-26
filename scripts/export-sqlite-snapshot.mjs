#!/usr/bin/env node
/**
 * Export the SQLite database to a precision-safe JSON snapshot for the
 * PostgreSQL importer — a Node-only twin of export-sqlite-snapshot.py for
 * machines without Python.
 *
 * IMPORTANT: run this while node_modules still contains the SQLite-generated
 * Prisma client (before `npm run db:generate:postgres`).
 *
 *   node scripts/export-sqlite-snapshot.mjs prisma/dev.db var/sqlite-export.json
 */
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { PrismaClient, Prisma } from '@prisma/client'

const dbPath = process.argv[2] || 'prisma/dev.db'
const outPath = process.argv[2 + 1] || 'var/sqlite-export.json'
const dbUrl = `file:${path.resolve(dbPath).replaceAll('\\', '/')}`

function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']'
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
  return JSON.stringify(v)
}

function encode(value, field) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return { $bool: value }
  if (typeof value === 'bigint') return { $int: value.toString() }
  if (typeof value === 'number') return field?.type === 'Float' ? { $float: String(value) } : { $int: String(value) }
  if (value instanceof Date) return { $int: String(value.getTime()) } // Prisma stores DateTime as epoch ms in SQLite
  if (value instanceof Uint8Array) return { $bytes: Buffer.from(value).toString('base64') }
  throw new Error(`unsupported value type for field ${field?.name || '?'}: ${typeof value}`)
}

const db = new PrismaClient({ datasources: { db: { url: dbUrl } } })
try {
  const models = Prisma.dmmf.datamodel.models
  const tables = {}
  for (const model of models) {
    const scalarFields = new Map(model.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum').map((f) => [f.name, f]))
    const delegate = db[model.name[0].toLowerCase() + model.name.slice(1)]
    const rows = await delegate.findMany()
    tables[model.name] = rows.map((row) => {
      const out = {}
      for (const [name, field] of scalarFields) out[name] = encode(row[name], field)
      return out
    })
  }
  const payload = { format: 'happvpn-sqlite-snapshot-v1', source: dbPath, tables }
  const raw = stable(payload)
  payload.sha256 = crypto.createHash('sha256').update(raw).digest('hex')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2))
  const total = Object.values(tables).reduce((sum, rows) => sum + rows.length, 0)
  console.log(`Exported ${total} rows across ${models.length} models -> ${outPath}`)
  console.log(`Snapshot SHA-256: ${payload.sha256}`)
} finally {
  await db.$disconnect()
}

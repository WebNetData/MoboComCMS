import fs from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/platform/database/prisma'
import { readOnlySql, safeIdent } from '@/modules/server-panel/domain/policy'

// Database tools: table catalog with sizes, paginated browsing, a read-only
// SQL console and CSV export. Secrets never leave the server: columns whose
// name looks like a credential are masked, and so are secret-looking settings.

export class DbError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

const SECRET_COLUMN = /pass(word)?|secret|token|hash|api[_-]?key|private|credential|otp|salt|cookie|session/i
const SECRET_SETTING = /pass(word)?|secret|token|api[_-]?key|private|credential|smtp|totp/i
const MAX_ROWS = 500

export const dialect = () => (/^postgres(ql)?:/.test(process.env.DATABASE_URL || '') ? 'postgresql' : 'sqlite') as 'postgresql' | 'sqlite'
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`

type Row = Record<string, unknown>

function cell(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Uint8Array) return `<binary ${value.byteLength} bytes>`
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`
  return value
}

/** Masks credential columns and, for the Setting table, secret-looking keys. */
export function maskRows(rows: Row[], table?: string): Row[] {
  return rows.map((row) => {
    const out: Row = {}
    const settingSecret = table === 'Setting' && typeof row.key === 'string' && SECRET_SETTING.test(row.key)
    for (const [key, value] of Object.entries(row)) {
      const secret = (SECRET_COLUMN.test(key) && value !== null && value !== '') || (settingSecret && key === 'value')
      out[key] = secret ? '••••••' : cell(value)
    }
    return out
  })
}

export async function tables() {
  if (dialect() === 'postgresql') {
    const rows = await db.$queryRawUnsafe<{ name: string; rows: bigint | number; bytes: bigint | number }[]>(
      `SELECT relname AS name, n_live_tup AS rows, pg_total_relation_size(relid) AS bytes FROM pg_stat_user_tables WHERE schemaname = current_schema() ORDER BY relname`)
    return rows.map((row) => ({ name: row.name, rows: Number(row.rows), bytes: Number(row.bytes) }))
  }
  const rows = await db.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY name`)
  const counted = []
  for (const row of rows) {
    if (!safeIdent(row.name)) continue
    const [count] = await db.$queryRawUnsafe<{ n: bigint | number }[]>(`SELECT COUNT(*) AS n FROM ${quote(row.name)}`)
    counted.push({ name: row.name, rows: Number(count?.n || 0), bytes: -1 })
  }
  return counted
}

async function knownTable(name: unknown): Promise<string> {
  const table = String(name || '')
  if (!safeIdent(table) || !(await tables()).some((row) => row.name === table)) throw new DbError('جدول پیدا نشد', 404)
  return table
}

export async function columns(table: string): Promise<{ name: string; type: string; nullable: boolean; pk: boolean }[]> {
  if (dialect() === 'postgresql') {
    const rows = await db.$queryRawUnsafe<{ name: string; type: string; nullable: string; pk: boolean }[]>(
      `SELECT c.column_name AS name, c.data_type AS type, c.is_nullable AS nullable,
        EXISTS (SELECT 1 FROM information_schema.table_constraints t JOIN information_schema.key_column_usage k ON t.constraint_name = k.constraint_name AND t.table_name = k.table_name
                WHERE t.table_name = c.table_name AND t.constraint_type = 'PRIMARY KEY' AND k.column_name = c.column_name) AS pk
       FROM information_schema.columns c WHERE c.table_schema = current_schema() AND c.table_name = $1 ORDER BY c.ordinal_position`, table)
    return rows.map((row) => ({ name: row.name, type: row.type, nullable: row.nullable === 'YES', pk: !!row.pk }))
  }
  const rows = await db.$queryRawUnsafe<{ name: string; type: string; notnull: bigint | number; pk: bigint | number }[]>(`PRAGMA table_info(${quote(table)})`)
  return rows.map((row) => ({ name: row.name, type: row.type, nullable: !Number(row.notnull), pk: Number(row.pk) > 0 }))
}

export async function browse(input: { table: unknown; page?: unknown; size?: unknown; sort?: unknown; dir?: unknown; column?: unknown; search?: unknown }) {
  const table = await knownTable(input.table)
  const cols = await columns(table)
  const size = Math.min(200, Math.max(10, Number(input.size) || 50))
  const page = Math.max(1, Math.floor(Number(input.page) || 1))
  const sort = cols.find((col) => col.name === input.sort)?.name || cols.find((col) => col.pk)?.name || cols[0]?.name
  const direction = input.dir === 'asc' ? 'ASC' : 'DESC'
  const column = cols.find((col) => col.name === input.column)?.name
  const search = typeof input.search === 'string' ? input.search.trim().slice(0, 200) : ''
  const pg = dialect() === 'postgresql'
  const where = column && search ? `WHERE CAST(${quote(column)} AS TEXT) ${pg ? 'ILIKE $1' : 'LIKE ?'}` : ''
  const params = column && search ? [`%${search}%`] : []
  const [countRow] = await db.$queryRawUnsafe<{ n: bigint | number }[]>(`SELECT COUNT(*) AS n FROM ${quote(table)} ${where}`, ...params)
  const rows = await db.$queryRawUnsafe<Row[]>(`SELECT * FROM ${quote(table)} ${where} ${sort ? `ORDER BY ${quote(sort)} ${direction}` : ''} LIMIT ${size} OFFSET ${(page - 1) * size}`, ...params)
  const total = Number(countRow?.n || 0)
  return { table, columns: cols, rows: maskRows(rows, table), total, page, pages: Math.max(1, Math.ceil(total / size)), sort, dir: direction.toLowerCase() }
}

/** One read-only statement, bounded rows and time; masked like browsing. */
export async function runQuery(sqlInput: unknown) {
  const checked = readOnlySql(sqlInput)
  if (!checked.ok) throw new DbError(checked.error)
  const lead = checked.sql.replace(/^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*/, '').split(/\s+/)[0].toLowerCase()
  const wrapped = ['select', 'with', 'values'].includes(lead) ? `SELECT * FROM (${checked.sql}) AS panel_query LIMIT ${MAX_ROWS + 1}` : checked.sql
  const started = Date.now()
  let rows: Row[]
  try {
    if (dialect() === 'postgresql') {
      rows = await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = 15000`)
        return tx.$queryRawUnsafe<Row[]>(wrapped)
      }, { timeout: 20_000 })
    } else {
      rows = await db.$transaction(async (tx) => {
        await tx.$queryRawUnsafe('PRAGMA query_only = 1')
        try { return await tx.$queryRawUnsafe<Row[]>(wrapped) } finally { await tx.$queryRawUnsafe('PRAGMA query_only = 0') }
      }, { timeout: 20_000 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const detail = message.match(/(?:Message|message): `?([^`\n]+)/)?.[1] || message.split('\n').filter(Boolean).pop() || ''
    throw new DbError(`خطای پایگاه داده: ${detail.slice(0, 300)}`)
  }
  const truncated = rows.length > MAX_ROWS
  const list = maskRows(rows.slice(0, MAX_ROWS))
  return { columns: list.length ? Object.keys(list[0]) : [], rows: list, truncated, ms: Date.now() - started }
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export async function exportCsv(tableInput: unknown) {
  const table = await knownTable(tableInput)
  const cols = await columns(table)
  const rows = maskRows(await db.$queryRawUnsafe<Row[]>(`SELECT * FROM ${quote(table)} LIMIT 50000`), table)
  const lines = [cols.map((col) => csvCell(col.name)).join(','), ...rows.map((row) => cols.map((col) => csvCell(row[col.name])).join(','))]
  return { name: `${table}-${new Date().toISOString().slice(0, 10)}.csv`, body: `﻿${lines.join('\r\n')}` }
}

export async function overview() {
  const kind = dialect()
  let size = -1, version = ''
  if (kind === 'postgresql') {
    const [row] = await db.$queryRawUnsafe<{ size: bigint | number; version: string }[]>(`SELECT pg_database_size(current_database()) AS size, version() AS version`)
    size = Number(row?.size ?? -1); version = String(row?.version || '').split(' on ')[0]
  } else {
    const file = sqliteFile()
    size = file ? await fs.stat(file).then((stat) => stat.size, () => -1) : -1
    const [row] = await db.$queryRawUnsafe<{ v: string }[]>(`SELECT sqlite_version() AS v`)
    version = `SQLite ${row?.v || ''}`
  }
  return { dialect: kind, size, version }
}

/** SQLite file path from DATABASE_URL (relative to prisma/). */
export function sqliteFile(): string | null {
  const url = process.env.DATABASE_URL || ''
  if (!url.startsWith('file:')) return null
  const raw = url.slice(5).split('?')[0]
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), 'prisma', raw)
}

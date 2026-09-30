/**
 * Parsers for uploaded import files (JSON, CSV, XLSX). Every file is
 * untrusted: sizes, rows, columns, cell length and JSON depth are capped, and
 * XLSX is read with its own small ZIP reader that refuses ZIP bombs and never
 * evaluates formulas (only the stored cell values are read).
 */
import { inflateRawSync } from 'node:zlib'
import { LIMITS } from '@/modules/imports/domain/types'

export class ImportFileError extends Error {
  constructor(message: string) { super(message) }
}

export type Parsed = { format: 'json' | 'csv' | 'xlsx'; rows: Record<string, unknown>[]; sheets?: string[]; sheet?: string }

export function detectFormat(name: string, bytes: Uint8Array): Parsed['format'] {
  const ext = name.toLowerCase().split('.').pop() || ''
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    if (ext === 'xlsx' || ext === 'xlsm' || ext === 'zip') return 'xlsx'
    throw new ImportFileError('فایل فشرده فقط به‌صورت XLSX پذیرفته می‌شود')
  }
  if (ext === 'xls') throw new ImportFileError('فرمت قدیمی XLS پشتیبانی نمی‌شود؛ فایل را با فرمت XLSX یا CSV ذخیره کنید')
  if (ext === 'json') return 'json'
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return 'csv'
  const head = new TextDecoder().decode(bytes.subarray(0, 64)).replace(/^﻿/, '').trimStart()
  return head.startsWith('[') || head.startsWith('{') ? 'json' : 'csv'
}

export function parseFile(name: string, bytes: Uint8Array, sheet = ''): Parsed {
  if (bytes.length > LIMITS.uploadBytes) throw new ImportFileError(`حجم فایل بیش از ${LIMITS.uploadBytes / 1024 / 1024} مگابایت است`)
  if (!bytes.length) throw new ImportFileError('فایل خالی است')
  const format = detectFormat(name, bytes)
  if (format === 'json') return { format, rows: parseJson(decodeText(bytes)) }
  if (format === 'csv') return { format, rows: parseCsv(decodeText(bytes)) }
  const book = readXlsx(bytes, sheet)
  return { format, rows: book.rows, sheets: book.sheets, sheet: book.sheet }
}

function decodeText(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  return text.replace(/^﻿/, '')
}

const cell = (value: string) => {
  if (value.length > LIMITS.cellChars) throw new ImportFileError(`طول یک خانه بیش از ${LIMITS.cellChars} نویسه است`)
  return value
}

// ------------------------------------------------------------------ JSON

/** Deepest nesting of arrays/objects, found without parsing (so a deep file cannot exhaust the stack). */
export function jsonDepth(text: string): number {
  let depth = 0, max = 0, inString = false
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    if (inString) {
      if (ch === 92) i++ // backslash: skip the escaped character
      else if (ch === 34) inString = false
      continue
    }
    if (ch === 34) inString = true
    else if (ch === 123 || ch === 91) { depth++; if (depth > max) max = depth }
    else if (ch === 125 || ch === 93) depth--
  }
  return max
}

/** An array of objects, or an object holding one ({"items": […]}, {"data": […]}, {"products": […]}). */
export function parseJson(text: string): Record<string, unknown>[] {
  if (jsonDepth(text) > LIMITS.jsonDepth) throw new ImportFileError(`عمق ساختار JSON بیش از ${LIMITS.jsonDepth} سطح است`)
  let data: unknown
  try { data = JSON.parse(text) } catch (error) { throw new ImportFileError(`فایل JSON معتبر نیست: ${error instanceof Error ? error.message.slice(0, 120) : ''}`) }
  let list: unknown = data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const holder = data as Record<string, unknown>
    const key = ['items', 'data', 'records', 'rows', 'products', 'posts', 'results'].find((name) => Array.isArray(holder[name]))
      ?? Object.keys(holder).find((name) => Array.isArray(holder[name]))
    list = key ? holder[key] : [data]
  }
  if (!Array.isArray(list)) throw new ImportFileError('فایل JSON باید فهرستی از رکوردها باشد')
  if (list.length > LIMITS.rows) throw new ImportFileError(`تعداد رکوردها بیش از ${LIMITS.rows} است`)
  const rows = list.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row))
  if (!rows.length) throw new ImportFileError('هیچ رکوردی (شیء JSON) در فایل پیدا نشد')
  for (const row of rows) checkCells(row, 0)
  return rows
}

function checkCells(value: unknown, depth: number) {
  if (typeof value === 'string') cell(value)
  else if (Array.isArray(value)) { if (value.length > 5000) throw new ImportFileError('یک فهرست داخلی بیش از ۵۰۰۰ عضو دارد'); value.forEach((item) => checkCells(item, depth + 1)) }
  else if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length > LIMITS.columns) throw new ImportFileError(`یک رکورد بیش از ${LIMITS.columns} فیلد دارد`)
    for (const key of keys) checkCells((value as Record<string, unknown>)[key], depth + 1)
  }
}

// ------------------------------------------------------------------ CSV

function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n/) === -1 ? text.length : text.search(/\r?\n/))
  const counts = [',', ';', '\t', '|'].map((d) => [d, firstLine.split(d).length] as const)
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] > 1 ? counts[0][0] : ','
}

/** RFC 4180 CSV (quoted fields, doubled quotes, CRLF or LF), delimiter detected from the header line. */
export function parseCsvMatrix(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  const push = () => { row.push(cell(field)); field = '' }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else {
        field += ch
        if (field.length > LIMITS.cellChars) cell(field)
      }
      continue
    }
    if (ch === '"' && field === '') quoted = true
    else if (ch === delimiter) push()
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      push()
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      if (rows.length > LIMITS.rows + 1) throw new ImportFileError(`تعداد ردیف‌ها بیش از ${LIMITS.rows} است`)
    } else field += ch
  }
  if (quoted) throw new ImportFileError('یک خانهٔ داخل گیومه در فایل CSV بسته نشده است')
  if (field !== '' || row.length) { push(); if (row.some((value) => value !== '')) rows.push(row) }
  return rows
}

/** Header row → column names (blank and repeated names get a suffix, so no data is lost). */
export function headerNames(header: unknown[]): string[] {
  if (header.length > LIMITS.columns) throw new ImportFileError(`تعداد ستون‌ها بیش از ${LIMITS.columns} است`)
  const seen = new Map<string, number>()
  return header.map((raw, index) => {
    let name = String(raw ?? '').replace(/\s+/g, ' ').trim() || `column_${index + 1}`
    const count = seen.get(name) || 0
    seen.set(name, count + 1)
    if (count) name = `${name}_${count + 1}`
    return name
  })
}

function matrixToRows(matrix: unknown[][]): Record<string, unknown>[] {
  if (matrix.length < 2) throw new ImportFileError('فایل باید یک ردیف عنوان ستون‌ها و دست‌کم یک ردیف داده داشته باشد')
  const names = headerNames(matrix[0])
  const rows: Record<string, unknown>[] = []
  for (const line of matrix.slice(1)) {
    const row: Record<string, unknown> = {}
    names.forEach((name, i) => { const value = line[i]; row[name] = value === undefined || value === null ? '' : value })
    rows.push(row)
  }
  if (rows.length > LIMITS.rows) throw new ImportFileError(`تعداد ردیف‌ها بیش از ${LIMITS.rows} است`)
  return rows
}

export function parseCsv(text: string): Record<string, unknown>[] {
  return matrixToRows(parseCsvMatrix(text))
}

// ------------------------------------------------------------------ XLSX

type ZipEntry = { name: string; method: number; compressed: number; size: number; offset: number }

/** Central directory of a ZIP file (no ZIP64, no encryption — XLSX files from office software never need them). */
export function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new ImportFileError('فایل XLSX خراب است (ساختار ZIP پیدا نشد)')
  const count = view.getUint16(eocd + 10, true)
  let at = view.getUint32(eocd + 16, true)
  if (count > LIMITS.xlsxEntries) throw new ImportFileError('فایل XLSX بیش از حد تعداد بخش دارد')
  const entries: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new ImportFileError('فایل XLSX خراب است')
    const flags = view.getUint16(at + 8, true)
    const method = view.getUint16(at + 10, true)
    const compressed = view.getUint32(at + 20, true)
    const size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const extra = view.getUint16(at + 30, true)
    const comment = view.getUint16(at + 32, true)
    const offset = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength))
    if (flags & 1) throw new ImportFileError('فایل XLSX رمزدار پشتیبانی نمی‌شود')
    if (compressed === 0xffffffff || size === 0xffffffff) throw new ImportFileError('فایل XLSX بیش از حد بزرگ است')
    entries.push({ name, method, compressed, size, offset })
    at += 46 + nameLength + extra + comment
  }
  return entries
}

/** One ZIP part, with the declared size, the real size and the compression ratio all capped. */
export function unzipEntry(bytes: Uint8Array, entry: ZipEntry, budget: { left: number }): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(entry.offset, true) !== 0x04034b50) throw new ImportFileError('فایل XLSX خراب است')
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true)
  const data = bytes.subarray(start, start + entry.compressed)
  if (entry.size > budget.left) throw new ImportFileError('حجم بازشدهٔ فایل XLSX بیش از حد مجاز است')
  if (entry.compressed > 0 && entry.size / entry.compressed > LIMITS.xlsxRatio && entry.size > 1024 * 1024) throw new ImportFileError('فایل XLSX مشکوک به بمب فشرده‌سازی (ZIP bomb) است')
  let out: Uint8Array
  if (entry.method === 0) out = data
  else if (entry.method === 8) {
    try { out = inflateRawSync(data, { maxOutputLength: Math.min(budget.left, entry.size + 1) }) } catch { throw new ImportFileError('بخشی از فایل XLSX باز نشد یا از اندازهٔ اعلام‌شده بزرگ‌تر است') }
  } else throw new ImportFileError('روش فشرده‌سازی فایل XLSX پشتیبانی نمی‌شود')
  if (out.length !== entry.size) throw new ImportFileError('اندازهٔ واقعی بخشی از فایل XLSX با اندازهٔ اعلام‌شده یکی نیست')
  budget.left -= out.length
  return new TextDecoder().decode(out)
}

const unescapeXml = (text: string) => text
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
  .replace(/&amp;/g, '&')

/** All text runs of a string item (<si><r><t>…</t></r>…</si>), phonetic runs excluded. */
const textOf = (xml: string) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('')

const columnIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] || ''
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** First (or named) worksheet of an XLSX file as rows keyed by the header row. Stored values only; formulas are never run. */
export function readXlsx(bytes: Uint8Array, wanted = ''): { rows: Record<string, unknown>[]; sheets: string[]; sheet: string } {
  const entries = zipEntries(bytes)
  const byName = new Map(entries.map((entry) => [entry.name, entry]))
  if ([...byName.keys()].some((name) => /vbaProject\.bin$/i.test(name))) throw new ImportFileError('فایل حاوی ماکرو است؛ آن را با فرمت XLSX بدون ماکرو ذخیره کنید')
  const budget = { left: LIMITS.xlsxUnpackedBytes }
  const read = (name: string) => { const entry = byName.get(name); return entry ? unzipEntry(bytes, entry, budget) : '' }
  const workbook = read('xl/workbook.xml')
  if (!workbook) throw new ImportFileError('فایل XLSX معتبر نیست (workbook پیدا نشد)')
  const rels = read('xl/_rels/workbook.xml.rels')
  const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/\bId="([^"]+)"/.exec(m[0])?.[1] || '', /\bTarget="([^"]+)"/.exec(m[0])?.[1] || '']))
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    name: unescapeXml(/\bname="([^"]*)"/.exec(m[0])?.[1] || ''),
    rid: /\br:id="([^"]+)"/.exec(m[0])?.[1] || /\bid="([^"]+)"/.exec(m[0])?.[1] || '',
  }))
  if (!sheets.length) throw new ImportFileError('فایل XLSX هیچ برگه‌ای ندارد')
  const chosen = sheets.find((sheet) => sheet.name === wanted) || sheets[0]
  let target = targets.get(chosen.rid) || 'worksheets/sheet1.xml'
  target = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
  const sheetXml = read(target)
  if (!sheetXml) throw new ImportFileError('برگهٔ انتخاب‌شده در فایل XLSX پیدا نشد')
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => cell(textOf(m[1])))

  const matrix: unknown[][] = []
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    if (matrix.length > LIMITS.rows + 1) throw new ImportFileError(`تعداد ردیف‌ها بیش از ${LIMITS.rows} است`)
    const values: unknown[] = []
    let next = 0
    for (const c of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1]
      const col = ref ? columnIndex(ref) : next
      next = col + 1
      if (col >= LIMITS.columns) throw new ImportFileError(`تعداد ستون‌ها بیش از ${LIMITS.columns} است`)
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] || 'n'
      const body = c[2] || ''
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
      let value: unknown = ''
      if (type === 's') value = shared[Number(v)] ?? ''
      else if (type === 'inlineStr') value = cell(textOf(body))
      else if (type === 'b') value = v === '1'
      else if (type === 'str' || type === 'e') value = cell(unescapeXml(v || ''))
      else if (v !== undefined && v !== '') { const n = Number(v); value = Number.isFinite(n) ? n : cell(unescapeXml(v)) }
      values[col] = value
    }
    // Blank rows are left out; the header is the first non-empty row.
    if (values.some((value) => value !== '' && value !== undefined)) matrix.push(values)
  }
  return { rows: matrixToRows(matrix), sheets: sheets.map((sheet) => sheet.name), sheet: chosen.name }
}

/** Excel serial date (days since 1899-12-30) → Date. */
export function excelSerialDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null
  return new Date(Math.round((serial - 25569) * 86_400_000))
}

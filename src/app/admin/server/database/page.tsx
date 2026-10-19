'use client'

import { useState } from 'react'
import { Notice, ServerShell, bytes, fa, useServerApi, useServerJson } from '../shared'
import { Pager } from '../../store/shared'
import Link from '@/components/AppLink'

type Overview = { dialect: 'postgresql' | 'sqlite'; size: number; version: string; tables: { name: string; rows: number; bytes: number }[] }
type Column = { name: string; type: string; nullable: boolean; pk: boolean }
type Browse = { table: string; columns: Column[]; rows: Record<string, unknown>[]; total: number; page: number; pages: number; sort?: string; dir: string }
type Query = { columns: string[]; rows: Record<string, unknown>[]; truncated: boolean; ms: number }

function Cell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <td className="is-null">NULL</td>
  const text = String(value)
  return <td title={text.length > 40 ? text : undefined}>{text}</td>
}

function Grid({ columns, rows, sort, dir, onSort }: { columns: string[]; rows: Record<string, unknown>[]; sort?: string; dir?: string; onSort?: (column: string) => void }) {
  return <div className="sa-table-wrap"><table className="data sa-table sp-grid-table">
    <thead><tr>{columns.map((column) => <th key={column}>{onSort ? <button type="button" className="sa-link" onClick={() => onSort(column)}>{column}{sort === column ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</button> : column}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <Cell key={column} value={row[column]} />)}</tr>)}
      {!rows.length && <tr><td colSpan={Math.max(1, columns.length)} className="sa-empty">ردیفی نیست.</td></tr>}</tbody>
  </table></div>
}

function Database() {
  const api = useServerApi()
  const { data, error } = useServerJson<Overview>('/api/admin/server/db')
  const [table, setTable] = useState('')
  const [state, setState] = useState({ page: 1, sort: '', dir: 'desc', column: '', search: '' })
  const [search, setSearch] = useState('')
  const url = table ? `/api/admin/server/db?table=${table}&page=${state.page}&sort=${state.sort}&dir=${state.dir}&column=${state.column}&search=${encodeURIComponent(state.search)}` : null
  const browse = useServerJson<Browse>(url)
  const [sql, setSql] = useState('SELECT id, email, role, "createdAt" FROM "User" ORDER BY id DESC')
  const [result, setResult] = useState<Query | null>(null)
  const [queryError, setQueryError] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('')

  async function run() {
    setBusy(true); setQueryError('')
    const response = await api<Query>('/api/admin/server/db', { body: { sql } })
    setBusy(false)
    if (response.ok) setResult(response.data); else { setResult(null); setQueryError(response.error) }
  }

  const tables = (data?.tables || []).filter((row) => !filter || row.name.toLowerCase().includes(filter.toLowerCase()))
  const totalRows = (data?.tables || []).reduce((sum, row) => sum + row.rows, 0)
  return <>
    {error && <Notice tone="error">{error}</Notice>}
    {data && <div className="sa-kpis">
      <div className="sa-kpi"><span>موتور</span><b dir="ltr">{data.dialect === 'postgresql' ? 'PostgreSQL' : 'SQLite'}</b><small className="sa-sub" dir="ltr">{data.version}</small></div>
      <div className="sa-kpi"><span>حجم</span><b>{data.size >= 0 ? bytes(data.size) : '—'}</b></div>
      <div className="sa-kpi"><span>جدول‌ها</span><b className="num">{fa(data.tables.length)}</b></div>
      <div className="sa-kpi"><span>ردیف‌ها (تقریبی)</span><b className="num">{fa(totalRows)}</b></div>
    </div>}
    <div className="sp-db">
      <section className="sa-card sp-tables-card">
        <input className="input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="فیلتر جدول‌ها" aria-label="فیلتر جدول‌ها" />
        <nav className="sp-tables" aria-label="جدول‌ها">{tables.map((row) => <button key={row.name} type="button" className={table === row.name ? 'is-active' : ''} onClick={() => { setTable(row.name); setState({ page: 1, sort: '', dir: 'desc', column: '', search: '' }); setSearch('') }}>
          <span>{row.name}</span><small className="num">{fa(row.rows)}{row.bytes > 0 ? ` · ${bytes(row.bytes)}` : ''}</small>
        </button>)}</nav>
      </section>
      <div className="sa-stack">
        {table && <section className="sa-card">
          <header className="sa-card-head"><h2 dir="ltr">{table}</h2><div className="sa-head-actions">
            {browse.data && <small>{fa(browse.data.total)} ردیف</small>}
            <a className="btn btn-ghost btn-sm" href={`/api/admin/server/db?export=${table}`}>خروجی CSV</a>
          </div></header>
          {browse.data && <form className="sa-toolbar" onSubmit={(e) => { e.preventDefault(); setState({ ...state, page: 1, search }) }}>
            <label className="sa-inline"><span>ستون</span><select className="select" value={state.column} onChange={(e) => setState({ ...state, column: e.target.value })}><option value="">—</option>{browse.data.columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select></label>
            <input aria-label="جست‌وجوی جدول" className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جست‌وجو در ستون انتخابی" disabled={!state.column} />
            <button type="submit" className="btn btn-ghost btn-sm" disabled={!state.column}>جست‌وجو</button>
          </form>}
          {browse.error && <Notice tone="error">{browse.error}</Notice>}
          {!browse.data ? <div className="sa-skeleton" /> : <>
            <Grid columns={browse.data.columns.map((column) => column.name)} rows={browse.data.rows} sort={browse.data.sort} dir={browse.data.dir} onSort={(column) => setState({ ...state, page: 1, sort: column, dir: browse.data?.sort === column && browse.data.dir === 'desc' ? 'asc' : 'desc' })} />
            <Pager page={browse.data.page} pages={browse.data.pages} onPage={(page) => setState({ ...state, page })} />
            <details className="sp-schema"><summary className="sa-hint">ساختار جدول</summary><ul className="sa-hint" dir="ltr">{browse.data.columns.map((column) => <li key={column.name}><code>{column.name}</code> {column.type}{column.pk ? ' · PK' : ''}{column.nullable ? ' · null' : ''}</li>)}</ul></details>
          </>}
        </section>}
        <section className="sa-card">
          <header className="sa-card-head"><h2>کنسول SQL (فقط خواندنی)</h2><small>SELECT، WITH، EXPLAIN — حداکثر ۵۰۰ ردیف و ۱۵ ثانیه</small></header>
          <textarea className="sp-sql" dir="ltr" spellCheck={false} value={sql} onChange={(e) => setSql(e.target.value)} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void run() } }} aria-label="کوئری SQL" />
          <div className="sa-toolbar"><button type="button" className="btn btn-primary" disabled={busy || !sql.trim()} onClick={() => void run()}>{busy ? 'در حال اجرا…' : 'اجرا (Ctrl+Enter)'}</button>
            {result && <small className="sa-hint">{fa(result.rows.length)} ردیف · {fa(result.ms)} میلی‌ثانیه{result.truncated ? ' · فقط ۵۰۰ ردیف اول' : ''}</small>}</div>
          {queryError && <Notice tone="error">{queryError}</Notice>}
          {result && <Grid columns={result.columns} rows={result.rows} />}
          <p className="sa-hint">ستون‌های حساس (رمز، توکن، کلید و…) همیشه پوشانده می‌شوند. دستورهای تغییر‌دهنده اجرا نمی‌شوند؛ تغییر داده‌ها را از بخش‌های مدیریت انجام دهید تا قواعد سایت رعایت شود.</p>
        </section>
        <Backups dialect={data?.dialect} />
      </div>
    </div>
  </>
}

function Backups({ dialect }: { dialect?: 'postgresql' | 'sqlite' }) {
  return <section className="sa-card">
    <header className="sa-card-head"><h2>بکاپ پایگاه داده</h2></header>
    {dialect === 'sqlite'
      ? <><p className="sa-hint">پایگاه دادهٔ فعلی SQLite است؛ یک نسخهٔ کامل از فایل آن را دانلود کنید.</p><a className="btn btn-primary" href="/api/admin/server/db?download=sqlite">دانلود فایل پایگاه داده</a></>
      : <><p className="sa-hint">بکاپ‌های PostgreSQL رمزگذاری‌شده، زمان‌بندی، نگهداری و آزمون بازیابی در بخش «ربات و بکاپ» مدیریت می‌شوند.</p><Link className="btn btn-primary" href="/admin/telegram">مدیریت بکاپ‌ها</Link></>}
  </section>
}

export default function DatabasePage() {
  return <ServerShell title="پایگاه داده"><Database /></ServerShell>
}

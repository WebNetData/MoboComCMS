'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Notice, bytes, fa, faDate, useServerApi, useServerJson } from '@/app/admin/server/shared'
import { EMPTY_STORAGE, KIND_LABEL, STATUS, PHASE, TEXT_EXT, type Entry, type Overview, type ArchiveListing, type Job, type Listing, type Tone } from './types'
import { seconds } from './common'
export default function Jobs({ jobs, onChange }: { jobs: Job[]; onChange: () => void }) {
  const api = useServerApi()
  const act = async (body: Record<string, unknown>) => { const result = await api('/api/admin/server/downloads', { body }); if (!result.ok) window.alert(result.error); onChange() }
  const finished = jobs.some((job) => ['done', 'failed', 'cancelled'].includes(job.status))
  return <section className="sa-card dl-jobs">
    <header className="sa-card-head"><h2>کارها و دانلودها</h2>{finished && <button type="button" className="sa-link" onClick={() => void act({ op: 'jobs-clear' })}>پاک کردن تمام‌شده‌ها</button>}</header>
    {!jobs.length && <p className="sa-empty">هنوز کاری نیست. یک نشانی دانلود وارد کنید.</p>}
    <ul>{jobs.map((job) => {
      const percent = job.total ? Math.min(100, Math.round((job.received / job.total) * 100)) : null
      const remaining = job.status === 'running' && job.total && job.speed > 0 && job.kind === 'fetch' ? Math.ceil((job.total - job.received) / job.speed) : null
      const [label, tone] = STATUS[job.status]
      return <li key={job.id} className={`dl-job is-${job.status}`}>
        <div className="dl-job-head">
          <span className={`sa-state ${tone}`}>{label}</span>
          <b dir="auto" title={job.url || job.title}>{job.name || job.title}</b>
        </div>
        <small className="dl-job-meta">{job.label}{job.phase && job.status === 'running' ? ` · ${PHASE[job.phase] || job.phase}` : ''}{job.kind === 'fetch' && job.url ? <> · <bdi dir="ltr">{(() => { try { return new URL(job.url).hostname } catch { return '' } })()}</bdi></> : ''}</small>
        {(job.status === 'running' || job.status === 'queued') && <div className="dl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-label={`پیشرفت ${job.name}`}><i className={percent === null ? 'is-indeterminate' : ''} style={percent === null ? undefined : { inlineSize: `${percent}%` }} /></div>}
        {job.status === 'running' && <small className="dl-job-meta num">
          {percent !== null ? `${fa(percent)}٪` : ''}{['fetch', 'transfer'].includes(job.kind) ? ` · ${bytes(job.received)}${job.total ? ` از ${bytes(job.total)}` : ''}` : ''}{job.speed > 0 && ['fetch', 'transfer'].includes(job.kind) ? ` · ${bytes(job.speed)}/ث` : ''}{remaining ? ` · ${seconds(remaining)} مانده` : ''}
        </small>}
        {job.status === 'done' && job.result && <small className="dl-job-meta">ذخیره در <bdi dir="ltr">{job.result}</bdi>{job.total && ['fetch', 'transfer'].includes(job.kind) ? ` · ${bytes(job.total)}` : ''}</small>}
        {job.status === 'failed' && <small className="dl-job-error">{job.error}</small>}
        <div className="dl-job-actions">
          {(job.status === 'running' || job.status === 'queued') && <button type="button" className="sa-link is-danger" onClick={() => void act({ op: 'job-cancel', id: job.id })}>لغو</button>}
          {(job.status === 'failed' || job.status === 'cancelled') && <button type="button" className="sa-link" onClick={() => void act({ op: 'job-retry', id: job.id })}>تلاش دوباره</button>}
          <small>{faDate(job.createdAt, true)}</small>
        </div>
      </li>
    })}</ul>
  </section>
}

// ------------------------------------------------------------------ page

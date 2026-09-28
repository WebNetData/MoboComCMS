import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { Fragment } from 'react'
import { requireModule } from '@/extensions/server/modules'
import { bestIndex, compareItems, parseCompareRefs } from '@/modules/compare/server/compare'
import MediaShell from '@/components/media/MediaShell'
import { CompareRedirect, DiffToggle, RemoveColumn } from '@/components/engage/CompareControls'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ items?: string }> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const data = await compareItems(parseCompareRefs((await searchParams).items))
  return { title: data ? `مقایسهٔ ${data.items.map((item) => item.title).join(' با ')}` : 'مقایسه', robots: { index: false, follow: true } }
}

export default async function ComparePage({ searchParams }: Props) {
  await requireModule('compare')
  const { items } = await searchParams
  const data = items ? await compareItems(parseCompareRefs(items)) : null
  const keys = data?.items.map((item) => item.key) || []

  return (
    <MediaShell section="compare">
      <div className="container cmp-page">
        <header className="sr-head">
          <h1>{data ? `مقایسهٔ ${data.label}` : 'مقایسه'}</h1>
          {data && <p className="muted">{data.items.length.toLocaleString('fa-IR')} مورد کنار هم. بهترین مقدار هر ردیف عددی سبز شده است.</p>}
        </header>

        {!items && <CompareRedirect />}
        {!data ? (
          <div className="sr-empty">
            <span aria-hidden="true">⚖</span>
            <h2>چیزی برای مقایسه انتخاب نشده</h2>
            <p className="muted">در صفحهٔ هر نرم‌افزار، بازی، فیلم یا محصول روی «⚖ افزودن به مقایسه» بزنید؛ تا ۴ مورد هم‌نوع را می‌توانید کنار هم ببینید.</p>
            <div className="sr-chips"><Link href="/software">نرم‌افزار</Link><Link href="/games">بازی</Link><Link href="/cinema">فیلم و سریال</Link><Link href="/products">فروشگاه</Link></div>
          </div>
        ) : (
          <>
            <div className="cmp-toolbar"><DiffToggle />{data.items.length < 4 && <span className="muted">می‌توانید {(4 - data.items.length).toLocaleString('fa-IR')} مورد دیگر اضافه کنید.</span>}</div>
            <div className="cmp-scroll" tabIndex={0} role="region" aria-label="جدول مقایسه">
              <table className="cmp-table" style={{ ['--cols' as string]: data.items.length }}>
                <thead>
                  <tr>
                    <th scope="col" className="cmp-corner"><span className="sr-only">ویژگی</span></th>
                    {data.items.map((item) => (
                      <th key={item.key} scope="col">
                        <div className="cmp-head">
                          <RemoveColumn itemKey={item.key} keys={keys} />
                          <Link href={item.url} className="cmp-thumb">{item.image ? <img src={item.image} alt="" /> : <span aria-hidden="true">{item.title.slice(0, 1)}</span>}</Link>
                          <Link href={item.url} className="cmp-title"><bdi>{item.title}</bdi></Link>
                          {item.subtitle && <small>{item.subtitle}</small>}
                          {item.access === 'MEMBERS' && <span className="vip-chip is-small">♛ VIP</span>}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, index) => {
                    const best = bestIndex(row)
                    const same = row.values.every((value) => value === row.values[0])
                    const groupStart = row.group && row.group !== data.rows[index - 1]?.group
                    return (
                      <Fragment key={`${row.label}-${index}`}>
                        {groupStart && <tr className="cmp-group"><th colSpan={data.items.length + 1} scope="colgroup">{row.group}</th></tr>}
                        <tr className={same ? 'is-same' : ''}>
                          <th scope="row">{row.label}</th>
                          {row.values.map((value, i) => <td key={i} className={i === best ? 'is-best' : ''}><bdi>{value}</bdi>{i === best && <span className="sr-only"> (بهترین)</span>}</td>)}
                        </tr>
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </MediaShell>
  )
}

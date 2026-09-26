import { db } from '@/platform/database/prisma'
import { getSettings } from '@/modules/settings/server'
import { auditContent, metaDescription, wordCount, type AuditIssue, type AuditItem } from '@/modules/seo/domain/seo'
import { getSeoConfig } from './config'
import { indexNowLog } from './indexnow'

export type SiteCheck = { id: string; ok: boolean; severity: 'error' | 'warning' | 'info'; fa: string; hint: string }

/** Site-wide readiness checks plus per-item content issues. */
export async function runSeoAudit() {
  const [settings, config, log] = await Promise.all([getSettings().catch(() => ({} as Record<string, string>)), getSeoConfig(), indexNowLog()])
  const base = String(settings.siteUrl || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '')
  const [posts, products, software, pages, games, titles] = await Promise.all([
    db.post.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, title: true, excerpt: true, content: true, cover: true }, take: 2000 }).catch(() => []),
    db.product.findMany({ where: { active: true }, select: { slug: true, name: true, description: true, image: true }, take: 2000 }).catch(() => []),
    db.softwareTitle.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, title: true, summary: true, icon: true, cover: true }, take: 2000 }).catch(() => []),
    db.page.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, title: true, content: true }, take: 500 }).catch(() => []),
    db.gameTitle.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, title: true, summary: true, cover: true }, take: 2000 }).catch(() => []),
    db.cinemaTitle.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, title: true, summary: true, poster: true }, take: 2000 }).catch(() => []),
  ])
  const items: AuditItem[] = [
    ...posts.map((row) => ({ kind: 'post', title: row.title, path: `/blog/${row.slug}`, description: row.excerpt || metaDescription(row.content), image: row.cover, words: wordCount(row.content) })),
    ...products.map((row) => ({ kind: 'product', title: row.name, path: `/products/${row.slug}`, description: metaDescription(row.description), image: row.image, words: wordCount(row.description) })),
    ...software.map((row) => ({ kind: 'software', title: row.title, path: `/software/${row.slug}`, description: row.summary, image: row.icon || row.cover, words: 0 })),
    ...pages.map((row) => ({ kind: 'page', title: row.title, path: `/p/${row.slug}`, description: metaDescription(row.content), image: 'n/a', words: wordCount(row.content) })),
    ...games.map((row) => ({ kind: 'game', title: row.title, path: `/games/${row.slug}`, description: row.summary, image: row.cover, words: 0 })),
    ...titles.map((row) => ({ kind: 'cinema', title: row.title, path: `/cinema/${row.slug}`, description: row.summary, image: row.poster, words: 0 })),
  ]
  const issues: AuditIssue[] = auditContent(items)
  const https = /^https:\/\//.test(base) && !/localhost|127\.0\.0\.1/.test(base)
  const lastSubmit = log[0]
  const checks: SiteCheck[] = [
    { id: 'https', ok: https, severity: 'error', fa: 'نشانی سایت با https و دامنهٔ واقعی تنظیم شده است', hint: 'در تنظیمات عمومی، «نشانی سایت» را مثل https://mobocom.ir وارد کنید.' },
    { id: 'description', ok: config.description.length >= 70, severity: 'warning', fa: 'توضیح اصلی سایت (۷۰ تا ۱۶۰ حرف) نوشته شده است', hint: 'در همین صفحه «توضیحات سایت» را کامل کنید.' },
    { id: 'google', ok: !!config.verification.google, severity: 'warning', fa: 'مالکیت در Google Search Console تأیید شده است', hint: 'در search.google.com/search-console روش «HTML tag» را انتخاب و کد را اینجا وارد کنید، سپس sitemap.xml را ثبت کنید.' },
    { id: 'bing', ok: !!config.verification.bing, severity: 'warning', fa: 'مالکیت در Bing Webmaster تأیید شده است (Bing منبع ChatGPT و Copilot است)', hint: 'در bing.com/webmasters سایت را اضافه کنید؛ می‌توانید از Search Console وارد کنید.' },
    { id: 'logo', ok: !!config.logo, severity: 'info', fa: 'لوگوی سازمان برای نتایج گوگل تعیین شده است', hint: 'یک تصویر مربعی (حداقل ۱۱۲×۱۱۲ پیکسل) آپلود و نشانی آن را وارد کنید.' },
    { id: 'social', ok: config.sameAs.length > 0, severity: 'info', fa: 'صفحه‌های رسمی شبکه‌های اجتماعی معرفی شده‌اند', hint: 'نشانی اینستاگرام، تلگرام، لینکدین و… را وارد کنید تا گوگل برند را بشناسد.' },
    { id: 'indexnow', ok: config.indexNow.enabled && (!lastSubmit || (lastSubmit.status >= 200 && lastSubmit.status < 300)), severity: 'warning', fa: 'IndexNow فعال است و آخرین ارسال موفق بوده', hint: 'اگر خطا دارد، مطمئن شوید سایت روی https در دسترس است.' },
    { id: 'ai', ok: config.allowAiCrawlers, severity: 'info', fa: 'دستیارهای هوش مصنوعی اجازهٔ خواندن صفحه‌های عمومی را دارند', hint: 'برای دیده‌شدن در پاسخ‌های ChatGPT، Claude، Perplexity و Gemini این گزینه را روشن نگه دارید.' },
  ]
  const score = Math.max(0, Math.round(100 - checks.filter((c) => !c.ok).reduce((sum, c) => sum + (c.severity === 'error' ? 20 : c.severity === 'warning' ? 8 : 3), 0) - Math.min(30, issues.filter((i) => i.severity === 'error').length * 2 + issues.filter((i) => i.severity === 'warning').length * 0.5)))
  return { base, score, checks, issues: issues.slice(0, 300), totals: { items: items.length, errors: issues.filter((i) => i.severity === 'error').length, warnings: issues.filter((i) => i.severity === 'warning').length }, log: log.slice(0, 10) }
}

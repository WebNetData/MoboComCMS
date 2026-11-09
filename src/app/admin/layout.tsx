'use client'

import '../admin-tidy.css'
import '../admin-areas.css'

import { useEffect, useRef, useState } from 'react'
import AdminWorkspace from '@/components/admin/Workspace'
import { AiPageProvider } from '@/components/admin/ai/PageContext'
import dynamic from 'next/dynamic'
import { useSession, signOut } from 'next-auth/react'
import Link from '@/components/AppLink'
import { usePathname, useSearchParams } from '@/platform/routing/navigation'
import { useI18n } from '@/i18n/LocaleProvider'
import ThemeLangControls from '@/components/ThemeLangControls'
import { getCookie } from '@/platform/browser/preferences'
import { useSite } from '@/components/site/SiteProvider'
import Icon from '@/components/site/Icon'
import BrandMark from '@/components/BrandMark'
import BrandLockup, { Wordmark } from '@/components/site/SiteLogo'
import { QUEUE_PERMISSIONS } from '@/modules/moderation/domain/queue'
import ShellNav from '@/components/shell/ShellNav'
import { ControlNavigationProvider } from '@/components/admin/navigation/ControlNavigation'
import AreaRail from '@/components/admin/navigation/AreaRail'
import { CONTROL_AREAS, controlAreas, searchControlGroups, type ControlGroup } from '@/components/admin/navigation/groups'
const AiWorkspace = dynamic(() => import('@/components/admin/ai/Workspace'))

interface NavItem {
  href: string
  label: string
  icon: string
  perm?: string | string[]
  exact?: boolean
  heading?: string
  /** An extension's link that joins a core group. */
  group?: string
}

interface NavGroup {
  id: string
  title: string
  icon: string
  /** The area of the admin the group belongs to (see CONTROL_AREAS). */
  area: string
  /** Its place in the area, on the same scale as a module's adminMenu.order. */
  order: number
  flat?: boolean
  items: NavItem[]
}
type SectionMenu = { id: string; title: string; titleEn: string; icon: string; area?: string; order?: number; items: { href: string; label: string; labelEn?: string; icon?: string; permissions?: string[]; exact?: boolean; heading?: string }[] }

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const site = useSite()
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const search = useSearchParams()
  const { t, locale } = useI18n()
  const theme = getCookie('theme') || 'dark'
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [navQuery, setNavQuery] = useState('')
  const [pickedArea, setPickedArea] = useState('')
  useEffect(() => { setExpanded({}); setNavQuery(''); setPickedArea('') }, [pathname])
  const menuButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        menuButton.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (status === 'unauthenticated') window.location.href = '/login?next=/admin'
  }, [status])

  const s: any = session as any
  const [me, setMe] = useState<{ role: string; roleId: number | null; permissions: string[] | null } | null>(null)
  const [extensionNav, setExtensionNav] = useState<NavItem[]>([])
  const [sectionNav, setSectionNav] = useState<NavGroup[]>([])
  const [disabledPaths, setDisabledPaths] = useState<string[]>([])
  const [navVersion, setNavVersion] = useState(0)
  const [navState, setNavState] = useState<'loading' | 'ready' | 'failed'>('loading')
  useEffect(() => {
    const refresh = () => setNavVersion(v => v + 1)
    window.addEventListener('happ:modules-changed', refresh)
    return () => window.removeEventListener('happ:modules-changed', refresh)
  }, [])

  // permissions are resolved server-side so role edits apply without re-login
  useEffect(() => {
    if (status !== 'authenticated') return
    const controller = new AbortController()
    setNavState('loading')
    void Promise.all([
      fetch('/api/admin/extensions/navigation', { signal: controller.signal, cache: 'no-store' }),
      fetch('/api/me', { signal: controller.signal, cache: 'no-store' }),
    ]).then(async ([navigation, account]) => {
      if (account.status === 401) { void signOut({ callbackUrl: '/login?next=/admin' }); return }
      if (!account.ok) throw new Error('Admin identity unavailable')
      const data = await account.json()
      if (controller.signal.aborted) return
      // Staff 2-step policy: set it up first (the admin API refuses until then).
      if (data?.needsTwoFactor) { window.location.href = '/dashboard/profile?require2fa=1#two-factor'; return }
      setMe(data)
      if (!navigation.ok) throw new Error('Admin navigation unavailable')
      const d = await navigation.json()
      if (!Array.isArray(d?.items) || !Array.isArray(d?.sections) || !Array.isArray(d?.disabledPaths)) throw new Error('Invalid Admin navigation')
      if (controller.signal.aborted) return
      setExtensionNav((d?.items || []).map((item: any) => ({ href: item.href, label: locale === 'fa' ? item.label : item.labelEn || item.label, icon: item.icon || 'grid', perm: item.permission, group: item.group })))
      setSectionNav((Array.isArray(d?.sections) ? d.sections as SectionMenu[] : []).map((menu) => ({
        id: `section:${menu.id}`,
        area: menu.area || 'system',
        order: menu.order ?? 100,
        title: locale === 'fa' ? menu.title : menu.titleEn || menu.title,
        icon: menu.icon || 'grid',
        items: menu.items.map((item) => ({ href: item.href, label: locale === 'fa' ? item.label : item.labelEn || item.label, icon: item.icon || 'grid', perm: item.permissions && item.permissions.length ? [...item.permissions] : undefined, exact: item.exact, heading: item.heading })),
      })))
      setDisabledPaths(Array.isArray(d?.disabledPaths) ? d.disabledPaths.filter((p: unknown) => typeof p === 'string') : [])
      setNavState('ready')
    }).catch(() => { if (!controller.signal.aborted) setNavState('failed') })
    return () => controller.abort()
  }, [locale, status, navVersion])

  const role = me?.role ?? s?.user?.role ?? s?.role
  const perms: string[] | null = me ? me.permissions : s?.user?.permissions ?? s?.permissions ?? null
  const roleId = me ? me.roleId : s?.user?.roleId ?? s?.roleId ?? null
  const isAdmin = role === 'ADMIN'

  useEffect(() => {
    if (status === 'authenticated' && !isAdmin) window.location.href = '/dashboard'
  }, [status, isAdmin])

  const moduleOff = (href: string) => disabledPaths.some(prefix => href === prefix || href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}?`))
  function allowed(perm?: string | string[]) {
    if (!perm) return true
    if (roleId == null) return true // legacy super admin
    return (Array.isArray(perm) ? perm : [perm]).some(p => !!perms?.includes(p))
  }

  const L = (fa: string, en: string) => locale === 'fa' ? fa : en
  // The admin menu by area: what a thing is for decides where it sits, not who built it. Each feature module names
  // its own area in its manifest. Addresses and permissions are untouched; this is only where a link sits.
  const joining = (group: string) => extensionNav.filter(item => item.group === group)
  const CORE: NavGroup[] = [
    { id: 'home', flat: true, area: 'home', order: 1, title: t.dashboard, icon: 'home', items: [{ href: '/admin', label: t.dashboard, icon: 'home', exact: true }] },
    { id: 'analytics', flat: true, area: 'home', order: 2, title: L('آمار بازدید و فروش', 'Analytics'), icon: 'chart', items: [{ href: '/admin/analytics', label: L('آمار بازدید و فروش', 'Analytics'), icon: 'chart', perm: ['analytics.view', 'dashboard.view'] }] },
    { id: 'moderation', flat: true, area: 'home', order: 3, title: L('صف بررسی', 'Moderation queue'), icon: 'flag', items: [{ href: '/admin/moderation', label: L('صف بررسی', 'Moderation queue'), icon: 'flag', perm: [...QUEUE_PERMISSIONS] }] },
    { id: 'directory', flat: true, area: 'home', order: 4, title: L('همهٔ ابزارها', 'All tools'), icon: 'grid', items: [{ href: '/admin/site-management', label: L('همهٔ ابزارها', 'All tools'), icon: 'grid' }] },

    { id: 'content', area: 'content', order: 200, title: L('ابزارهای مشترک', 'Shared tools'), icon: 'layers', items: [
      { href: '/admin/media', label: L('کتابخانهٔ رسانه', 'Media library'), icon: 'image', perm: ['media.manage', 'settings.manage', 'prompts.manage', 'cms.posts', 'cms.pages', 'cms.products', 'music.manage', 'cinema.manage', 'games.manage', 'software.manage', 'journal.author', 'music.author', 'cinema.author', 'games.author', 'software.author', 'prompts.author'] },
      { href: '/admin/taxonomy', label: L('دسته‌بندی و زیردسته‌ها', 'Categories'), icon: 'grid', perm: ['software.manage', 'games.manage', 'music.manage', 'cinema.manage'] },
      { href: '/admin/collections', label: L('مجموعه‌های منتخب', 'Editorial collections'), icon: 'grid', perm: ['cms.posts', 'cms.pages', 'cms.products', 'music.manage', 'cinema.manage', 'games.manage', 'software.manage', 'prompts.manage'] },
      { href: '/admin/celebrities', label: L('هنرمندان و چهره‌ها', 'Artists and people'), icon: 'users', perm: ['cinema.manage', 'music.manage'] },
      // Its address asks for both the games and the cinema permission, so a manager of one reaches it from neither menu.
      { href: '/admin/studios', label: L('سازندگان و ناشران', 'Studios and publishers'), icon: 'grid', perm: 'settings.manage' },
      { href: '/admin/images', label: L('بهینه‌سازی تصاویر', 'Image optimization'), icon: 'sparkles', perm: 'settings.manage' },
      { href: '/admin/watermark', label: L('واترمارک تصاویر', 'Image watermark'), icon: 'sparkles', perm: 'settings.manage' },
      { href: '/admin/downloads', label: L('محافظت از لینک دانلود', 'Download protection'), icon: 'shield', perm: ['downloads.manage', 'settings.manage'] },
      { href: '/admin/copyright', label: L('گزارش‌های حق نشر', 'Copyright reports'), icon: 'shield', perm: ['copyright.manage', 'settings.manage'] },
    ] },

    // AI has its own area; extensions add tools with group 'ai'. Addresses and permissions are the ones the AI APIs check.
    { id: 'ai-overview', flat: true, area: 'ai', order: 1, title: L('نمای کلی هوش مصنوعی', 'AI overview'), icon: 'sparkles', items: [
      { href: '/admin/ai/overview', label: L('نمای کلی هوش مصنوعی', 'AI overview'), icon: 'sparkles', perm: ['cms.posts', 'cms.pages', 'cms.products', 'forum.moderate', 'orders.manage', 'settings.manage'] },
    ] },
    { id: 'ai-tools', area: 'ai', order: 10, title: L('دستیارها و تولید', 'Assistants & generation'), icon: 'bolt', items: [
      { href: '/admin/ai', label: L('دستیار نویسندگی', 'Writing assistant'), icon: 'pen', perm: ['cms.posts', 'cms.products', 'forum.moderate', 'settings.manage'] },
      { href: '/admin/ai/operations', label: L('دستیار عملیاتی', 'Operational assistant'), icon: 'terminal', perm: ['cms.posts', 'cms.pages', 'cms.products', 'orders.manage', 'settings.manage'] },
      { href: '/admin/ai/production', label: L('تولید انبوه محتوا و تصویر', 'Bulk content & images'), icon: 'layers', perm: ['cms.posts', 'cms.pages', 'cms.products'] },
      ...joining('ai'),
    ] },
    { id: 'ai-business', area: 'ai', order: 15, title: L('فروش و مشتری', 'Sales & customers'), icon: 'chart', items: [
      { href: '/admin/ai/sales', label: L('فروش و CRM هوشمند', 'Smart sales & CRM'), icon: 'chart', perm: ['automation.manage', 'orders.manage'] },
    ] },
    { id: 'ai-platform', area: 'ai', order: 20, title: L('سرویس‌ها و پایش', 'Providers & monitoring'), icon: 'cpu', items: [
      { href: '/admin/ai?tab=settings', label: L('اتصال سرویس‌ها و کلیدها', 'Providers & keys'), icon: 'key', perm: 'settings.manage' },
      { href: '/admin/ai/site-operations', label: L('دستیار عملیات سایت', 'Site operations assistant'), icon: 'lifebuoy', perm: 'settings.manage' },
      { href: '/admin/ai/monitoring', label: L('پایش و مصرف', 'Monitoring & usage'), icon: 'activity', perm: 'settings.manage' },
    ] },

    { id: 'reviews', area: 'community', order: 200, title: L('نظرها و تجربه‌ها', 'Reviews & experiences'), icon: 'sparkles', items: [
      { href: '/admin/reviews', label: L('امتیازها و نظرها', 'Ratings & reviews'), icon: 'sparkles', perm: ['reviews.moderate'] },
      { href: '/admin/businesses', label: L('تجربهٔ خرید و کسب‌وکارها', 'Business experiences'), icon: 'sparkles', perm: ['businesses.manage'] },
    ] },

    { id: 'orders', area: 'commerce', order: 90, title: L('سفارش‌های سایت', 'Site orders'), icon: 'grid', items: [
      { href: '/admin/orders', label: L('همهٔ سفارش‌ها', 'All orders'), icon: 'grid', perm: 'orders.manage' },
      { href: '/admin/operations', label: L('مرکز عملیات سفارش', 'Order operations'), icon: 'shield', perm: 'orders.manage' },
    ] },
    { id: 'vpn', area: 'commerce', order: 92, title: L('سرویس VPN', 'VPN service'), icon: 'globe', items: [
      { href: '/admin/plans', label: t.plansAdmin, icon: 'globe', perm: 'plans.manage' },
      { href: '/admin/service-offers', label: L('فروش حجمی', 'Volume offers'), icon: 'grid', perm: 'plans.manage' },
      { href: '/admin/trial', label: L('اکانت آزمایشی', 'Trial accounts'), icon: 'sparkles', perm: 'plans.manage' },
      { href: '/admin/subscriptions', label: t.subscriptions, icon: 'devices', perm: 'subs.manage' },
      { href: '/admin/panels', label: t.panels, icon: 'shield', perm: 'panels.manage' },
      { href: '/admin/happ', label: L('اتصال Happ', 'Happ connection'), icon: 'devices', perm: 'settings.manage' },
      { href: '/admin/connection-guide', label: L('راهنمای اتصال', 'Connection guide'), icon: 'devices', perm: 'settings.manage' },
      ...joining('vpn'),
    ] },
    { id: 'services', area: 'commerce', order: 94, title: L('خدمات و نمایندگان', 'Services & resellers'), icon: 'bolt', items: [
      { href: '/admin/services', label: L('خدمات', 'Services'), icon: 'bolt', perm: ['cms.pages', 'forms.handle', 'orders.manage', 'cms.products'] },
      { href: '/admin/resellers', label: t.resellers, icon: 'globe', perm: 'resellers.manage' },
      { href: '/admin/reseller-sales', label: L('فروش نمایندگان', 'Reseller sales'), icon: 'wallet', perm: 'resellers.manage' },
    ] },

    { id: 'finance', area: 'finance', order: 10, title: t.finance, icon: 'wallet', items: [
      { href: '/admin/finance', label: t.financeAdmin, icon: 'wallet', perm: 'finance.manage' },
      { href: '/admin/invoices', label: t.invoicesAdmin, icon: 'wallet', perm: 'invoices.manage' },
      { href: '/admin/receipts', label: L('رسیدهای کارت به کارت', 'Transfer receipts'), icon: 'wallet', perm: 'invoices.manage' },
      { href: '/admin/payments', label: t.ledger, icon: 'wallet', perm: 'finance.manage' },
      { href: '/admin/expenses', label: t.expensesAdmin, icon: 'wallet', perm: 'finance.manage' },
    ] },
    { id: 'payment-setup', area: 'finance', order: 20, title: L('تنظیمات پرداخت', 'Payment setup'), icon: 'sliders', items: [
      { href: '/admin/gateways', label: t.gatewaysAdmin, icon: 'wallet', perm: 'gateways.manage' },
      { href: '/admin/bank-accounts', label: L('حساب‌های بانکی', 'Bank accounts'), icon: 'wallet', perm: 'gateways.manage' },
      { href: '/admin/invoice-profile', label: L('مشخصات صورتحساب رسمی', 'Official invoice profile'), icon: 'sliders', perm: ['invoices.manage', 'settings.manage'] },
    ] },

    { id: 'people', area: 'people', order: 10, title: L('کاربران', 'Users'), icon: 'users', items: [
      { href: '/admin/users', label: t.customers, icon: 'devices', perm: 'users.manage' },
      { href: '/admin/user-groups', label: L('گروه‌های کاربری', 'User groups'), icon: 'devices', perm: 'users.manage' },
      { href: '/admin/profile-fields', label: L('فیلدهای ثبت‌نام و مشخصات', 'Registration fields'), icon: 'sliders', perm: ['users.manage', 'settings.manage'] },
    ] },
    { id: 'team', area: 'people', order: 20, title: L('تیم و دسترسی‌ها', 'Team & access'), icon: 'shield', items: [
      { href: '/admin/section-managers', label: L('مدیران و نویسندگان بخش‌ها', 'Section managers and authors'), icon: 'shield', perm: 'roles.manage' },
      { href: '/admin/roles', label: t.rolesPermissions, icon: 'shield', perm: 'roles.manage' },
    ] },
    { id: 'support', area: 'people', order: 30, title: L('پشتیبانی', 'Support'), icon: 'chat', items: [
      { href: '/admin/tickets', label: t.tickets, icon: 'chat', perm: 'tickets.handle' },
      { href: '/admin/ticket-departments', label: L('دپارتمان‌های تیکت', 'Ticket departments'), icon: 'sliders', perm: 'tickets.departments.manage' },
      { href: '/admin/incidents', label: L('وضعیت و اختلال سرویس', 'Service incidents'), icon: 'shield', perm: 'tickets.handle' },
    ] },

    { id: 'seo', area: 'marketing', order: 10, title: L('مرکز سئو', 'SEO center'), icon: 'globe', items: [
      { href: '/admin/seo', label: L('مرکز سئو', 'SEO center'), icon: 'globe', perm: 'settings.manage' },
    ] },
    // Discounts and referrals serve the shop, VIP and VPN alike.
    { id: 'offers', area: 'marketing', order: 20, title: L('تخفیف و معرفی', 'Offers & referrals'), icon: 'bolt', items: [
      { href: '/admin/promotions', label: L('کدهای تخفیف', 'Discount codes'), icon: 'bolt', perm: 'plans.manage' },
      { href: '/admin/referrals', label: L('سامانه معرفی', 'Referrals'), icon: 'devices', perm: 'settings.manage' },
    ] },
    { id: 'messages', area: 'marketing', order: 30, title: L('پیام‌رسانی', 'Messaging'), icon: 'chat', items: [
      { href: '/admin/newsletter', label: L('خبرنامه و کمپین ایمیلی', 'Newsletter & campaigns'), icon: 'chat', perm: 'settings.manage' },
      { href: '/admin/notifications', label: L('اعلان‌های کاربران', 'Member notifications'), icon: 'bolt', perm: 'settings.manage' },
      { href: '/admin/push', label: L('اعلان مرورگر', 'Web push'), icon: 'bolt', perm: ['push.manage', 'settings.manage'] },
      { href: '/admin/social', label: L('انتشار در تلگرام و اینستاگرام', 'Social auto-publish'), icon: 'chat', perm: ['social.manage', 'settings.manage'] },
    ] },

    { id: 'design', area: 'website', order: 10, title: L('ظاهر و برند', 'Design & brand'), icon: 'palette', items: [
      { href: '/admin/studio', label: L('صفحه اصلی و ظاهر', 'Homepage & design'), icon: 'sliders', perm: 'settings.manage' },
      { href: '/admin/homepage', label: L('طرح صفحهٔ اول', 'Home page designs'), icon: 'home', perm: 'settings.manage' },
      { href: '/admin/branding', label: L('لوگو و هویت برند', 'Logo & brand'), icon: 'image', perm: 'settings.manage' },
      { href: '/admin/menus', label: L('مدیریت منوها', 'Menus'), icon: 'layout', perm: 'settings.manage' },
      { href: '/admin/custom-code', label: L('کد سفارشی سایت', 'Custom site code'), icon: 'code', perm: 'settings.manage' },
      { href: '/admin/design-studio', label: L('استودیوی طراحی', 'Design studio'), icon: 'grid', perm: ['cms.pages', 'cms.posts', 'cms.products', 'settings.manage'] },
    ] },
    { id: 'pages', area: 'website', order: 20, title: L('صفحه‌ها و فرم‌ها', 'Pages & forms'), icon: 'layout', items: [
      { href: '/admin/pages', label: t.pageBuilder, icon: 'grid', perm: 'cms.pages' },
      { href: '/admin/editor', label: locale === 'fa' ? 'ویرایشگر بلوکی' : 'Block editor', icon: 'layout', perm: 'cms.pages' },
      { href: '/admin/forms', label: L('فرم‌ها و پاسخ‌ها', 'Forms & submissions'), icon: 'chat', perm: ['cms.pages', 'forms.handle'] },
    ] },
    { id: 'contact', area: 'website', order: 30, title: L('تماس و اعتماد', 'Contact & trust'), icon: 'pin', items: [
      { href: '/admin/studio?tab=design#contact-information', label: L('اطلاعات تماس و نقشه', 'Contact details & map'), icon: 'pin', perm: 'settings.manage' },
      { href: '/admin/locations', label: t.mapLocations, icon: 'globe', perm: 'settings.manage' },
      { href: '/admin/trust-seals', label: L('نمادهای اعتماد', 'Trust seals'), icon: 'shield', perm: 'settings.manage' },
    ] },

    { id: 'settings', area: 'system', order: 10, title: L('تنظیمات و نگهداری', 'Settings & upkeep'), icon: 'sliders', items: [
      { href: '/admin/settings', label: L('تنظیمات عمومی و امکانات', 'General settings & features'), icon: 'sliders', perm: 'settings.manage' },
      { href: '/admin/sections', label: L('همهٔ بخش‌ها و آدرس‌ها', 'All sections & addresses'), icon: 'grid', perm: 'settings.manage', exact: true },
      { href: '/admin/permalinks', label: L('پیوندهای یکتا', 'Permalinks'), icon: 'link', perm: 'settings.manage' },
      { href: '/admin/maintenance', label: L('حالت تعمیر سایت و بخش‌ها', 'Maintenance mode'), icon: 'shield', perm: 'settings.manage' },
      { href: '/admin/updates', label: L('به‌روزرسانی سایت', 'Site updates'), icon: 'sparkles', perm: 'settings.manage' },
      { href: '/admin/imports', label: L('ورود گروهی اطلاعات', 'Bulk import'), icon: 'grid', perm: 'imports.manage' },
      { href: '/admin/crm/engagement', label: L('ارتباط با مشتری', 'Customer engagement'), icon: 'mail', perm: 'automation.manage' },
      { href: '/admin/automation', label: L('اتوماسیون', 'Automation'), icon: 'sparkles', perm: 'automation.manage' },
    ] },
    { id: 'health', area: 'system', order: 20, title: L('سلامت و پایش', 'Health & monitoring'), icon: 'chart', items: [
      { href: '/admin/monitoring', label: L('پایش سرعت و سلامت سرور', 'Performance & health'), icon: 'shield', perm: 'settings.manage' },
      ...joining('health'),
    ] },
    { id: 'access', area: 'system', order: 30, title: L('امنیت', 'Security'), icon: 'shield', items: [
      { href: '/admin/security', label: L('امنیت ورود و بازیابی رمز', 'Sign-in security'), icon: 'shield', perm: 'settings.manage' },
      { href: '/admin/audit', label: L('گزارش فعالیت‌ها', 'Audit log'), icon: 'sliders', perm: 'audit.view' },
    ] },
    { id: 'channels', area: 'system', order: 40, title: L('ایمیل، پیامک و اتصال‌ها', 'Email, SMS & connections'), icon: 'plug', items: [
      { href: '/admin/email', label: L('ایمیل سایت', 'Site email'), icon: 'chat', perm: 'settings.manage' },
      { href: '/admin/sms', label: L('پنل پیامک', 'SMS'), icon: 'chat', perm: 'settings.manage' },
      { href: '/admin/telegram', label: L('ربات و مینی‌اپ', 'Telegram & Mini App'), icon: 'chat', perm: 'settings.manage' },
    ] },
    { id: 'extensions', area: 'system', order: 50, title: L('افزونه‌ها و ماژول‌ها', 'Extensions & modules'), icon: 'box', items: [
      { href: '/admin/extensions', label: L('افزونه‌ها و ماژول‌ها', 'Extensions & modules'), icon: 'grid', perm: 'settings.manage', exact: true },
      { href: '/admin/extensions/editor', label: L('ویرایشگر افزونه و قالب', 'Plugin & theme editor'), icon: 'sliders', perm: 'settings.manage' },
      ...extensionNav.filter(item => !item.group),
    ] },
  ]
  // Area by area, each in its own order. The part is the area's name, for the search results and the tools directory.
  const GROUPS = CONTROL_AREAS.flatMap(area => [...CORE, ...sectionNav].filter(group => group.area === area.id).sort((a, b) => a.order - b.order).map(group => ({ ...group, part: area.id === 'home' ? '' : L(area.title, area.titleEn) })))

  // Keep editors mounted while NextAuth refreshes an existing session.
  if (!session || !isAdmin) {
    return <div className="container py-20 text-center muted">{t.loading}</div>
  }

  const initial = (session?.user?.name || session?.user?.email || '?').charAt(0).toUpperCase()
  const matches = (href: string, exact?: boolean) => {
    const [path, query] = href.split('?')
    if (query) return pathname === path && new URLSearchParams(query).get('tab') === search.get('tab') && (new URLSearchParams(query).get('tax') ?? search.get('tax')) === search.get('tax')
    if (path === pathname && search.get('tab') && sectionNav.some((group) => group.items.some((item) => item.href.startsWith(`${path}?`)))) return false
    return exact ? pathname === path : pathname.startsWith(path)
  }

  // Mounted once (the navigation itself is rendered twice, for the side and for the phone drawer).
  // A group left with one link for this person is drawn as that link.
  const controls: ControlGroup[] = navState === 'ready' ? GROUPS.flatMap(group => {
    const items = group.items.filter(item => allowed(item.perm) && !moduleOff(item.href))
    return items.length ? [{ ...group, items, flat: group.flat || items.length === 1 }] : []
  }) : []
  const workspace = <AdminWorkspace fa={locale === 'fa'} canGo={(href) => controls.some((group) => group.items.some((item) => item.href === href))} />
  // The deepest matching entry is the current page: it alone is marked, and it names the page in the top bar.
  const current = controls.flatMap(group => group.items.filter(item => matches(item.href, item.exact)).map(item => ({ ...item, inGroup: group }))).sort((a, b) => b.href.length - a.href.length)[0]
  const isOn = (href: string) => href === current?.href
  const areas = controlAreas(controls)
  const currentArea = areas.find(area => area.id === current?.inGroup.area)
  const shownArea = areas.find(area => area.id === pickedArea) || currentArea || areas[0]
  // One area at a time; the search box reaches every area, a part's name shown above its first remaining group.
  const query = navQuery.trim().toLowerCase()
  const visible = query ? searchControlGroups(controls, query) : shownArea?.groups ?? []
  const list = <>
    <label className="admin-nav-search"><span className="sr-only">{L('جست‌وجوی بخش مدیریت', 'Search admin sections')}</span><Icon name="search" size={16} /><input type="search" className="input" value={navQuery} placeholder={L('جست‌وجو در همهٔ بخش‌ها…', 'Find a section…')} onChange={e => setNavQuery(e.target.value)} /><kbd aria-hidden="true">/</kbd></label>
    {shownArea && !query && <div className="acn-head"><b>{L(shownArea.title, shownArea.titleEn)}</b><span>{L(shownArea.hint, shownArea.hintEn)}</span></div>}
    <div className="acn-groups" key={query ? 'search' : shownArea?.id}><ShellNav groups={visible} isOn={isOn} choice={expanded} onToggle={(id, open) => setExpanded(now => ({ ...now, [id]: open }))} onNavigate={() => setOpen(false)} openByDefault={visible.length <= 2} forceOpen={!!query} shown={open} /></div>
    {navState === 'failed' ? <button type="button" className="btn btn-ghost" onClick={() => setNavVersion(v => v + 1)}>{L('دریافت دوبارهٔ فهرست', 'Reload navigation')}</button> : !visible.length && <p className="ws-empty" role="status">{navState === 'loading' ? t.loading : L('بخشی با این نام پیدا نشد.', 'No section matches.')}</p>}
  </>
  const rail = <AreaRail areas={areas} active={query ? undefined : shownArea?.id} current={currentArea?.id} loading={navState === 'loading'} fa={locale === 'fa'} onPick={id => { setPickedArea(id); setNavQuery('') }} />
  const bodyClass = `acn-body ${navState === 'ready' && areas.length < 2 ? 'is-single' : ''}`

  return (
    <AiPageProvider key={`${s.user?.id || ''}:${pathname}`}>
    <div className="app-shell admin-shell">
      <div className="ai-workspace-entry"><AiWorkspace canGo={href => controls.some(group => group.items.some(item => item.href === href))} /></div>
      <aside className="side">
        <Link href="/admin" className="side-brand">
          <BrandLockup /> <span className="badge badge-purple">{t.admin}</span>
        </Link>

        {workspace}
        <div className={bodyClass}>
          {rail}
          <nav className="side-nav" aria-label={t.admin}>{list}</nav>
        </div>

        <div className="side-foot ws-foot">
          <Link href="/dashboard/profile" className="side-user">
            <span className="avatar" style={{ background: 'var(--primary)' }}>{session?.user?.image ? <img src={session.user.image} alt="" /> : initial}</span>
            <span className="min-w-0 ws-who">
              <span className="font-semibold text-sm truncate">{session?.user?.name || t.admin}</span>
              <span className="muted text-xs truncate" dir="ltr">{session?.user?.email}</span>
            </span>
          </Link>
          <button type="button" onClick={() => signOut({ callbackUrl: '/' })} className="ws-out" aria-label={t.logout} title={t.logout}><Icon name="logout" size={18} /></button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <div className="mobile-bar">
          <Link href="/admin" className="side-brand" style={{ padding: 0 }} aria-label={`${site.brand} — ${t.admin}`}>
            {site.wordmark ? <Wordmark height={26} /> : <span className="brand-mark"><BrandMark/></span>} <span className="badge badge-purple">{t.admin}</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeLangControls locale={locale} theme={theme} />
            <button ref={menuButton} className="icon-btn" aria-label={locale === 'fa' ? (open ? 'بستن منو' : 'باز کردن منو') : (open ? 'Close menu' : 'Open menu')} aria-expanded={open} aria-controls="admin-mobile-navigation" onClick={() => setOpen((v) => !v)}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d={open ? 'M6 6l12 12M6 18 18 6' : 'M4 6h16M4 12h16M4 18h16'} /></svg></button>
          </div>
        </div>
        <nav id="admin-mobile-navigation" className="mobile-drawer" hidden={!open} aria-label={t.admin}><div className={bodyClass}>{rail}<div className="acn-column">{list}</div></div><button onClick={() => signOut({ callbackUrl: '/' })} className="side-link mobile-logout">{t.logout}</button></nav>

        <header className="dash-top">
          <nav className="dash-crumbs" aria-label={L('مسیر صفحه', 'Breadcrumb')}>
            <Link href="/admin">{t.admin}</Link>
            {current && current.href !== '/admin' && <>{currentArea && currentArea.id !== 'home' && <><span aria-hidden="true">/</span><span className="dash-crumb-group">{L(currentArea.title, currentArea.titleEn)}</span></>}{!current.inGroup.flat && <><span aria-hidden="true">/</span><span className="dash-crumb-group">{current.inGroup.title}</span></>}<span aria-hidden="true">/</span><b aria-current="page">{current.label}</b></>}
          </nav>
          <div className="dash-top-actions">
            <Link href="/" target="_blank" rel="noopener noreferrer" className="dash-top-link"><Icon name="external" size={16} /> {L('مشاهدهٔ سایت', 'View site')}</Link>
            <Link href="/dashboard" className="dash-top-link"><Icon name="user" size={16} /> {L('حساب من', 'My account')}</Link>
            <ThemeLangControls locale={locale} theme={theme} />
          </div>
        </header>
        <main className="app-main"><ControlNavigationProvider value={{ groups: controls, loading: navState === 'loading', failed: navState === 'failed', retry: () => setNavVersion(v => v + 1) }}>{moduleOff(pathname) ? <div className="card module-off-card">
          <span className="section-kicker">{L('بخش خاموش', 'Module disabled')}</span>
          <h1 className="h2">{L('این بخش غیرفعال است', 'This section is turned off')}</h1>
          <p className="muted">{L('ماژول مربوط به این صفحه در «افزونه‌ها و ماژول‌ها» خاموش شده است. داده‌ها حذف نشده‌اند و با فعال‌سازی دوباره برمی‌گردند.', 'Its feature module is disabled in Extensions & modules. Nothing was deleted — turning it back on restores everything.')}</p>
          <Link className="btn btn-primary" href="/admin/extensions">{L('مدیریت ماژول‌ها', 'Manage modules')}</Link>
        </div> : children}</ControlNavigationProvider></main>
      </div>
    </div>
    </AiPageProvider>
  )
}

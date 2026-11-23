import type { SolutionPlan } from '@/modules/packages/domain/solution-plan'
import type { SolutionApplyReceipt } from '@/modules/packages/domain/solution-receipt'
import Link from '@/components/AppLink'

type Composition = NonNullable<SolutionPlan['composition']>
type NavigationItem = NonNullable<Composition['navigation']>['items'][number]
type ReceiptComposition = NonNullable<SolutionApplyReceipt['composition']>

const number = (value: number) => value.toLocaleString('fa-IR')

function MenuItems({ items }: { items: NavigationItem[] }) {
  const occurrences = new Map<string, number>()
  return <ul>{items.map(item => {
    const content = JSON.stringify(item), occurrence = (occurrences.get(content) ?? 0) + 1
    occurrences.set(content, occurrence)
    return <li key={`${content}:${occurrence}`}>
      <span>{item.label}</span> <bdi dir="ltr">{item.href}</bdi>
      {!!item.children?.length && <MenuItems items={item.children}/>}
    </li>
  })}</ul>
}

function resourceAction(action: 'create' | 'preserve' | 'removed', owned: boolean, completed: boolean) {
  if (action === 'create') return completed ? 'ایجاد شد' : 'ایجاد خواهد شد'
  if (action === 'removed') return 'قبلاً حذف شده؛ دوباره ساخته نمی‌شود'
  return owned ? 'پیش‌تر با این بسته ایجاد شده؛ حفظ می‌شود' : 'موجود است؛ حفظ می‌شود'
}

function ThemePart({ theme, completed }: { theme: NonNullable<Composition['theme']>; completed: boolean }) {
  return <section className="pm-solution-part">
      <h4>قالب سایت</h4>
      <div className="pm-solution-part-row"><strong>{theme.name}</strong><span>{theme.action === 'set' ? completed ? 'انتخاب شد' : 'انتخاب خواهد شد' : completed ? 'قالب موجود حفظ شد' : 'قالب فعلی حفظ می‌شود'}</span></div>
      {theme.action === 'preserve' && <p>قالب فعلی: <bdi dir="ltr">{theme.current}</bdi></p>}
    </section>
}

function NavigationPart({ navigation, completed }: { navigation: NonNullable<Composition['navigation']>; completed: boolean }) {
  return <section className="pm-solution-part">
      <h4>منوی اصلی</h4>
      <p>{navigation.action === 'set' ? completed ? 'منوی پیشنهادی برای سایت ثبت شد.' : 'منوی پیشنهادی برای سایت ثبت خواهد شد.' : completed ? 'منوی ذخیره‌شدهٔ سایت حفظ شد.' : 'منوی ذخیره‌شدهٔ سایت حفظ می‌شود.'}</p>
      {!!navigation.items.length && <details><summary>پیوندهای پیشنهادی ({number(navigation.items.length)})</summary><div className="pm-solution-menu"><MenuItems items={navigation.items}/></div></details>}
    </section>
}

function RolesPart({ roles, completed }: { roles: NonNullable<Composition['roles']>; completed: boolean }) {
  return <section className="pm-solution-part">
      <h4>نقش‌های آماده</h4>
      <p>نقش‌ها از الگوهای موجود ساخته می‌شوند؛ هیچ کاربری به آن‌ها اضافه نمی‌شود.</p>
      <ul className="pm-solution-composition-list">{roles.map(role => <li key={role.template}>
        <div className="pm-solution-part-row"><strong>{role.title}</strong><span>{resourceAction(role.action, role.owned, completed)}</span></div>
      </li>)}</ul>
      <Link className="pm-solution-manage" href="/admin/roles">مدیریت نقش‌ها</Link>
    </section>
}

function PagesPart({ pages, completed }: { pages: NonNullable<Composition['starterContent']>; completed: boolean }) {
  return <section className="pm-solution-part">
      <h4>محتوای اولیه</h4>
      <p>صفحه‌های تازه به‌صورت پیش‌نویس ساخته می‌شوند و انتشارشان با شماست.</p>
      <ul className="pm-solution-composition-list">{pages.map(page => <li key={page.key}>
        <div className="pm-solution-part-row"><strong>{page.title}</strong><span>{resourceAction(page.action, page.owned, completed)}</span></div>
        <small dir="ltr">{page.slug}</small>
        {page.pageId && page.action !== 'removed' && <Link className="pm-solution-manage" href={`/admin/pages?edit=${page.pageId}`}>ویرایش «{page.title}»</Link>}
      </li>)}</ul>
    </section>
}

/** The preview is a read-only projection of owner-validated changes. */
export function SolutionComposition({ composition, completed = false }: { composition: Composition; completed?: boolean }) {
  return <div className="pm-solution-composition" aria-label="جزئیات تکمیلی بسته">
    {composition.theme && <ThemePart theme={composition.theme} completed={completed}/>}
    {composition.navigation && <NavigationPart navigation={composition.navigation} completed={completed}/>}
    {!!composition.roles?.length && <RolesPart roles={composition.roles} completed={completed}/>}
    {!!composition.starterContent?.length && <PagesPart pages={composition.starterContent} completed={completed}/>}
  </div>
}

/** Numeric IDs reference canonical records; links use existing Admin routes and guards. */
export function SolutionCompositionReceipt({ composition }: { composition: ReceiptComposition }) {
  return <>
    {composition.theme && <div><dt>قالب</dt><dd><bdi dir="ltr">{composition.theme.id}</bdi> · {composition.theme.action === 'set' ? 'انتخاب شد' : 'مقدار موجود حفظ شد'}</dd></div>}
    {composition.navigation && <div><dt>منو</dt><dd>{composition.navigation.action === 'set' ? `${number(composition.navigation.count)} پیوند ثبت شد` : 'منوی موجود حفظ شد'}</dd></div>}
    {!!composition.roles?.length && <div><dt>نقش‌ها</dt><dd><Link href="/admin/roles">مشاهدهٔ {number(composition.roles.length)} نقش</Link></dd></div>}
    {!!composition.starterContent?.length && <div><dt>محتوای اولیه</dt><dd><Link href="/admin/pages">مشاهدهٔ {number(composition.starterContent.length)} صفحه</Link></dd></div>}
  </>
}

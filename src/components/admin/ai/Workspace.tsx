'use client'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { AI_WORKSPACE_EVENT, workspaceKey, workspacePath, type AiWorkspaceKind } from '@/modules/ai/domain/workspace'
import { useAiPageSelection } from './PageContext'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import './workspace.css'

const Operations = dynamic(() => import('./Operations'), { loading: () => <p role="status">در حال دریافت ابزارهای دستیار…</p> })
const PageAssistant = dynamic(() => import('./PageAssistant'), { loading: () => <p role="status">در حال دریافت دستیار صفحه…</p> })
export default function AiWorkspace({ canGo }: { canGo: (href: string) => boolean }) {
  const pathname = usePathname(), router = useRouter(), { data: session } = useSession()
  const target = useAiPageSelection(), enabled = useModuleEnabled('ai-assistant')
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false), [instruction, setInstruction] = useState(''), [error, setError] = useState(''), [content, setContent] = useState(false)
  const [mode, setMode] = useState<'chat' | 'tools'>('chat')
  const operations = canGo('/admin/ai/operations'), builder = operations && canGo('/admin/design-studio'), engineering = operations && canGo('/admin/server') && canGo('/admin/settings')
  const actor = String((session?.user as { id?: string | number } | undefined)?.id || '')
  useEffect(() => {
    const node = dialog.current
    if (open && node && !node.open) node.showModal()
    else if (!open && node?.open) node.close()
  }, [open])
  function close() { dialog.current?.close(); setOpen(false); trigger.current?.focus() }
  function handoff(kind: AiWorkspaceKind, href: string) {
    const source = workspacePath(pathname)
    if (!actor || !source || !instruction.trim()) return
    try { sessionStorage.setItem(workspaceKey(actor, kind), JSON.stringify({ actor, kind, source, instruction, expires: Date.now() + 10 * 60_000 })) }
    catch { setError('مرورگر انتقال متن را اجازه نداد؛ متن را کپی و در ابزار مقصد وارد کنید.'); return }
    window.dispatchEvent(new Event(AI_WORKSPACE_EVENT))
    close(); router.push(href)
  }
  if (!enabled || !canGo('/admin')) return null
  return <>
    <button ref={trigger} type="button" className="btn btn-primary" aria-haspopup="dialog" onClick={() => { setMode('chat'); setOpen(true) }}>دستیار هوش مصنوعی</button>
    <dialog ref={dialog} className="ai-workspace" aria-labelledby="ai-workspace-title" onCancel={event => { event.preventDefault(); close() }} onClose={() => setOpen(false)}>
      {open && <div className="ai-workspace-body" dir="rtl">
        <header><div><h2 id="ai-workspace-title">دستیار شما در همین بخش</h2><p>دربارهٔ صفحهٔ فعلی بپرسید یا درخواست را در ابزارهای موجود ادامه بدهید.</p></div><button type="button" className="btn btn-ghost btn-sm" onClick={close}>بستن دستیار</button></header>
        {(operations || builder || engineering) && <div className="ai-page-actions" role="group" aria-label="نوع کمک دستیار"><button className="btn btn-ghost" type="button" aria-pressed={mode === 'chat'} onClick={() => setMode('chat')}>گفتگو دربارهٔ این صفحه</button><button className="btn btn-ghost" type="button" aria-pressed={mode === 'tools'} onClick={() => setMode('tools')}>ابزارهای اجرایی</button></div>}
        {error && <p role="alert" className="error-text">{error}</p>}
        {mode === 'chat' ? <PageAssistant key={`${actor}:${pathname}:${target?.kind || ''}:${target?.id || ''}`} path={pathname} target={target} onUseInstruction={operations || builder || engineering ? text => { setInstruction(text); setContent(false); setMode('tools') } : undefined} /> : content && operations ? <Operations embedded initialInstruction={instruction} source={pathname} /> : <>
          <label className="studio-field"><span>چه کمکی می‌خواهید؟</span><textarea className="input" rows={4} maxLength={2600} value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="مثلاً صفحهٔ معرفی خدمات بساز؛ یا ظاهر این بخش را برای موبایل بهتر کن. اطلاعات واقعی و نتیجهٔ دلخواه را توضیح دهید." /></label>
          <p className="muted">رمز، کلید و اطلاعات خصوصی کاربران را ننویسید. بازکردن ابزار هیچ درخواست مدلی ارسال نمی‌کند.</p>
          <div className="ai-workspace-choices">
            {operations && <button type="button" className="card" onClick={() => setContent(true)}><strong>محتوا، محصول و سفارش</strong><span>ساخت صفحه و مطلب، محصول یا عملیات مجاز؛ ابتدا پیشنهاد و بررسی شما.</span></button>}
            {builder && <button type="button" className="card" disabled={!instruction.trim()} onClick={() => handoff('builder', pathname.startsWith('/admin/builder/') ? pathname : '/admin/design-studio?assistant=1')}><strong>طراحی صفحه و قالب</strong><span>متن به دستیار صفحه‌ساز منتقل می‌شود؛ طرح را زنده بررسی و روی پیش‌نویس اعمال کنید.</span></button>}
            {engineering && <button type="button" className="card" disabled={!instruction.trim()} onClick={() => handoff('engineering', '/admin/server/engineering')}><strong>تغییر قابلیت یا رفع مشکل سایت</strong><span>توسعه در محیط جدا و ساخت PR؛ انتشار روی سایت اصلی با تأیید شما.</span></button>}
          </div>
        </>}
        {mode === 'tools' && content && <button type="button" className="btn btn-ghost" onClick={() => setContent(false)}>بازگشت به انتخاب نوع کمک</button>}
      </div>}
    </dialog>
  </>
}

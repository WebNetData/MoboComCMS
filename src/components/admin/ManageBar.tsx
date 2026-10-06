'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

export type ManageLink = { href: string; label: string }

/**
 * The staff's way from a public page straight to managing what is on it: "edit this post", "edit this film".
 * Shown only to a signed-in staff member whose role holds one of the needed permissions; everyone else gets
 * nothing, not even the request. It decides what to show, never what is allowed: the panel and its API check
 * the permission again on their own.
 */
export default function ManageBar({ title, anyOf, links }: { title: string; anyOf: string[]; links: ManageLink[] }) {
  const { data: session, status } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const [allowed, setAllowed] = useState(false)
  const [open, setOpen] = useState(true)
  const needed = anyOf.join(',')

  useEffect(() => {
    if (status !== 'authenticated' || role !== 'ADMIN') { setAllowed(false); return }
    let live = true
    // Fresh from the server, as the panel reads it, so a role edited a minute ago already applies.
    fetch('/api/me').then((response) => response.ok ? response.json() : null).then((me: { role?: string; roleId?: number | null; permissions?: string[] | null } | null) => {
      if (!live || !me || me.role !== 'ADMIN') return
      // A staff account without a role is the full-access owner; with a role, one of the permissions is needed.
      setAllowed(me.roleId == null || needed.split(',').some((permission) => !!me.permissions?.includes(permission)))
    }).catch(() => undefined)
    return () => { live = false }
  }, [status, role, needed])

  if (!allowed || !links.length) return null
  if (!open) return <button type="button" className="mgr-bar is-closed" onClick={() => setOpen(true)} aria-label={`باز کردن نوار مدیریت: ${title}`}><span aria-hidden="true">⚙</span></button>
  return (
    <aside className="mgr-bar" aria-label="مدیریت این صفحه">
      <span className="mgr-bar-title"><span aria-hidden="true">⚙</span>{title}</span>
      {links.map((link, index) => <a key={link.href} href={link.href} className={index === 0 ? 'is-main' : ''}>{link.label}</a>)}
      <button type="button" onClick={() => setOpen(false)} aria-label="بستن نوار مدیریت">×</button>
    </aside>
  )
}

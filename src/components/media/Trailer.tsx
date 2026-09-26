'use client'

import { useRef } from 'react'

/** Trailer button + modal. `embed` is an iframe player URL, otherwise `src` is a video file. */
export default function Trailer({ embed, src, fa }: { embed?: string; src?: string; fa: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  if (!embed && !src) return null
  return (
    <>
      <button type="button" className="btn cn-btn-ghost" onClick={() => dialog.current?.showModal()}>🎞 {fa ? 'تماشای تریلر' : 'Watch trailer'}</button>
      <dialog ref={dialog} className="cn-trailer" onClick={(e) => { if (e.target === dialog.current) dialog.current?.close() }} onClose={() => dialog.current?.querySelectorAll('video').forEach((v) => v.pause())}>
        <button type="button" className="cn-trailer-close" onClick={() => dialog.current?.close()} aria-label={fa ? 'بستن' : 'Close'}>✕</button>
        {embed ? <iframe src={embed} title="trailer" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" /> : <video src={src} controls preload="none" />}
      </dialog>
    </>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'

const still = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The changing part of an animated headline. The first word is in the page as sent, so the heading reads without
 * script; the words then take turns (typed, sliding or fading). Readers that ask for less motion keep the first word,
 * and a screen reader hears every word once instead of a moving one.
 */
export function AnimatedWords({ words, effect }: { words: string[]; effect: string }) {
  const [index, setIndex] = useState(0)
  const [typed, setTyped] = useState(words[0]?.length || 0)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (words.length < 2 || still()) return
    let timer = 0
    if (effect === 'type') {
      const word = words[index]
      if (!leaving && typed < word.length) timer = window.setTimeout(() => setTyped((count) => count + 1), 70)
      else if (!leaving) timer = window.setTimeout(() => setLeaving(true), 1800)
      else if (typed > 0) timer = window.setTimeout(() => setTyped((count) => count - 1), 35)
      else timer = window.setTimeout(() => { setLeaving(false); setIndex((index + 1) % words.length) }, 250)
    } else {
      timer = window.setTimeout(() => { setLeaving(true); window.setTimeout(() => { setIndex((current) => (current + 1) % words.length); setLeaving(false) }, 420) }, 2600)
    }
    return () => window.clearTimeout(timer)
  }, [words, effect, index, typed, leaving])
  const word = words[index] || ''
  return <>
    <span className="sr-only">{words.join('، ')}</span>
    <span className={`br-ah-words is-${effect}${leaving ? ' is-leaving' : ''}`} aria-hidden="true">
      <span key={effect === 'type' ? 'type' : index} className="br-ah-word">{effect === 'type' ? word.slice(0, typed) : word}</span>
      {effect === 'type' && <span className="br-ah-caret" />}
    </span>
  </>
}

/** Two pictures one above the other; a handle (a range control, so keys and screen readers work) shows more of either. */
export function BeforeAfter({ before, after, beforeLabel, afterLabel, alt, start, fa }: { before: string; after: string; beforeLabel: string; afterLabel: string; alt: string; start: number; fa: boolean }) {
  const [position, setPosition] = useState(start)
  return <div className="br-ba" dir="ltr" style={{ ['--br-ba' as string]: `${position}%` }}>
    <img className="br-ba-after" src={after} alt={alt ? `${alt} — ${afterLabel || (fa ? 'بعد' : 'After')}` : ''} loading="lazy" />
    <img className="br-ba-before" src={before} alt={alt ? `${alt} — ${beforeLabel || (fa ? 'قبل' : 'Before')}` : ''} loading="lazy" />
    {beforeLabel && <span className="br-ba-tag is-before">{beforeLabel}</span>}
    {afterLabel && <span className="br-ba-tag is-after">{afterLabel}</span>}
    <span className="br-ba-handle" aria-hidden="true"><i /></span>
    <input className="br-ba-range" type="range" min={0} max={100} value={position} onChange={(event) => setPosition(Number(event.target.value))} aria-label={fa ? 'مقایسهٔ قبل و بعد' : 'Compare before and after'} aria-valuetext={`${position}%`} />
  </div>
}

/** A cover with a play button; the video loads only when asked for, in a dialog that Escape, the close button or a click outside closes. */
export function VideoBox({ src, cover, title, text, fa }: { src: string; cover: string; title: string; text: string; fa: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const show = () => { setOpen(true); dialog.current?.showModal() }
  const close = () => { dialog.current?.close() }
  return <div className="br-vb">
    <button type="button" className="br-vb-cover" onClick={show} aria-haspopup="dialog" aria-label={title ? `${fa ? 'پخش' : 'Play'}: ${title}` : fa ? 'پخش ویدیو' : 'Play video'}>
      {cover ? <img src={cover} alt="" loading="lazy" /> : <span className="br-vb-blank" />}
      <span className="br-vb-play" aria-hidden="true"><i /></span>
      {(title || text) && <span className="br-vb-copy">{title && <strong>{title}</strong>}{text && <span>{text}</span>}</span>}
    </button>
    <dialog ref={dialog} className="br-vb-dialog" aria-label={title || (fa ? 'ویدیو' : 'Video')} onClose={() => setOpen(false)} onClick={(event) => { if (event.target === dialog.current) close() }}>
      <button type="button" className="br-vb-close" onClick={close} aria-label={fa ? 'بستن' : 'Close'}>×</button>
      {open && <iframe src={src} title={title || 'Video'} referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />}
    </dialog>
  </div>
}

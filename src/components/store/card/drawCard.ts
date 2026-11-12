import { patternDataUrl, type CardPattern } from '@/modules/store/domain/card-designs'

/**
 * The card face on the page (CardFace, `[data-card-face]`) as a PNG at 1200 px wide. It measures the face and draws
 * what is there, where it is: colours, photo and pattern, the logo, the stripe, and every `data-draw` text in its own
 * font. Secret values are drawn in full (`data-value`), whether or not they are shown on screen.
 */
const loadImage = (src: string, cors = false) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); if (cors) image.crossOrigin = 'anonymous'; image.onload = () => resolve(image); image.onerror = reject; image.src = src })

export async function drawCard(face: HTMLElement): Promise<Blob> {
  await document.fonts.ready
  const box = face.getBoundingClientRect(), style = getComputedStyle(face)
  const W = 1200, s = W / box.width, H = Math.round(box.height * s)
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, parseFloat(style.borderTopLeftRadius) * s); ctx.clip()
  ctx.fillStyle = '#1d2230'; ctx.fillStyle = style.backgroundColor; ctx.fillRect(0, 0, W, H)
  const photo = face.dataset.image
  if (photo) {
    const image = await loadImage(photo, true).catch(() => null)
    if (image) { const k = Math.max(W / image.width, H / image.height); ctx.drawImage(image, (W - image.width * k) / 2, (H - image.height * k) / 2, image.width * k, image.height * k) }
    ctx.fillStyle = 'rgba(10, 12, 18, .46)'; ctx.fillRect(0, 0, W, H)
  }
  const pattern = await loadImage(patternDataUrl((face.dataset.pattern || 'none') as CardPattern, face.dataset.dark === '1' ? '#ffffff' : '#000000'))
  for (let y = 0; y < H; y += W * 380 / 600) ctx.drawImage(pattern, 0, y, W, W * 380 / 600)
  const at = (element: Element) => { const rect = element.getBoundingClientRect(); return { x: (rect.left - box.left) * s, y: (rect.top - box.top) * s, w: rect.width * s, h: rect.height * s } }
  for (const element of face.querySelectorAll<HTMLElement>('[data-draw-fill]')) { const r = at(element); ctx.fillStyle = getComputedStyle(element).backgroundColor; ctx.fillRect(r.x, r.y, r.w, r.h) }
  for (const element of face.querySelectorAll<HTMLImageElement>('[data-draw-image]')) {
    const image = await loadImage(element.currentSrc || element.src, true).catch(() => null)
    if (image) { const r = at(element), k = Math.min(r.w / image.width, r.h / image.height); ctx.drawImage(image, r.x + (r.w - image.width * k) / 2, r.y + (r.h - image.height * k) / 2, image.width * k, image.height * k) }
  }
  for (const element of face.querySelectorAll<HTMLElement>('[data-draw]')) {
    const text = element.dataset.value ?? element.textContent ?? ''
    if (!text.trim()) continue
    const css = getComputedStyle(element), r = at(element), ltr = element.dir === 'ltr' || css.direction === 'ltr'
    // A value may be longer than what it shows now (a hidden secret): it may use the room up to the card's edge.
    const room = ltr ? box.right * s - box.left * s - r.x - parseFloat(style.paddingRight) * s : r.x + r.w - parseFloat(style.paddingLeft) * s
    ctx.font = `${css.fontWeight} ${parseFloat(css.fontSize) * s}px ${css.fontFamily}`
    ctx.fillStyle = css.color; ctx.globalAlpha = Number(css.opacity) || 1
    ctx.direction = ltr ? 'ltr' : 'rtl'; ctx.textAlign = ltr ? 'left' : 'right'; ctx.textBaseline = 'middle'
    ctx.fillText(text, ltr ? r.x + parseFloat(css.paddingLeft) * s : r.x + r.w - parseFloat(css.paddingRight) * s, r.y + r.h / 2, Math.max(r.w, room))
    ctx.globalAlpha = 1
  }
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('image')), 'image/png'))
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

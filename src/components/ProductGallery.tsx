'use client'

import { useEffect, useState } from 'react'
import { ContentArt } from '@/components/content/ContentPrimitives'

/** Product pictures; with `productId`, the picture of the variant chosen in the buy box is shown first. */
export default function ProductGallery({ images, alt, productId }: { images: string[]; alt: string; productId?: number }) {
  const [variantImage, setVariantImage] = useState('')
  const unique = [...new Set([variantImage, ...images].filter(Boolean))]
  const [selected, setSelected] = useState(0)
  useEffect(() => {
    if (!productId) return
    const onVariant = (event: Event) => {
      const detail = (event as CustomEvent<{ productId: number; image: string }>).detail
      if (detail?.productId !== productId) return
      setVariantImage(detail.image || '')
      setSelected(0)
    }
    window.addEventListener('store:variant-image', onVariant)
    return () => window.removeEventListener('store:variant-image', onVariant)
  }, [productId])
  return <div className="store-gallery"><div className="product-media">{unique.length ? <img src={unique[selected] || unique[0]} alt={`${alt} ${selected + 1}`} /> : <ContentArt kind="product" />}</div>{unique.length > 1 && <div className="store-gallery-thumbs" aria-label={alt}>{unique.map((src, index) => <button type="button" key={src} aria-label={`${alt} ${index + 1}`} aria-pressed={selected === index} className={selected === index ? 'selected' : ''} onClick={() => setSelected(index)}><img src={src} alt="" loading="lazy" /></button>)}</div>}</div>
}

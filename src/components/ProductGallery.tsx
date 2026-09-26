'use client'

import { useState } from 'react'
import { ContentArt } from '@/components/content/ContentPrimitives'

export default function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const unique = [...new Set(images.filter(Boolean))]
  const [selected, setSelected] = useState(0)
  return <div className="store-gallery"><div className="product-media">{unique.length ? <img src={unique[selected] || unique[0]} alt={`${alt} ${selected + 1}`} /> : <ContentArt kind="product" />}</div>{unique.length > 1 && <div className="store-gallery-thumbs" aria-label={alt}>{unique.map((src, index) => <button type="button" key={src} aria-label={`${alt} ${index + 1}`} aria-pressed={selected === index} className={selected === index ? 'selected' : ''} onClick={() => setSelected(index)}><img src={src} alt="" loading="lazy" /></button>)}</div>}</div>
}

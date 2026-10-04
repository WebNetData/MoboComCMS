'use client'
import type { Dispatch, SetStateAction } from 'react'
import PostItemLinks from '../posts/PostItemLinks'
import { PRODUCT_RELATIONSHIP_KINDS, type ProductRelationshipInput, type ProductRelationshipKind } from '@/modules/catalog/domain/product-relationships'
const labels: Record<ProductRelationshipKind, { fa: string; en: string }> = {
  RELATED: { fa: 'محصولات مرتبط', en: 'Related products' },
  COMPLEMENTARY: { fa: 'محصولات مکمل', en: 'Complementary products' },
  COMPATIBLE: { fa: 'محصولات سازگار', en: 'Compatible products' },
}
export default function ProductRelationshipsEditor({ form, setForm, sourceId }: { form: Record<string, any>; setForm: Dispatch<SetStateAction<Record<string, any>>>; sourceId: number | null }) {
  const links: ProductRelationshipInput[] = Array.isArray(form.relationships) ? form.relationships : []
  return <>{PRODUCT_RELATIONSHIP_KINDS.map(kind => {
    const virtual = { itemLinks: links.filter(link => link.kind === kind).map(link => ({ type: 'product', id: link.targetId })) }
    const update: Dispatch<SetStateAction<Record<string, any>>> = action => setForm(current => {
      const previous = Array.isArray(current.relationships) ? current.relationships as ProductRelationshipInput[] : []
      const old = { itemLinks: previous.filter(link => link.kind === kind).map(link => ({ type: 'product', id: link.targetId })) }
      const next = typeof action === 'function' ? action(old) : action
      return { ...current, relationships: [...previous.filter(link => link.kind !== kind), ...(next.itemLinks || []).map((ref: { id: number }) => ({ kind, targetId: ref.id }))] }
    })
    return <PostItemLinks key={kind} form={virtual} setForm={update} types={['product']} endpoint={`/api/admin/products/relationship-items?sourceId=${sourceId || 0}`} heading={labels[kind]} hint={kind === 'COMPATIBLE' ? { fa: 'سازگاری را بر اساس مشخصات واقعی بررسی کنید. این ارتباط از این محصول به موارد انتخاب‌شده است.', en: 'Verify compatibility using actual specifications. This relation points from this product to the selected items.' } : { fa: 'موارد به ترتیب انتخاب نمایش داده می‌شوند؛ با حذف و افزودن دوباره می‌توانید ترتیب را تغییر دهید.', en: 'Items appear in selection order. Remove and add an item again to change its order.' }} />
  })}</>
}

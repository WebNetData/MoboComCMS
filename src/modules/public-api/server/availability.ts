import { cache } from 'react'
import { db } from '@/platform/database/prisma'
/** Asked once per server render (menus and footer both ask); API route handlers have no render scope and read it fresh. */
export const isPublicApiEnabled = cache(async (): Promise<boolean> => {
  return (await db.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value === 'true'
})

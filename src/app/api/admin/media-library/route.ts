import { GET, POST as post, PATCH as patch, DELETE } from '@/modules/media/server/admin'
import { withIndexNow } from '@/modules/seo/server/indexnow'

// Media and software pages are announced to IndexNow after saving.
export const POST = withIndexNow(post)
export const PATCH = withIndexNow(patch)
export { GET, DELETE }
export const dynamic = 'force-dynamic'

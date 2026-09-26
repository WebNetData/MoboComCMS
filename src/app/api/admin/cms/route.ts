import { GET, POST as post, PATCH as patch, DELETE } from '@/modules/site/server/http/admin/cms/route'
import { withIndexNow } from '@/modules/seo/server/indexnow'

// Published posts, products and pages are announced to IndexNow after saving.
export const POST = withIndexNow(post)
export const PATCH = withIndexNow(patch)
export { GET, DELETE }

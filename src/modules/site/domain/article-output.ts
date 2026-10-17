import { renderEditorialText, richTextToPlain } from '@/shared/content/sanitize'

/** Presentation only: canonical documents and the saved excerpt stay untouched. */
export function articleBodyWithExcerpt(body: string, excerpt: string, fa = true): string {
  if (!richTextToPlain(excerpt)) return body
  return `<section class="journal-article-summary" aria-label="${fa ? 'خلاصهٔ مطلب' : 'Article summary'}"><b>${fa ? 'خلاصهٔ مطلب' : 'Article summary'}</b><div>${renderEditorialText(excerpt)}</div></section>${body}`
}

import { SEARCH_DIMENSIONS, type SearchFacets } from '@/modules/search/domain/facets'
import { dimensionsFor } from '@/modules/reviews/domain/dimensions'
import type { ItemType } from '@/modules/content/domain/items'

export default function SearchAdvancedControls({ query, type, facets }: { query: string; type: ItemType | 'all'; facets: SearchFacets }) {
  const dimensions = type === 'all' ? SEARCH_DIMENSIONS : dimensionsFor(type)
  return <form action="/search" className="sr-advanced">
    <input type="hidden" name="q" value={query} />
    {type !== 'all' && <input type="hidden" name="type" value={type} />}
    {facets.access && <input type="hidden" name="access" value={facets.access} />}
    {facets.rated > 0 && <input type="hidden" name="rated" value={facets.rated} />}
    {facets.since && <input type="hidden" name="since" value={facets.since} />}
    <fieldset><legend>ترتیب و امتیاز تخصصی</legend><div className="sr-advanced-fields">
      <label>مرتب‌سازی<select name="sort" defaultValue={facets.sort || 'relevance'}><option value="relevance">مرتبط‌ترین</option><option value="newest">جدیدترین</option><option value="rating">بالاترین امتیاز کاربران</option></select></label>
      {dimensions.length > 0 && <><label>معیار تخصصی<select name="dimension" defaultValue={facets.dimension || ''}><option value="">همهٔ معیارها</option>{dimensions.map(dimension => <option key={dimension.key} value={dimension.key}>{dimension.label}</option>)}</select></label><label>حداقل امتیاز معیار<select name="dimensionMin" defaultValue={facets.dimensionMin || 4}><option value="4">۴ از ۵</option><option value="3">۳ از ۵</option></select></label></>}
      <button className="btn btn-primary" type="submit">اعمال</button>
    </div>{dimensions.length > 0 && <p className="muted">با انتخاب معیار، فقط موارد دارای امتیاز تأییدشدهٔ همان معیار نمایش داده می‌شوند.</p>}</fieldset>
  </form>
}

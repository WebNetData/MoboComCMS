import { SEARCH_DIMENSIONS, type SearchFacets } from '@/modules/search/domain/facets'
import { dimensionsFor } from '@/modules/reviews/domain/dimensions'
import type { ItemType } from '@/modules/content/domain/items'
import Icon from '@/components/site/Icon'
import styles from './SearchPage.module.css'

export default function SearchAdvancedControls({ query, type, facets }: { query: string; type: ItemType | 'all'; facets: SearchFacets }) {
  const dimensions = type === 'all' ? SEARCH_DIMENSIONS : dimensionsFor(type)
  return <details className={styles.advancedDisclosure} open={Boolean(facets.sort || facets.dimension)}>
    <summary><span><Icon name="sliders" size={18} />فیلترهای پیشرفته</span><small>{facets.sort === 'newest' ? 'جدیدترین' : facets.sort === 'rating' ? 'بالاترین امتیاز' : 'مرتبط‌ترین'}</small><span className={styles.disclosureArrow}><Icon name="chevron" size={18} /></span></summary>
    <form action="/search" className={styles.advanced}>
    <input type="hidden" name="q" value={query} />
    {type !== 'all' && <input type="hidden" name="type" value={type} />}
    {facets.access && <input type="hidden" name="access" value={facets.access} />}
    {facets.rated > 0 && <input type="hidden" name="rated" value={facets.rated} />}
    {facets.since && <input type="hidden" name="since" value={facets.since} />}
    <fieldset><legend><Icon name="sliders" size={18} />ترتیب و امتیاز تخصصی</legend><div className={styles.advancedFields}>
      <label><span id="search-sort-label">مرتب‌سازی</span><select name="sort" aria-labelledby="search-sort-label" defaultValue={facets.sort || 'relevance'}><option value="relevance">مرتبط‌ترین</option><option value="newest">جدیدترین</option><option value="rating">بالاترین امتیاز کاربران</option></select></label>
      {dimensions.length > 0 && <><label><span id="search-dimension-label">معیار تخصصی</span><select name="dimension" aria-labelledby="search-dimension-label" defaultValue={facets.dimension || ''}><option value="">همهٔ معیارها</option>{dimensions.map(dimension => <option key={dimension.key} value={dimension.key}>{dimension.label}</option>)}</select></label><label><span id="search-dimension-min-label">حداقل امتیاز معیار</span><select name="dimensionMin" aria-labelledby="search-dimension-min-label" defaultValue={facets.dimensionMin || 4}><option value="4">۴ از ۵</option><option value="3">۳ از ۵</option></select></label></>}
      <button className={styles.applyButton} type="submit">اعمال فیلترها<Icon name="check" size={16} /></button>
    </div>{dimensions.length > 0 && <p className={styles.help}>با انتخاب معیار، فقط موارد دارای امتیاز تأییدشدهٔ همان معیار نمایش داده می‌شوند.</p>}</fieldset>
    </form>
  </details>
}

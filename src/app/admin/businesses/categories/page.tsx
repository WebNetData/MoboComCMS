import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import VocabularyManager from '../../cms/VocabularyManager'

/** The businesses' managed list: fields of activity, offered in the business form and the members' suggestion form. */
export default async function BusinessCategoriesAdmin() {
  await requireModule('businesses')
  return <div className="sa" dir="rtl">
    <header className="sa-head"><h1>زمینه‌های فعالیت کسب‌وکارها</h1><div className="sa-head-actions"><Link href="/admin/businesses" className="btn btn-ghost btn-sm">بازگشت به کسب‌وکارها</Link></div></header>
    <VocabularyManager section="businesses" noun="کسب‌وکار" />
  </div>
}

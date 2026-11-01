import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import VocabularyManager from '../../cms/VocabularyManager'
export default async function PromptCategoriesPage() {
  await requireModule('prompt-master')
  return <div className="sa" dir="rtl"><header className="sa-head"><h1>دسته‌های کتابخانهٔ پرامپت</h1><Link href="/admin/prompts" className="btn btn-ghost">بازگشت به الگوها</Link></header><VocabularyManager section="prompts" noun="الگو" /></div>
}

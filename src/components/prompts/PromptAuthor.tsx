import Link from '@/components/AppLink'
import ProfilePortrait from '@/components/admin/ProfilePortrait'
import { pictureOf } from '@/modules/identity/domain/picture'
import g from './PromptGallery.module.css'

export type PromptAuthorView = { id: number; name: string; telegramPhoto?: string; userProfile?: { avatar: string } | null }
export default function PromptAuthor({ author }: { author?: PromptAuthorView | null }) {
  if (!author) return null
  const name = author.name || 'نویسندهٔ پرامپت'
  return <Link className={g.author} href={'/prompts/library?' + new URLSearchParams({ author: String(author.id), view: 'all' })} aria-label={'پرامپت‌های ' + name}>
    <span className={g.authorAvatar}><ProfilePortrait image={pictureOf(author)} name={name}/></span><span><small>نویسنده</small><b>{name}</b></span>
  </Link>
}

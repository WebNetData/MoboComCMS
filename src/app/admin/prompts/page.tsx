import { requireModule } from '@/extensions/server/modules'
import { activeLists } from '@/modules/vocabulary/server/vocabulary'
import PromptManager from '@/components/prompts/PromptManager'
export default async function PromptAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireModule('prompt-master')
  const input = await searchParams, query = new URLSearchParams(), lists = await activeLists('prompts')
  for (const key of ['q', 'kind', 'status', 'page']) if (typeof input[key] === 'string') query.set(key, input[key])
  const edit = typeof input.edit === 'string' && /^\d+$/.test(input.edit) ? input.edit : ''
  return <PromptManager key={query.toString() + ':' + edit} query={query.toString()} editId={edit} categories={(lists.CATEGORY || []).map(c => ({ code: c.code, name: c.name }))} />
}

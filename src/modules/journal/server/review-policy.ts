import { getJournalSettings } from '@/modules/journal/server/admin'

/** Fresh canonical policy; separated from commands to keep Editor/Journal acyclic. */
export async function reviewingAuthorPosts() {
  return (await getJournalSettings(true)).reviewAuthorPosts
}

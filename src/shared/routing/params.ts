/** Next's App Router supplies encoded dynamic values. Decode once at the HTTP page boundary,
 * keeping domain lookup contracts (raw stored slugs) unchanged. Invalid segments stay not-found. */
export async function contentRouteParams<T extends { slug: string }>(params: Promise<T>): Promise<T> {
  const values = await params
  try {
    const slug = decodeURIComponent(values.slug)
    return { ...values, slug: slug && slug !== '.' && slug !== '..' && !/[\/\\?#\x00-\x20\x7f]/.test(slug) ? slug : '' }
  } catch { return { ...values, slug: '' } }
}

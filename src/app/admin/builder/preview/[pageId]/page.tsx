import { redirect } from 'next/navigation'

/** Moved out of /admin (see src/app/builder-preview/[pageId]/page.tsx). */
export default async function LegacyBuilderPreview({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params
  redirect(`/builder-preview/${encodeURIComponent(pageId)}`)
}

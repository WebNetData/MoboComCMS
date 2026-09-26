import { redirect } from 'next/navigation'

export default async function LegacyBuilder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/admin/builder/${id}`)
}

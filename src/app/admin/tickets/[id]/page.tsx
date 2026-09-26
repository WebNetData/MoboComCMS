import { notFound, redirect } from 'next/navigation'

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[1-9]\d*$/.test(id)) notFound()
  redirect(`/admin/tickets?ticket=${id}`)
}

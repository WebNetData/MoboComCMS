import SubscriptionHub from '@/components/SubscriptionHub'

export default async function SubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  return <SubscriptionHub id={id} />
}

'use client'

import DomainDetail from '@/components/hosting/workspace/domain-detail'

export default function Page({ params }: { params: Promise<{ id: string }> }) { return <DomainDetail params={params} surface="cloud" /> }

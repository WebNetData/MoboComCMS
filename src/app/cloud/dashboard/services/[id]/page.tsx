'use client'

import ServiceWorkspace from '@/components/hosting/workspace/service-detail'

export default function Page({ params }: { params: Promise<{ id: string }> }) { return <ServiceWorkspace params={params} surface="cloud" /> }

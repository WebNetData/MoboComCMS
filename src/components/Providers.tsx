'use client'

import { SessionProvider } from 'next-auth/react'
import SessionIdentityRefresh from '@/modules/identity/client/SessionIdentityRefresh'

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider><SessionIdentityRefresh />{children}</SessionProvider>
}

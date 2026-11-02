import { getServerSession } from 'next-auth'
import { authOptions } from '@/modules/identity/auth'
import type { SignedInPerson } from './SignedIn'

/** The member already signed in, for the sign-in and sign-up pages; null for a visitor. */
export async function signedInPerson(): Promise<SignedInPerson | null> {
  const session = await getServerSession(authOptions).catch(() => null)
  const user = session?.user as { id?: string; name?: string | null; email?: string | null; image?: string | null; role?: string } | undefined
  if (!user?.id) return null
  return { name: user.name || '', email: user.email || '', image: user.image || null, admin: user.role === 'ADMIN' }
}

export { safeNext } from '@/modules/identity/domain/continuation'

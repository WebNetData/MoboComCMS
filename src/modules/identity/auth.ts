import type { NextAuthOptions } from 'next-auth'
import { pictureOf } from '@/modules/identity/domain/picture'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/platform/database/prisma'
import { parsePermissions } from '@/modules/identity/rbac'
import { telegramConfig, verifyInitData, verifyLoginWidget } from '@/modules/notifications/server/telegram'
import { userForTelegram } from '@/modules/identity/telegram-account'
import { authSecret } from '@/platform/config/env'
import { clientIp, rateLimitStrict } from '@/platform/http/rate-limit'
import { verifyTurnstile } from '@/modules/identity/server/turnstile'
import { sessionRevoked } from '@/modules/identity/domain/account-security'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'

/**
 * 2-step sign-in: accounts with an authenticator need its code (or a backup
 * code) too. Without one the provider answers TOTP_REQUIRED so the form can
 * ask for it; a wrong one answers TOTP_INVALID.
 */
async function secondFactor(user: { id: number; totpEnabledAt: Date | null }, code: string | undefined) {
  if (!user.totpEnabledAt) return
  if (!code) throw new Error('TOTP_REQUIRED')
  const { checkSecondFactor } = await import('@/modules/identity/server/account-security')
  if (!await checkSecondFactor(user.id, code)) throw new Error('TOTP_INVALID')
}

export function sessionUser(user: { id: number; email: string; name: string; role: string; roleId: number | null; telegramId?: string | null; roleRef?: { permissions: string } | null }) {
  return {
    id: String(user.id),
    telegramId: user.telegramId || null,
    email: user.email,
    name: user.name || user.email,
    role: user.role,
    roleId: user.roleId,
    permissions: user.role === 'ADMIN' ? (user.roleId ? parsePermissions(user.roleRef?.permissions || '') : null) : null,
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  secret: authSecret(),
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
        turnstileToken: { label: 'Turnstile token', type: 'text' },
        totp: { label: '2-step code', type: 'text' },
      },
            async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null
        const email = credentials.email.toLowerCase()
        // Brute-force guard: throttle per IP and per account+IP.
        const ip = clientIp(new Headers((req as { headers?: HeadersInit } | undefined)?.headers || {}))
        if (!(await rateLimitStrict(`login:ip:${ip}`, 30, 10 * 60_000)).ok) return null
        if (!(await rateLimitStrict(`login:acc:${ip}:${email}`, 8, 10 * 60_000)).ok) return null
        if (!await verifyTurnstile(credentials.turnstileToken, new Headers((req as { headers?: HeadersInit } | undefined)?.headers || {}), 'login')) return null
        const user = await db.user.findUnique({
          where: { email },
          include: { roleRef: true },
        })
        if (!user) return null
        if (user.status !== 'ACTIVE') return null
        const ok = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!ok) return null
        await secondFactor(user, credentials.totp)
        return sessionUser(user)
      },
    }),
    CredentialsProvider({
      id: 'sms-otp',
      name: 'SMS code',
      credentials: {
        phone: { label: 'Mobile', type: 'text' },
        code: { label: 'Code', type: 'text' },
        totp: { label: '2-step code', type: 'text' },
      },
      async authorize(credentials, req) {
        if (!credentials?.phone || !credentials?.code) return null
        const ip = clientIp(new Headers((req as { headers?: HeadersInit } | undefined)?.headers || {}))
        if (!(await rateLimitStrict(`login:otp:ip:${ip}`, 30, 10 * 60_000)).ok) return null
        const { userForPhone, verifyOtp } = await import('@/modules/sms/server/sms')
        let phone: string
        try {
          // Checked first without using the code up, so asking for the 2-step code does not cost a new SMS.
          phone = await verifyOtp({ phone: credentials.phone, code: credentials.code, purpose: 'LOGIN', consume: false })
        } catch {
          return null
        }
        const existing = await db.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null } }, orderBy: { id: 'asc' }, select: { id: true, totpEnabledAt: true } })
        if (existing) await secondFactor(existing, credentials.totp)
        try {
          await verifyOtp({ phone, code: credentials.code, purpose: 'LOGIN' })
          const user = await userForPhone(phone)
          return user ? sessionUser(user) : null
        } catch {
          return null
        }
      },
    }),
    CredentialsProvider({
      id: 'telegram',
      name: 'Telegram',
      credentials: {
        initData: { label: 'initData', type: 'text' },
      },
      async authorize(credentials) {
        const initData = credentials?.initData || ''
        if (!initData) return null
        const cfg = await telegramConfig()
        if (!cfg.ready) return null
        const tg = verifyInitData(initData, cfg.token)
        if (!tg) return null
        const user = await userForTelegram(tg)
        if (!user) return null
        // The Mini App runs inside the member's signed-in Telegram app (a device-bound
        // factor of its own), so it is not asked for the 2-step code.
        return sessionUser(user)
      },
    }),
    CredentialsProvider({
      id: 'telegram-web',
      name: 'Telegram Web Login',
      credentials: { authData: { label: 'Telegram authorization data', type: 'text' }, totp: { label: '2-step code', type: 'text' } },
      async authorize(credentials) {
        const cfg = await telegramConfig()
        if (!cfg.ready) return null
        const tg = verifyLoginWidget(credentials?.authData || '', cfg.token)
        if (!tg) return null
        const user = await userForTelegram(tg)
        if (!user) return null
        await secondFactor(user, credentials?.totp)
        return sessionUser(user)
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const subject = Number(user.id)
      if (!Number.isSafeInteger(subject) || subject <= 0) return false
      const current = await db.user.findUnique({ where: { id: subject }, select: { status: true } })
      return !!current && current.status === 'ACTIVE' && !await globalAuthenticationDenied(subject)
    },
    async jwt({ token, user }) {
      // Check every provider before minting a JWT, and every existing session.
      const subject = user ? Number(user.id) : Number(token.uid)
      if (subject && await globalAuthenticationDenied(subject)) throw new Error('SESSION_REVOKED')
      if (!user && token.uid) {
        // Sessions end when the password is reset (or the account is suspended).
        const current = await db.user.findUnique({ where: { id: Number(token.uid) }, select: { status: true, passwordChangedAt: true, name: true, telegramPhoto: true, userProfile: { select: { avatar: true } } } })
        if (!current || current.status !== 'ACTIVE' || sessionRevoked(token.authAt, current.passwordChangedAt)) throw new Error('SESSION_REVOKED')
        if (!token.authAt) token.authAt = Date.now()
        // The picture and name follow the profile, so a change shows without signing in again.
        token.picture = pictureOf(current) || null
        if (current.name) token.name = current.name
      }
      if (user) {
        token.authAt = Date.now()
        token.uid = (user as any).id
        token.telegramId = (user as any).telegramId
        token.role = (user as any).role
        token.roleId = (user as any).roleId
        token.permissions = (user as any).permissions
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).id = token.uid as string
        ;(session.user as any).telegramId = token.telegramId
        ;(session.user as any).role = token.role as string
        ;(session.user as any).roleId = token.roleId as number | null
        ;(session.user as any).permissions = token.permissions
        session.user.image = typeof token.picture === 'string' && token.picture ? token.picture : null
      }
      return session
    },
  },
}

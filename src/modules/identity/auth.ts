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
import { verifyHuman } from '@/modules/identity/server/human-check'
import { sessionRevoked } from '@/modules/identity/domain/account-security'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'
import { loginIdentifier } from '@/modules/identity/domain/login-identifier'

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
        const identity = loginIdentifier(credentials.email)
        if (!identity) return null
        const email = identity.value
        // Brute-force guard: throttle per IP and per account+IP.
        const ip = clientIp(new Headers((req as { headers?: HeadersInit } | undefined)?.headers || {}))
        if (!(await rateLimitStrict(`login:ip:${ip}`, 30, 10 * 60_000)).ok) return null
        if (!(await rateLimitStrict(`login:acc:${ip}:${email}`, 8, 10 * 60_000)).ok) return null
        // One account, many addresses: a guess spread over a botnet still meets a limit on the account itself.
        if (!(await rateLimitStrict(`login:account:${email}`, 30, 15 * 60_000)).ok) return null
        if (!await verifyHuman(credentials.turnstileToken, new Headers((req as { headers?: HeadersInit } | undefined)?.headers || {}), 'login')) return null
        const candidates = identity.kind === 'phone' ? await db.user.findMany({ where: { phone: identity.value, phoneVerifiedAt: { not: null } }, include: { roleRef: true }, take: 2 }) : []
        const user = identity.kind === 'email'
          ? await db.user.findUnique({ where: { email }, include: { roleRef: true } })
          : candidates.length === 1 ? candidates[0] : null
        if (!user) return null
        if (user.status !== 'ACTIVE' || user.passwordSetupRequired) return null
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
        const { userForPhone, verifyOtp, otpLoginAvailable } = await import('@/modules/sms/server/sms')
        if (!await otpLoginAvailable()) return null
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
          if (user && ((existing && user.id !== existing.id) || user.totpEnabledAt?.getTime() !== existing?.totpEnabledAt?.getTime())) return null
          return user ? sessionUser(user) : null
        } catch {
          return null
        }
      },
    }),
    CredentialsProvider({
      id: 'email-otp',
      name: 'Email code',
      credentials: { email: { label: 'Email', type: 'text' }, code: { label: 'Code', type: 'text' }, totp: { label: '2-step code', type: 'text' } },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.code) return null
        const ip = clientIp(new Headers((req as { headers?: HeadersInit } | undefined)?.headers || {}))
        if (!(await rateLimitStrict(`login:email-otp:ip:${ip}`, 30, 10 * 60_000)).ok) return null
        const { verifyEmailCode, userForEmailCode } = await import('@/modules/identity/server/email-otp')
        const verified = await verifyEmailCode({ email: credentials.email, code: credentials.code, consume: false })
        if (!verified) return null
        if (verified.user) await secondFactor(verified.user, credentials.totp)
        const user = await userForEmailCode({ email: credentials.email, code: credentials.code })
        if (user?.totpEnabledAt?.getTime() !== verified.user?.totpEnabledAt?.getTime()) return null
        return user ? sessionUser(user) : null
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
    CredentialsProvider({
      // Google sign-in (src/modules/identity/server/google-login.ts): the server already checked Google's answer and
      // left a one-time ticket; it becomes the session only after the 2-step code, and only once.
      id: 'google',
      name: 'Google',
      credentials: { ticket: { label: 'Ticket', type: 'text' }, totp: { label: '2-step code', type: 'text' } },
      async authorize(credentials, req) {
        const ip = clientIp(new Headers((req as { headers?: HeadersInit } | undefined)?.headers || {}))
        if (!(await rateLimitStrict(`login:google:ip:${ip}`, 30, 10 * 60_000)).ok) return null
        const { peekGoogleTicket, consumeGoogleTicket } = await import('@/modules/identity/server/google-login')
        const userId = await peekGoogleTicket(credentials?.ticket)
        if (!userId) return null
        const user = await db.user.findUnique({ where: { id: userId }, include: { roleRef: true } })
        if (!user || user.status !== 'ACTIVE') return null
        await secondFactor(user, credentials?.totp)
        if (!await consumeGoogleTicket(credentials?.ticket)) return null
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

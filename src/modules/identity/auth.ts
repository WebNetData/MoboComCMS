import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/platform/database/prisma'
import { parsePermissions } from '@/modules/identity/rbac'
import { telegramConfig, verifyInitData, verifyLoginWidget } from '@/modules/notifications/server/telegram'
import { userForTelegram } from '@/modules/identity/telegram-account'
import { authSecret } from '@/platform/config/env'
import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { verifyTurnstile } from '@/modules/identity/server/turnstile'

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
      },
            async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null
        const email = credentials.email.toLowerCase()
        // Brute-force guard: throttle per IP and per account+IP.
        const ip = clientIp(new Headers((req as { headers?: HeadersInit } | undefined)?.headers || {}))
        if (!rateLimitHit(`login:ip:${ip}`, 30, 10 * 60_000).ok) return null
        if (!rateLimitHit(`login:acc:${ip}:${email}`, 8, 10 * 60_000).ok) return null
        if (!await verifyTurnstile(credentials.turnstileToken, new Headers((req as { headers?: HeadersInit } | undefined)?.headers || {}), 'login')) return null
        const user = await db.user.findUnique({
          where: { email },
          include: { roleRef: true },
        })
        if (!user) return null
        if (user.status !== 'ACTIVE') return null
        const ok = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!ok) return null
        return sessionUser(user)
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
        return sessionUser(user)
      },
    }),
    CredentialsProvider({
      id: 'telegram-web',
      name: 'Telegram Web Login',
      credentials: { authData: { label: 'Telegram authorization data', type: 'text' } },
      async authorize(credentials) {
        const cfg = await telegramConfig()
        if (!cfg.ready) return null
        const tg = verifyLoginWidget(credentials?.authData || '', cfg.token)
        if (!tg) return null
        const user = await userForTelegram(tg)
        return user ? sessionUser(user) : null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
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
      }
      return session
    },
  },
}

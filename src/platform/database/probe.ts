import { PrismaClient } from '@prisma/client'

/** Prisma's error codes for a connection that could not be made, as something a person can act on (Persian). */
const REASONS: Record<string, string> = {
  P1000: 'نام کاربری یا گذرواژه پایگاه داده اشتباه است',
  P1001: 'سرور پایگاه داده در این نشانی و درگاه در دسترس نیست (نشانی، درگاه، فایروال و روشن‌بودن سرویس را بررسی کنید)',
  P1002: 'سرور پایگاه داده دیر پاسخ داد',
  P1003: 'پایگاه داده‌ای با این نام وجود ندارد؛ ابتدا آن را در PostgreSQL بسازید',
  P1008: 'زمان انتظار برای پایگاه داده تمام شد',
  P1010: 'این کاربر به پایگاه داده دسترسی ندارد',
  P1011: 'اتصال امن (SSL) با سرور برقرار نشد؛ گزینهٔ «اتصال امن» را تغییر دهید',
  P1017: 'سرور پایگاه داده اتصال را بست',
}

/** Connects to an address the application is not using (yet) and runs `SELECT 1`. Used by the web installer. */
export async function probeDatabase(url: string, timeoutMs = 8000): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = new PrismaClient({ datasourceUrl: url, log: [] })
  try {
    await Promise.race([
      client.$queryRawUnsafe('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('پاسخی از سرور پایگاه داده نرسید (زمان انتظار تمام شد)')), timeoutMs)),
    ])
    return { ok: true }
  } catch (error) {
    const code = (error as { code?: string; errorCode?: string }).code || (error as { errorCode?: string }).errorCode || ''
    return { ok: false, message: REASONS[code] || (error instanceof Error ? error.message.split('\n').filter(Boolean).slice(-1)[0] : 'اتصال برقرار نشد') }
  } finally {
    await client.$disconnect().catch(() => undefined)
  }
}

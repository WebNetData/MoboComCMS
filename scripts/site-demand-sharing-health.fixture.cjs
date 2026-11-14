const fs = require('node:fs'), path = require('node:path')
const { PrismaClient } = require('@prisma/client'), { encode } = require('next-auth/jwt')
const db = new PrismaClient(), baseURL = process.env.NEXTAUTH_URL
const databaseName = new URL(process.env.DATABASE_URL || '').pathname
const file = path.join(process.cwd(), 'var', 'demand-fixture.private.json')
if (process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || databaseName !== '/mobocom_demand_test_20261114' || baseURL !== 'https://localhost:3123') throw Error('Exact isolated demand fixture required')
async function main() {
  if (fs.existsSync(file)) { const f = JSON.parse(fs.readFileSync(file)); await db.user.findUniqueOrThrow({ where: { id: f.staffId } }); console.log('Reused task fixture without printing sessions'); return }
  if (await db.user.count() || await db.product.count()) throw Error('Fixture requires no existing users/products')
  const users = []
  for (const [key, role] of [['staff', 'ADMIN'], ['buyer', 'CUSTOMER'], ['recipient', 'CUSTOMER']]) users.push(await db.user.create({ data: { name: `کاربر ساختگی ${key}`, email: `demand-${key}@example.invalid`, passwordHash: '!', role, totpEnabledAt: role === 'ADMIN' ? new Date() : null, smsAlerts: false, emailAlerts: false, pushAlerts: false } }))
  const product = await db.product.create({ data: { slug: 'demand-synthetic-laptop', name: 'لپ‌تاپ ساختگی اشتراک سبد', kind: 'PHYSICAL', active: true, approval: 'APPROVED', access: 'PUBLIC', price: 1000, priceMinor: 1000n, currency: 'IRT', stock: 20, image: '/images/journal-editorial-fallback.webp', weightGrams: 100 } })
  const game = await db.gameTitle.create({ data: { slug: 'demand-synthetic-game', title: 'بازی ساختگی درخواست مشتری', status: 'PUBLISHED', access: 'PUBLIC', publishedAt: new Date() } })
  await db.mediaLink.create({ data: { ownerType: 'game', ownerId: game.id, url: 'https://files.example.invalid/game.bin' } })
  for (const [key, value] of Object.entries({ storeEnabled: 'true', supportEnabled: 'true', gamesEnabled: 'true', siteUrl: baseURL, 'downloads.health.v1': JSON.stringify({ enabled: false, hosts: [], intervalHours: 6, batchSize: 1 }) })) await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  const fixture = { baseURL, databaseName, productId: product.id, gameId: game.id }
  for (let i = 0; i < users.length; i++) { const user = users[i], key = ['staff', 'buyer', 'recipient'][i]; fixture[key + 'Id'] = user.id; fixture[key + 'Cookies'] = [{ name: '__Secure-next-auth.session-token', secure: true, url: baseURL, value: await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(user.id), sub: String(user.id), role: user.role, email: user.email, authAt: Date.now() } }) }] }
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(fixture), { mode: 0o600 })
  console.log('Isolated synthetic demand/cart/health fixture saved privately; no external transport enabled')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => db.$disconnect())

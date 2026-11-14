const fs = require('node:fs')
const path = require('node:path')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')

const db = new PrismaClient()
const baseURL = process.env.NEXTAUTH_URL
const databaseName = decodeURIComponent(new URL(process.env.DATABASE_URL || '').pathname)
const privateFile = process.env.PLATFORM_COMPLETION_FIXTURE_PATH || path.join(process.cwd(), 'var', 'completion-fixture.private.json')
const baseName = 'opening-completion-20261114'

if (process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || databaseName !== '/mobocom_completion_test_20261114' || baseURL !== 'https://localhost:3122') {
  throw Error('Explicit isolated platform-completion fixture required: mobocom_completion_test_20261114 at https://localhost:3122')
}

async function main() {
  if (fs.existsSync(privateFile)) {
    const fixture = JSON.parse(fs.readFileSync(privateFile, 'utf8'))
    if (fixture.baseURL !== baseURL || fixture.databaseName !== databaseName) throw Error('Private fixture belongs to another runtime')
    await db.user.findUniqueOrThrow({ where: { id: fixture.staffId } })
    await db.user.findUniqueOrThrow({ where: { id: fixture.buyerId } })
    await db.product.findUniqueOrThrow({ where: { id: fixture.productId } })
    await db.post.findUniqueOrThrow({ where: { id: fixture.postId } })
    console.log('Reusing the existing isolated synthetic fixture; private cookies were not printed')
    return
  }

  if (await db.user.count() || await db.order.count() || await db.product.count() || await db.post.count()) {
    throw Error('The isolated completion database must contain no users, orders, products, or posts')
  }
  const image = '/images/journal-editorial-fallback.webp'
  if (!fs.existsSync(path.join(process.cwd(), 'public', image.slice(1)))) throw Error(`Required local fixture image is missing: public${image}`)
  if (!process.env.NEXTAUTH_SECRET) throw Error('NEXTAUTH_SECRET is required to create local-only fixture sessions')

  const location = await db.stockLocation.findFirst({ where: { isDefault: true, active: true } })
  if (!location) throw Error('The application default stock location must exist before the fixture is seeded')
  const staff = await db.user.create({ data: {
    email: 'opening-completion-staff@example.invalid', name: 'کارمند مصنوعی آزمون', phone: '', passwordHash: '!',
    role: 'ADMIN', totpEnabledAt: new Date(), smsAlerts: false, emailAlerts: false, pushAlerts: false,
  } })
  const buyer = await db.user.create({ data: {
    email: 'opening-completion-buyer@example.invalid', name: 'مشتری مصنوعی آزمون', phone: '09121112233', passwordHash: '!',
    role: 'CUSTOMER', smsAlerts: false, emailAlerts: false, pushAlerts: false,
  } })
  const productName = 'دستگاه آزمایشی تکمیل گردش فروش'
  const product = await db.product.create({ data: {
    slug: 'opening-completion-device', name: productName, sku: 'OPENING-COMPLETION-DEVICE', kind: 'PHYSICAL', currency: 'IRT',
    price: 1000, priceMinor: 1000n, costMinor: 500n, stock: 20, active: true, approval: 'APPROVED',
    image, shortDescription: 'کالای ساختگی محلی برای پیش‌نمایش و گردش فروش', description: '<p>محتوای ساختگی آزمون محلی.</p>', weightGrams: 100,
  } })
  const aliasCandidate = await db.product.create({ data: {
    slug: 'opening-completion-device-duplicate', name: productName, sku: 'OPENING-COMPLETION-DUPLICATE', kind: 'PHYSICAL', currency: 'IRT',
    price: 1000, priceMinor: 1000n, costMinor: 500n, stock: 0, active: true, approval: 'APPROVED', image,
    shortDescription: 'رکورد هم‌نام ساختگی برای پیش‌نمایش بررسی', description: '<p>این رکورد نباید به‌صورت خودکار هم‌نشانی شود.</p>', weightGrams: 100,
  } })
  await db.locationStock.createMany({ data: [
    { locationId: location.id, productId: product.id, itemKey: `${product.id}:0`, quantity: 20 },
    { locationId: location.id, productId: aliasCandidate.id, itemKey: `${aliasCandidate.id}:0`, quantity: 0 },
  ] })
  const address = await db.userAddress.create({ data: {
    userId: buyer.id, title: 'نشانی آزمون', recipient: buyer.name, mobile: buyer.phone, province: 'تهران', city: 'تهران',
    address: 'خیابان ساختگی آزمون، پلاک ۱', plaque: '۱', postalCode: '1345678901', isDefault: true,
  } })
  await db.walletAccount.create({ data: { userId: buyer.id, currency: 'IRT', balanceMinor: 1000000n } })
  const post = await db.post.create({ data: {
    slug: 'opening-completion-video', title: 'ویدیوی آزمایشی گزارش و حالت کم‌مصرف', excerpt: 'محتوای ساختگی عمومی برای آزمون محلی.',
    content: '<p>این یک صفحهٔ عمومی ساختگی برای بررسی بازپخش و پشتیبانی است.</p><p>ویدیوی نمونه در کنترل صریح بارگیری می‌شود.</p>',
    format: 'VIDEO', formatData: JSON.stringify({ videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
    cover: image, status: 'PUBLISHED', access: 'PUBLIC', featured: false, authorId: staff.id, publishedAt: new Date(),
  } })
  const game = await db.gameTitle.create({ data: { slug: 'opening-completion-draft-game', title: 'بازی ساختگی کنترل انتشار', status: 'DRAFT', createdById: staff.id } })

  const settings = {
    storeEnabled: 'true', instoreEnabled: 'true', supportEnabled: 'true', journalEnabled: 'true', siteUrl: baseURL,
    'store.delivery.v1': JSON.stringify({ enabled: false, pickup: { enabled: true, address: 'نشانی ساختگی محل تحویل', instructions: 'فقط برای آزمون محلی' } }),
    'shipping.carriers.v1': JSON.stringify({ enabled: false, carriers: [], freeRules: [] }),
  }
  for (const [key, value] of Object.entries(settings)) {
    await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  }
  await db.ticketDepartment.upsert({
    where: { slug: 'GENERAL' },
    create: { slug: 'GENERAL', nameFa: 'پشتیبانی عمومی', nameEn: 'General support', active: true, roleIds: '[]' },
    update: { active: true },
  })

  const cookies = async user => [{
    name: '__Secure-next-auth.session-token', secure: true, url: baseURL,
    value: await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(user.id), sub: String(user.id), role: user.role, email: user.email, authAt: Date.now() } }),
  }]
  const fixture = {
    baseURL, databaseName, staffId: staff.id, buyerId: buyer.id, productId: product.id, aliasCandidateId: aliasCandidate.id,
    locationId: location.id, addressId: address.id, postId: post.id, postPath: `/blog/${post.slug}`, gameId: game.id,
    staffCookies: await cookies(staff), buyerCookies: await cookies(buyer),
  }
  fs.mkdirSync(path.dirname(privateFile), { recursive: true })
  fs.writeFileSync(privateFile, JSON.stringify(fixture), { mode: 0o600 })
  console.log(`Synthetic platform-completion fixtures created; private sessions saved to ${path.relative(process.cwd(), privateFile)}`)
  console.log(`Host output directory: var/${baseName}`)
}

main().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1 })

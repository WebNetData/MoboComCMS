const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const crypto = require('node:crypto')

const prisma = new PrismaClient()

async function main() {
  // --- Roles ---
  const rolesData = [
    { name: 'admin', nameFa: 'مدیر کل', nameEn: 'Super Admin', isSystem: true, permissions: 'dashboard.view,users.manage,subs.manage,orders.manage,finance.manage,invoices.manage,gateways.manage,plans.manage,panels.manage,tickets.handle,tickets.departments.manage,settings.manage,cms.pages,cms.posts,cms.products,roles.manage,resellers.manage,audit.view' },
    { name: 'accountant', nameFa: 'حسابدار', nameEn: 'Accountant', isSystem: false, permissions: 'dashboard.view,finance.manage,invoices.manage,gateways.manage,orders.manage' },
    { name: 'support', nameFa: 'پشتیبان', nameEn: 'Support', isSystem: false, permissions: 'dashboard.view,users.manage,subs.manage,orders.manage,invoices.manage,tickets.handle' },
    // resellers work in their own panel (/reseller) — they must not enter /admin
    { name: 'reseller', nameFa: 'نماینده', nameEn: 'Reseller', isSystem: false, permissions: 'dashboard.view,subs.manage' },
    { name: 'backup', nameFa: 'پشتیبان محتوا', nameEn: 'Content backup', isSystem: false, permissions: 'dashboard.view,cms.pages,cms.posts,cms.products,settings.manage' },
  ]
  for (const r of rolesData) {
    await prisma.role.upsert({ where: { name: r.name }, update: { permissions: r.permissions }, create: r })
  }
  const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } })

  // --- Initial admin + optional demo identities ---
  const seedDemoData = process.env.SEED_DEMO_DATA === 'true'
  const usdMinor = (value) => BigInt(Math.round(Number(value) * 100))
  const randomPassword = () => crypto.randomBytes(24).toString('base64url')
  const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase()
  let admin = await prisma.user.findUnique({ where: { email: adminEmail } })
  let generatedAdminPassword = ''
  if (!admin) {
    const adminPass = process.env.ADMIN_PASSWORD || randomPassword()
    generatedAdminPassword = process.env.ADMIN_PASSWORD ? '' : adminPass
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: bcrypt.hashSync(adminPass, 12),
        name: 'MoboComCMS Admin',
        role: 'ADMIN',
        roleId: adminRole?.id,
      },
    })
  } else {
    admin = await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN', roleId: adminRole?.id } })
  }

  let demoCustomerPassword = ''
  let demoSupportPassword = ''
  if (seedDemoData) {
    const existingCustomer = await prisma.user.findUnique({ where: { email: 'customer@example.com' } })
    if (!existingCustomer) {
      demoCustomerPassword = randomPassword()
      await prisma.user.create({ data: { email: 'customer@example.com', passwordHash: bcrypt.hashSync(demoCustomerPassword, 12), name: 'Demo Customer', role: 'CUSTOMER' } })
    }

    const supportRole = await prisma.role.findUnique({ where: { name: 'support' } })
    const existingSupport = await prisma.user.findUnique({ where: { email: 'support@example.com' } })
    if (!existingSupport) {
      demoSupportPassword = randomPassword()
      await prisma.user.create({
        data: {
          email: 'support@example.com',
          passwordHash: bcrypt.hashSync(demoSupportPassword, 12),
          name: 'Support Agent',
          role: 'ADMIN',
          roleId: supportRole?.id,
        },
      })
    }
  }

  // --- Panels ---
  await prisma.panel.upsert({
    where: { id: 1 },
    update: {},
    create: { name: 'Main Remnawave', type: 'REMNAWAVE', url: 'https://panel1.example.com', token: 'REPLACE_WITH_TOKEN', active: false },
  })
  await prisma.panel.upsert({
    where: { id: 2 },
    update: {},
    create: { name: 'Main PasarGuard', type: 'PASARGUARD', url: 'https://panel2.example.com', token: '', password: 'REPLACE_WITH_PASSWORD', active: false },
  })

  // --- Plans ---
  const plans = [
    { name: 'Starter — 50GB / 30d', trafficGB: 50, days: 30, deviceLimit: 2, price: 2.5, priceMinor: usdMinor(2.5), currency: 'USD', featured: false, sort: 1, panelId: 1 },
    { name: 'Pro — 120GB / 90d', trafficGB: 120, days: 90, deviceLimit: 3, price: 6.5, priceMinor: usdMinor(6.5), currency: 'USD', featured: true, sort: 2, panelId: 1 },
    { name: 'Ultra — 300GB / 180d', trafficGB: 300, days: 180, deviceLimit: 5, price: 12, priceMinor: usdMinor(12), currency: 'USD', featured: false, sort: 3, panelId: 2 },
  ]
  for (const p of plans) {
    const exists = await prisma.plan.findFirst({ where: { name: p.name } })
    if (!exists) await prisma.plan.create({ data: p })
  }

  // --- Pages (page builder demo) ---
  const pages = [
    {
      slug: 'about',
      title: 'درباره ما',
      titleEn: 'About us',
      content: '<h2>درباره MoboComCMS</h2><p>ما تیمی از مهندسان شبکه هستیم که با یک هدف کار می‌کنیم: اینترنت آزاد و امن برای همه.</p><p>سرورهای ما روی زیرساخت NVMe با آپلینک ۱۰ گیگابیتی در بیش از ۳۰ موقعیت جهانی میزبانی می‌شوند.</p>',
      contentEn: '<h2>About MoboComCMS</h2><p>We are a team of network engineers with one goal: free and secure internet for everyone.</p><p>Our servers run on NVMe infrastructure with 10Gbps uplinks across 30+ global locations.</p>',
      showInNav: true,
      sortOrder: 1,
    },
    {
      slug: 'terms',
      title: 'قوانین و شرایط',
      titleEn: 'Terms of service',
      content: '<h2>قوانین استفاده</h2><p>با خرید اشتراک، شما می‌پذیرید که از سرویس فقط برای مقاصد قانونی استفاده کنید.</p>',
      contentEn: '<h2>Terms</h2><p>By purchasing a subscription you agree to use the service for lawful purposes only.</p>',
      showInNav: true,
      sortOrder: 2,
    },
    {
      slug: 'refund',
      title: 'سیاست بازگشت وجه',
      titleEn: 'Refund policy',
      content: '<h2>بازگشت وجه</h2><p>تا ۷ روز پس از خرید، در صورت عدم رضایت مبلغ به کیف پول شما بازگردانده می‌شود.</p>',
      contentEn: '<h2>Refunds</h2><p>Within 7 days of purchase, if unsatisfied, the amount is returned to your wallet.</p>',
      showInNav: false,
      sortOrder: 3,
    },
  ]
  for (const p of pages) {
    await prisma.page.upsert({ where: { slug: p.slug }, update: {}, create: p })
  }

  // --- Post categories & posts ---
  const catNews = await prisma.postCategory.upsert({ where: { slug: 'news' }, update: {}, create: { slug: 'news', name: 'اخبار', nameEn: 'News' } })
  const catGuide = await prisma.postCategory.upsert({ where: { slug: 'guides' }, update: {}, create: { slug: 'guides', name: 'آموزش', nameEn: 'Guides' } })
  const catTech = await prisma.postCategory.upsert({ where: { slug: 'tech' }, update: {}, create: { slug: 'tech', name: 'فناوری', nameEn: 'Tech' } })

  const posts = [
    {
      slug: 'welcome-to-mobocomcms',
      title: 'به MoboComCMS خوش آمدید!',
      titleEn: 'Welcome to MoboComCMS!',
      excerpt: 'با شبکه جهانی جدید ما، اتصال سریع‌تر و پایدارتر از همیشه را تجربه کنید.',
      excerptEn: 'Experience faster and more stable connections with our new global network.',
      content: '<p>ما افتتاح <b>شبکه جهانی MoboComCMS</b> را جشن می‌گیریم: ۳۰+ موقعیت فعال، آپتایم ۹۹.۹٪ و فعال‌سازی آنی اشتراک.</p><h2>چه چیزهایی تغییر کرده؟</h2><ul><li>نودهای جدید در ۱۰ کشور</li><li>پروتکل Reality برای دور زدن سانسور پیشرفته</li><li>پنل کاربری کاملاً بازطراحی‌شده</li></ul>',
      contentEn: '<p>We are celebrating the launch of the <b>MoboComCMS global network</b>: 30+ active locations, 99.9% uptime and instant provisioning.</p><h2>What changed?</h2><ul><li>New nodes in 10 countries</li><li>Reality protocol for advanced censorship bypass</li><li>Fully redesigned user panel</li></ul>',
      category: catNews.id,
      featured: true,
    },
    {
      slug: 'reality-protocol-guide',
      title: 'آموزش راه‌اندازی پروتکل Reality',
      titleEn: 'Reality protocol setup guide',
      excerpt: 'راهنمای گام‌به‌گام اتصال با VLESS Reality روی همه پلتفرم‌ها.',
      excerptEn: 'Step-by-step guide to connect with VLESS Reality on all platforms.',
      content: '<p>پروتکل <code>Reality</code> جدیدترین روش مقابله با تشخیص ترافیک است. در این آموزش با Happ و V2rayNG متصل می‌شوید.</p><h3>مراحل</h3><ol><li>اشتراک را از پنل کاربری کپی کنید</li><li>در اپ Happ گزینه Add subscription را بزنید</li><li>لینک را paste و update کنید</li></ol>',
      contentEn: '<p>The <code>Reality</code> protocol is the latest method against traffic fingerprinting. This guide covers Happ and V2rayNG.</p><h3>Steps</h3><ol><li>Copy your subscription from the user panel</li><li>In Happ, tap Add subscription</li><li>Paste the link and update</li></ol>',
      category: catGuide.id,
      featured: false,
    },
    {
      slug: 'new-york-node',
      title: 'نود جدید نیویورک فعال شد',
      titleEn: 'New York node is live',
      excerpt: 'سرور پرسرعت جدید در نیویورک با پینگ عالی برای کاربران آمریکای شمالی.',
      excerptEn: 'A new high-speed NYC server with excellent latency for North America.',
      content: '<p>نود <b>NYC-1</b> با آپلینک ۱۰ گیگابیت و IPv6 اختصاصی فعال شد. برای همه پلن‌ها بدون هزینه اضافه در دسترس است.</p>',
      contentEn: '<p>The <b>NYC-1</b> node with 10Gbps uplink and dedicated IPv6 is live. Available for all plans at no extra cost.</p>',
      category: catTech.id,
      featured: false,
    },
  ]
  for (const p of posts) {
    const exists = await prisma.post.findUnique({ where: { slug: p.slug } })
    if (!exists) {
      const { category, ...rest } = p
      await prisma.post.create({ data: { ...rest, categoryId: category, authorId: admin.id, status: 'PUBLISHED' } })
    }
  }

  // --- Product categories & products ---
  const catRouter = await prisma.productCategory.upsert({ where: { slug: 'routers' }, update: {}, create: { slug: 'routers', name: 'روتر و مودم', nameEn: 'Routers' } })
  const catAcc = await prisma.productCategory.upsert({ where: { slug: 'accessories' }, update: {}, create: { slug: 'accessories', name: 'اکسسوری', nameEn: 'Accessories' } })

  const products = [
    { slug: 'pre-configured-router', name: 'روتر آماده MoboComCMS', nameEn: 'MoboComCMS Pre-configured Router', description: 'روتر فلش‌شده با کانفیگ کامل — فقط برق و اینترنت وصل کنید.', descriptionEn: 'Flashed router with full config — just plug power and internet.', price: 79, priceMinor: usdMinor(79), currency: 'USD', stock: 10, kind: 'PHYSICAL', featured: true, categoryId: catRouter.id, sortOrder: 1 },
    { slug: 'usb-adapter', name: 'آداپتور USB وایفای', nameEn: 'USB WiFi Adapter', description: 'آداپتور سازگار با لینوکس برای اتصال امن.', descriptionEn: 'Linux-compatible adapter for secure connections.', price: 19, priceMinor: usdMinor(19), currency: 'USD', stock: -1, kind: 'PHYSICAL', featured: false, categoryId: catAcc.id, sortOrder: 2 },
    { slug: 'gift-card-10', name: 'گیفت کارت ۱۰ دلاری', nameEn: '$10 Gift Card', description: 'کارت هدیه برای شارژ حساب.', descriptionEn: 'Gift card to top up any account.', price: 10, priceMinor: usdMinor(10), currency: 'USD', stock: -1, featured: true, categoryId: catAcc.id, sortOrder: 3 },
  ]
  for (const p of products) {
    await prisma.product.upsert({ where: { slug: p.slug }, update: {}, create: p })
  }

  // --- Map locations (25 global nodes) ---
  const locations = [
    ['Germany', 'آلمان', '🇩🇪', 52.52, 13.405, 'Frankfurt'],
    ['Netherlands', 'هلند', '🇳🇱', 52.3676, 4.9041, 'Amsterdam'],
    ['Finland', 'فنلاند', '🇫🇮', 60.1699, 24.9384, 'Helsinki'],
    ['United Kingdom', 'انگلستان', '🇬🇧', 51.5074, -0.1278, 'London'],
    ['France', 'فرانسه', '🇫🇷', 48.8566, 2.3522, 'Paris'],
    ['Turkey', 'ترکیه', '🇹🇷', 41.0082, 28.9784, 'Istanbul'],
    ['United Arab Emirates', 'امارات', '🇦🇪', 25.2048, 55.2708, 'Dubai'],
    ['United States', 'آمریکا', '🇺🇸', 40.7128, -74.006, 'New York'],
    ['United States', 'آمریکا', '🇺🇸', 37.7749, -122.4194, 'San Francisco'],
    ['United States', 'آمریکا', '🇺🇸', 41.8781, -87.6298, 'Chicago'],
    ['Canada', 'کانادا', '🇨🇦', 43.6532, -79.3832, 'Toronto'],
    ['Japan', 'ژاپن', '🇯🇵', 35.6762, 139.6503, 'Tokyo'],
    ['Singapore', 'سنگاپور', '🇸🇬', 1.3521, 103.8198, 'Singapore'],
    ['South Korea', 'کره جنوبی', '🇰🇷', 37.5665, 126.978, 'Seoul'],
    ['Hong Kong', 'هنگ‌کنگ', '🇭🇰', 22.3193, 114.1694, 'Hong Kong'],
    ['Australia', 'استرالیا', '🇦🇺', -33.8688, 151.2093, 'Sydney'],
    ['Sweden', 'سوئد', '🇸🇪', 59.3293, 18.0686, 'Stockholm'],
    ['Switzerland', 'سوئیس', '🇨🇭', 47.3769, 8.5417, 'Zurich'],
    ['Poland', 'لهستان', '🇵🇱', 52.2297, 21.0122, 'Warsaw'],
    ['Austria', 'اتریش', '🇦🇹', 48.2082, 16.3738, 'Vienna'],
    ['Italy', 'ایتالیا', '🇮🇹', 41.9028, 12.4964, 'Milan'],
    ['Spain', 'اسپانیا', '🇪🇸', 40.4168, -3.7038, 'Madrid'],
    ['Brazil', 'برزیل', '🇧🇷', -23.5505, -46.6333, 'São Paulo'],
    ['India', 'هند', '🇮🇳', 19.076, 72.8777, 'Mumbai'],
    ['South Africa', 'آفریقای جنوبی', '🇿🇦', -26.2041, 28.0473, 'Johannesburg'],
  ]
  for (const [country, countryFa, flag, lat, lng, city] of locations) {
    const exists = await prisma.mapLocation.findFirst({ where: { country, city } })
    if (!exists) {
      await prisma.mapLocation.create({ data: { country, countryFa, flag, lat, lng, city, active: true } })
    }
  }

  // --- Payment gateways ---
  if ((await prisma.gateway.count()) === 0) {
    const plisioKey = process.env.PLISIO_API_KEY || ''
    const plisioSecret = process.env.PLISIO_SECRET_KEY || ''
    await prisma.gateway.create({
      data: {
        name: 'Plisio — crypto checkout',
        provider: 'PLISIO',
        apiKey: plisioKey,
        secretKey: plisioSecret,
        fiat: 'USD',
        currencies: 'BTC,ETH,USDT_TRX,USDT_TON,LTC,TRX,TON',
        feePercent: 0.5,
        feeBps: 50,
        active: Boolean(plisioKey),
        isDefault: Boolean(plisioKey),
        sortOrder: 2,
      },
    })
    const frenzyKey = process.env.FRENZYEX_API_KEY || ''
    const frenzySecret = process.env.FRENZYEX_CALLBACK_SECRET || ''
    await prisma.gateway.create({
      data: {
        name: 'درگاه پرداخت ارزی ریالی',
        provider: 'FRENZYEX',
        apiKey: frenzyKey,
        secretKey: frenzySecret,
        fiat: 'TMN',
        feePercent: 0,
        feeBps: 0,
        active: Boolean(frenzyKey && frenzySecret),
        isDefault: !plisioKey && Boolean(frenzyKey && frenzySecret),
        sortOrder: 1,
      },
    })
    await prisma.gateway.create({
      data: {
        name: 'Card / USDT transfer',
        provider: 'MANUAL',
        fiat: 'USD',
        active: false,
        sortOrder: 3,
        instructions: [
          'USDT (TRC20): TXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          'Bank card: 6037-XXXX-XXXX-XXXX  (holder: MoboComCMS)',
          'Send the exact amount and reply to this invoice with the transaction id.',
        ].join('\n'),
      },
    })
  }

  // Existing installations may already have other gateways, so make the new
  // provider discoverable without overwriting an administrator's gateway choices.
  if (!(await prisma.gateway.findFirst({ where: { provider: 'FRENZYEX' } }))) {
    const frenzyKey = process.env.FRENZYEX_API_KEY || ''
    const frenzySecret = process.env.FRENZYEX_CALLBACK_SECRET || ''
    await prisma.gateway.create({
      data: {
        name: 'درگاه پرداخت ارزی ریالی',
        provider: 'FRENZYEX',
        apiKey: frenzyKey,
        secretKey: frenzySecret,
        fiat: 'TMN',
        feePercent: 0,
        feeBps: 0,
        active: Boolean(frenzyKey && frenzySecret),
        isDefault: false,
        sortOrder: 1,
      },
    })
  }

  // --- Demo bookkeeping: costs + invoices for already paid orders ---
  if (seedDemoData && (await prisma.expense.count()) === 0) {
    const now = new Date()
    const day = (d) => new Date(now.getFullYear(), now.getMonth(), d)
    await prisma.expense.createMany({
      data: [
        { title: 'DE Frankfurt node (monthly)', category: 'SERVER', amount: 24, amountMinor: usdMinor(24), currency: 'USD', spentAt: day(3) },
        { title: 'NL Amsterdam node (monthly)', category: 'SERVER', amount: 18, amountMinor: usdMinor(18), currency: 'USD', spentAt: day(5) },
        { title: 'Telegram ad campaign', category: 'MARKETING', amount: 15, amountMinor: usdMinor(15), currency: 'USD', spentAt: day(8) },
        { title: 'Payment gateway fees', category: 'PAYMENT_FEE', amount: 6, amountMinor: usdMinor(6), currency: 'USD', spentAt: day(12) },
      ],
    })
  }

  // demo sales history so the finance dashboard has a curve to show
  if (seedDemoData && (await prisma.order.count()) === 0) {
    const demoCustomer = await prisma.user.findUnique({ where: { email: 'customer@example.com' } })
    const allPlans = await prisma.plan.findMany({ orderBy: { id: 'asc' }, take: 3 })
    const firstGateway = await prisma.gateway.findFirst({ orderBy: { sortOrder: 'asc' } })
    const now = new Date()
    if (demoCustomer && allPlans.length) {
      for (let i = 0; i < 15; i++) {
        const plan = allPlans[i % allPlans.length]
        const monthsBack = 4 - Math.floor(i / 3)
        const when = new Date(now.getFullYear(), now.getMonth() - monthsBack, 5 + (i % 3) * 8)
        await prisma.order.create({
          data: {
            userId: demoCustomer.id,
            planId: plan.id,
            totalAmount: plan.price,
            totalMinor: plan.priceMinor || usdMinor(plan.price),
            currency: plan.currency || 'USD',
            status: 'PAID',
            provider: 'plisio',
            gatewayId: firstGateway ? firstGateway.id : null,
            paidCrypto: i % 2 ? 'USDT_TRX' : 'BTC',
            paidAmount: String(plan.price),
            providerTxnId: 'demo-txn-' + (i + 1),
            createdAt: when,
            updatedAt: when,
          },
        })
      }
    }
  }

  const paidOrders = seedDemoData ? await prisma.order.findMany({ where: { status: 'PAID' }, orderBy: { id: 'asc' }, take: 30 }) : []
  let seq = await prisma.invoice.count()
  const year = new Date().getFullYear()
  for (const order of paidOrders) {
    const existing = await prisma.invoice.findFirst({ where: { orderId: order.id } })
    if (existing) continue
    seq += 1
    const paidAt = new Date(order.updatedAt || order.createdAt)
    const invoice = await prisma.invoice.create({
      data: {
        number: `KV-${year}-${String(seq).padStart(4, '0')}`,
        userId: order.userId,
        orderId: order.id,
        planId: order.planId,
        productId: order.productId,
        subtotal: order.totalAmount,
        subtotalMinor: order.totalMinor || usdMinor(order.totalAmount),
        total: order.totalAmount,
        totalMinor: order.totalMinor || usdMinor(order.totalAmount),
        currency: order.currency,
        status: 'PAID',
        paidAmount: order.totalAmount,
        paidAmountMinor: order.totalMinor || usdMinor(order.totalAmount),
        paidCrypto: order.paidCrypto || '',
        providerTxnId: order.providerTxnId || '',
        issuedAt: order.createdAt,
        paidAt,
      },
    })
    await prisma.payment.create({
      data: {
        userId: order.userId,
        orderId: order.id,
        invoiceId: invoice.id,
        provider: (order.provider || 'plisio').toUpperCase(),
        providerTxnId: order.providerTxnId || `seed-${order.id}`,
        amount: order.totalAmount,
        amountMinor: order.totalMinor || usdMinor(order.totalAmount),
        currency: order.currency,
        fee: 0,
        feeMinor: 0n,
        eventKey: `seed-order:${order.id}`,
        cryptoCurrency: order.paidCrypto || '',
        cryptoAmount: order.paidAmount || '',
        status: 'CONFIRMED',
        createdAt: paidAt,
        confirmedAt: paidAt,
        raw: JSON.stringify({ seeded: true }),
      },
    })
  }

  // --- Settings ---
  const settings = [
    { key: 'brandName', value: 'MoboComCMS' },
    { key: 'brandTagline', value: 'اینترنت آزاد، سریع و امن' },
    { key: 'supportTelegram', value: '@MoboComCMS' },
    { key: 'supportEmail', value: 'support@example.com' },
    { key: 'siteUrl', value: process.env.NEXTAUTH_URL || 'http://localhost:3000' },
    { key: 'usdRateToman', value: String(process.env.FRENZYEX_USD_RATE_TOMAN || '0').trim() || '0' },
    { key: 'themeColor', value: '#4b45ee' },
    { key: 'statsUsers', value: '50000' },
    { key: 'statsServers', value: '120' },
    { key: 'statsCountries', value: '30' },
  ]
  for (const s of settings) {
    await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: s })
  }

  // The PostgreSQL migration seeds these too; upsert keeps SQLite setup in sync.
  const supportRoleIds = (await prisma.role.findMany({ where: { permissions: { contains: 'tickets.handle' } }, select: { id: true } })).map(role => role.id)
  for (const department of [
    { slug: 'GENERAL', nameFa: 'پشتیبانی عمومی', nameEn: 'General support', descriptionFa: 'سؤالات عمومی', descriptionEn: 'General questions', sortOrder: 30 },
    { slug: 'SALES', nameFa: 'فروش و پیش از خرید', nameEn: 'Sales & pre-purchase', descriptionFa: 'راهنمای خرید', descriptionEn: 'Questions before purchase', sortOrder: 10 },
    { slug: 'SUBSCRIPTION', nameFa: 'پشتیبانی اشتراک', nameEn: 'Subscription support', descriptionFa: 'پشتیبانی اشتراک فعال', descriptionEn: 'Help with an active subscription', requiresSubscription: true, sortOrder: 20 },
    { slug: 'PRODUCT', nameFa: 'پشتیبانی محصول', nameEn: 'Product support', descriptionFa: 'پشتیبانی محصول خریداری‌شده', descriptionEn: 'Help with a purchased product', requiresProduct: true, sortOrder: 25 },
  ]) await prisma.ticketDepartment.upsert({ where: { slug: department.slug }, update: {}, create: { ...department, roleIds: JSON.stringify(supportRoleIds) } })

  console.log('✅ Seed complete. Admin:', admin.email)
  if (generatedAdminPassword) console.log('⚠️  Generated initial admin password (store it now):', generatedAdminPassword)
  if (seedDemoData) {
    console.log('⚠️  Demo data is enabled. Never enable SEED_DEMO_DATA in production.')
    if (demoCustomerPassword) console.log('Demo customer password:', demoCustomerPassword)
    if (demoSupportPassword) console.log('Demo support password:', demoSupportPassword)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

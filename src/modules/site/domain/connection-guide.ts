export const guidePlatforms = ['android', 'ios', 'windows', 'macos', 'linux'] as const
export type GuidePlatform = typeof guidePlatforms[number]
export const platformNames: Record<GuidePlatform, string> = { android: 'Android', ios: 'iPhone / iPad', windows: 'Windows', macos: 'macOS', linux: 'Linux' }
export type GuideText = { fa: string; en: string }
export type PlatformGuide = { downloadUrl: string; install: GuideText; import: GuideText; connect: GuideText; troubleshoot: GuideText }
export type ConnectionGuideConfig = { platforms: Record<GuidePlatform, PlatformGuide> }
const downloads: Record<GuidePlatform, string> = {
  android: 'https://play.google.com/store/apps/details?id=com.happproxy',
  ios: 'https://apps.apple.com/us/app/happ-proxy-utility/id6504287215',
  windows: 'https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe',
  macos: 'https://apps.apple.com/us/app/happ-proxy-utility/id6504287215',
  linux: 'https://www.happ.su/main',
}
// Download sources verified against https://www.happ.su/main on 2026-09-22.
export const defaultConnectionGuide: ConnectionGuideConfig = { platforms: Object.fromEntries(guidePlatforms.map(platform => [platform, {
  downloadUrl: downloads[platform],
  install: { fa: `برنامه Happ مناسب ${platformNames[platform]} را از لینک زیر نصب کنید. سپس به همین صفحه برگردید و مرحله بعد را انتخاب کنید.${platform === 'linux' ? ' بسته متناسب با توزیع لینوکس خود را از صفحه رسمی انتخاب کنید.' : ''}`, en: `Install Happ for ${platformNames[platform]} using the link below, then return here and continue.${platform === 'linux' ? ' Choose the package matching your distribution on the official page.' : ''}` },
  import: { fa: 'لینک اشتراک مستقیماً از VPN Panel دریافت می‌شود. اگر دکمه «باز کردن در Happ» فعال بود آن را بزنید؛ در غیر این صورت لینک ساب پنل را کپی و داخل Happ وارد کنید یا QR را با Happ اسکن کنید.', en: 'The subscription URL comes directly from the VPN panel. Use “Open in Happ” when available; otherwise copy the panel subscription URL into Happ or scan the QR with Happ.' },
  connect: { fa: 'در Happ اشتراک اضافه‌شده را انتخاب و اتصال را روشن کنید. اگر سیستم‌عامل درخواست مجوز VPN کرد، آن را بررسی و تأیید کنید. سپس یک وب‌سایت را در مرورگر باز کنید. آماده بودن لینک در این صفحه به معنی تأیید اتصال دستگاه شما نیست.', en: 'Select the imported subscription in Happ and start the connection. Review and accept the operating system’s VPN permission if prompted. Open a website in your browser to check. A ready link here does not verify that your device is connected.' },
  troubleshoot: { fa: 'برنامه باز نمی‌شود: نصب Happ را بررسی کنید و لینک را دستی وارد کنید.\nلینک آماده نیست: «بررسی دوباره» را بزنید و در صورت ادامه خطا با پشتیبانی تماس بگیرید.\nاینترنت وصل نمی‌شود: ابتدا اینترنت عادی، تاریخ انقضا و حجم باقی‌مانده را بررسی کنید. برنامه را به‌روز کنید و دوباره تلاش کنید.\nبرای پشتیبانی نام دستگاه و متن خطا را بنویسید؛ لینک خصوصی اشتراک را در پیام عمومی نفرستید.', en: 'App will not open: check that Happ is installed and import the link manually.\nLink unavailable: select “Check again”; contact support if it persists.\nNo internet: check your regular connection, subscription expiry and remaining data. Update the app and try again.\nTell support your device and error message. Do not post your private subscription link publicly.' },
}])) as Record<GuidePlatform, PlatformGuide> }

export function validateConnectionGuide(input: unknown): ConnectionGuideConfig {
  const source = input as any
  if (!source || typeof source !== 'object' || !source.platforms) throw new Error('راهنما معتبر نیست')
  const platforms = {} as Record<GuidePlatform, PlatformGuide>
  for (const platform of guidePlatforms) {
    const item = source.platforms[platform]
    if (!item || typeof item.downloadUrl !== 'string' || item.downloadUrl.length > 2048) throw new Error('لینک دانلود معتبر نیست')
    const downloadUrl = item.downloadUrl.trim()
    if (downloadUrl) {
      let url: URL
      try { url = new URL(downloadUrl) } catch { throw new Error('لینک دانلود باید HTTPS باشد') }
      if (url.protocol !== 'https:' || url.username || url.password || /[\s\\]/.test(downloadUrl)) throw new Error('لینک دانلود باید HTTPS و بدون اطلاعات ورود باشد')
    }
    const next = { downloadUrl } as PlatformGuide
    for (const field of ['install', 'import', 'connect', 'troubleshoot'] as const) {
      next[field] = { fa: '', en: '' }
      for (const locale of ['fa', 'en'] as const) {
        const text = item[field]?.[locale]
        if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw new Error('متن هر مرحله در هر زبان باید بین ۱ تا ۴۰۰۰ کاراکتر باشد')
        next[field][locale] = text.trim()
      }
    }
    platforms[platform] = next
  }
  return { platforms }
}

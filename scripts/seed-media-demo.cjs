/**
 * Demo content for the music, film & series, games and VIP modules.
 *   node --env-file=.env scripts/seed-media-demo.cjs
 * Safe to run more than once (upserts by slug). Also switches the four modules on.
 * Remove the demo later from the admin panel (every item slug starts with "demo-").
 */
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const img = (seed, w, h) => `https://picsum.photos/seed/${seed}/${w}/${h}`
const song = (n) => `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${n}.mp3`
const ago = (days) => new Date(Date.now() - days * 86400000)

async function enableModule(id) {
  const key = `extension.${id}.state.v1`
  const row = await prisma.setting.findUnique({ where: { key } })
  let state = { enabled: true, settings: {} }
  try { if (row?.value) state = { ...JSON.parse(row.value), enabled: true } } catch { /* keep default */ }
  await prisma.setting.upsert({ where: { key }, update: { value: JSON.stringify(state) }, create: { key, value: JSON.stringify(state) } })
}

async function main() {
  for (const id of ['music', 'cinema', 'games', 'membership']) await enableModule(id)

  // ---------------- music
  const artistsData = [
    ['demo-sirvan', 'سیروان خسروی', 'Sirvan Khosravi'],
    ['demo-homayoun', 'همایون شجریان', 'Homayoun Shajarian'],
    ['demo-shadmehr', 'شادمهر عقیلی', 'Shadmehr Aghili'],
    ['demo-googoosh', 'گوگوش', 'Googoosh'],
    ['demo-chavoshi', 'محسن چاوشی', 'Mohsen Chavoshi'],
    ['demo-ebi', 'ابی', 'Ebi'],
  ]
  const artists = []
  for (const [i, [slug, name, nameEn]] of artistsData.entries()) {
    const data = { name, nameEn, image: img(slug, 400, 400), cover: img(slug + '-cover', 1600, 600), bio: `<p>${name} از خوانندگان محبوب موسیقی ایران است. (متن نمونه)</p>`, featured: i < 4 }
    artists.push(await prisma.musicArtist.upsert({ where: { slug }, update: data, create: { slug, ...data } }))
  }
  const albums = []
  for (let i = 0; i < 6; i++) {
    const slug = `demo-album-${i + 1}`
    const artist = artists[i % artists.length]
    const data = { title: ['شب‌های تهران', 'بی‌قرار', 'آسمان', 'دلتنگی', 'رویا', 'سفر'][i], titleEn: ['Tehran Nights', 'Restless', 'Sky', 'Longing', 'Dream', 'Journey'][i], artistId: artist.id, cover: img(slug, 600, 600), year: 2019 + i, genre: ['پاپ', 'سنتی', 'راک', 'پاپ', 'تلفیقی', 'پاپ'][i], description: '<p>آلبوم نمونه برای نمایش امکانات بخش موزیک.</p>', access: i === 1 ? 'MEMBERS' : 'PUBLIC', status: 'PUBLISHED', featured: i < 3, publishedAt: ago(i * 3) }
    albums.push(await prisma.musicAlbum.upsert({ where: { slug }, update: data, create: { slug, ...data } }))
  }
  const titles = ['بی‌تو هرگز', 'باران', 'خیابان', 'ماه من', 'فردا', 'نفس', 'پرواز', 'آتش', 'دریا', 'سکوت', 'کوچه', 'نور', 'شب', 'بهار', 'رفیق', 'خاطره']
  const tracks = []
  for (let i = 0; i < titles.length; i++) {
    const slug = `demo-track-${i + 1}`
    const album = i < 12 ? albums[i % albums.length] : null
    const artistId = album ? album.artistId : artists[i % artists.length].id
    const data = {
      title: titles[i], titleEn: `Demo Song ${i + 1}`, artistId, albumId: album ? album.id : null, trackNo: Math.floor(i / albums.length) + 1,
      cover: album ? '' : img(slug, 500, 500), audioUrl: song((i % 16) + 1), audioHqUrl: i % 2 === 0 ? song((i % 16) + 1) : '',
      duration: 180 + (i * 17) % 160, genre: ['پاپ', 'سنتی', 'راک', 'تلفیقی'][i % 4],
      lyrics: 'این یک متن نمونه برای ترانه است\nخط دوم ترانه\nخط سوم ترانه\n\nبند دوم\nخط پنجم\nخط ششم\nخط هفتم',
      access: i === 3 || i === 9 ? 'MEMBERS' : 'PUBLIC', status: 'PUBLISHED', featured: i < 5, plays: 5000 - i * 250, publishedAt: ago(i),
    }
    tracks.push(await prisma.musicTrack.upsert({ where: { slug }, update: data, create: { slug, ...data } }))
  }
  const playlists = [['demo-pl-chill', 'آرامش', 'Chill'], ['demo-pl-workout', 'ورزش', 'Workout'], ['demo-pl-drive', 'رانندگی', 'Road trip'], ['demo-pl-focus', 'تمرکز', 'Focus']]
  for (const [i, [slug, title, titleEn]] of playlists.entries()) {
    const data = { title, titleEn, cover: img(slug, 600, 400), description: `پلی‌لیست ${title}`, trackIds: JSON.stringify(tracks.filter((_, j) => (j + i) % 3 === 0).map((t) => t.id)), access: i === 1 ? 'MEMBERS' : 'PUBLIC', status: 'PUBLISHED', featured: true, sortOrder: i }
    await prisma.musicPlaylist.upsert({ where: { slug }, update: data, create: { slug, ...data } })
  }

  // ---------------- cinema
  const movies = [
    ['تلقین', 'Inception', 2010, 8.8, 'علمی تخیلی, اکشن', 'Christopher Nolan'],
    ['میان‌ستاره‌ای', 'Interstellar', 2014, 8.7, 'علمی تخیلی, درام', 'Christopher Nolan'],
    ['پدرخوانده', 'The Godfather', 1972, 9.2, 'جنایی, درام', 'Francis Ford Coppola'],
    ['انگل', 'Parasite', 2019, 8.5, 'درام, هیجانی', 'Bong Joon Ho'],
    ['جوکر', 'Joker', 2019, 8.4, 'جنایی, درام', 'Todd Phillips'],
    ['اوپنهایمر', 'Oppenheimer', 2023, 8.3, 'درام, تاریخی', 'Christopher Nolan'],
    ['شوالیه تاریکی', 'The Dark Knight', 2008, 9.0, 'اکشن, جنایی', 'Christopher Nolan'],
    ['درباره الی', 'About Elly', 2009, 7.9, 'درام', 'Asghar Farhadi'],
  ]
  const series = [
    ['بریکینگ بد', 'Breaking Bad', 2008, 9.5, 'جنایی, درام', 3],
    ['دارک', 'Dark', 2017, 8.7, 'علمی تخیلی, معمایی', 2],
    ['چرنوبیل', 'Chernobyl', 2019, 9.3, 'درام, تاریخی', 1],
    ['شرلوک', 'Sherlock', 2010, 9.1, 'جنایی, معمایی', 2],
  ]
  const demoLinks = (seed, members) => [
    { label: 'نسخه BluRay', kind: 'DOWNLOAD', quality: '1080p', size: '2.1 GB', audio: 'DUBBED', subtitle: false, url: `https://example.com/demo/${seed}-1080-dub.mkv`, access: 'PUBLIC', sortOrder: 0 },
    { label: 'نسخه x265', kind: 'DOWNLOAD', quality: '4K', size: '6.4 GB', audio: 'DUBBED', subtitle: false, url: `https://example.com/demo/${seed}-4k-dub.mkv`, access: 'MEMBERS', sortOrder: 1 },
    { label: 'پخش آنلاین', kind: 'STREAM', quality: '720p', size: '', audio: 'ORIGINAL', subtitle: true, url: `https://example.com/demo/${seed}-stream`, access: members ? 'MEMBERS' : 'PUBLIC', sortOrder: 2 },
    { label: 'WEB-DL', kind: 'DOWNLOAD', quality: '480p', size: '650 MB', audio: 'ORIGINAL', subtitle: true, url: `https://example.com/demo/${seed}-480.mkv`, access: 'PUBLIC', sortOrder: 3 },
  ]
  const cast = JSON.stringify([{ name: 'بازیگر اول', role: 'نقش اصلی', image: img('cast1', 200, 200) }, { name: 'بازیگر دوم', role: 'نقش مکمل', image: img('cast2', 200, 200) }, { name: 'بازیگر سوم', role: '', image: img('cast3', 200, 200) }])
  const allTitles = [...movies.map((m) => ({ kind: 'MOVIE', m })), ...series.map((m) => ({ kind: 'SERIES', m }))]
  for (const [i, { kind, m }] of allTitles.entries()) {
    const slug = `demo-${m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    const data = {
      kind, title: m[0], titleEn: m[1], originalTitle: m[1], poster: img(slug, 400, 600), backdrop: img(slug + '-bg', 1600, 900), year: m[2], imdbRating: m[3], imdbId: '',
      runtime: kind === 'MOVIE' ? 110 + i * 5 : 50, ageRating: '+13', countries: i === 7 ? 'ایران' : 'آمریکا', languages: i === 7 ? 'فارسی' : 'انگلیسی', genres: m[4], director: kind === 'MOVIE' ? m[5] : '', cast,
      summary: `${m[0]} یک اثر نمونه است که برای نمایش امکانات بخش فیلم و سریال ثبت شده. داستان درباره شخصیتی است که در مسیری پرچالش قرار می‌گیرد.`, summaryEn: 'Demo synopsis.',
      trailerUrl: 'https://www.youtube.com/watch?v=YoHD9XEInc0', quality: i % 3 === 0 ? '4K' : '1080p', dubbed: i % 2 === 0, subtitle: true,
      seriesStatus: kind === 'SERIES' ? (i % 2 ? 'ENDED' : 'ONGOING') : '', endYear: kind === 'SERIES' ? m[2] + 4 : null,
      access: i === 2 || i === 9 ? 'MEMBERS' : 'PUBLIC', status: 'PUBLISHED', featured: i < 5 || i === 8, views: 1000 - i * 40, publishedAt: ago(i),
    }
    const title = await prisma.cinemaTitle.upsert({ where: { slug }, update: data, create: { slug, ...data } })
    // Links and seasons are rebuilt on every run.
    const oldSeasons = await prisma.cinemaSeason.findMany({ where: { titleId: title.id }, select: { episodes: { select: { id: true } } } })
    const oldEpisodes = oldSeasons.flatMap((s) => s.episodes.map((e) => e.id))
    await prisma.mediaLink.deleteMany({ where: { OR: [{ ownerType: 'title', ownerId: title.id }, ...(oldEpisodes.length ? [{ ownerType: 'episode', ownerId: { in: oldEpisodes } }] : [])] } })
    await prisma.cinemaSeason.deleteMany({ where: { titleId: title.id } })
    if (kind === 'MOVIE') {
      await prisma.mediaLink.createMany({ data: demoLinks(slug, data.access === 'MEMBERS').map((l) => ({ ...l, ownerType: 'title', ownerId: title.id })) })
    } else {
      for (let s = 1; s <= m[5]; s++) {
        const season = await prisma.cinemaSeason.create({ data: { titleId: title.id, number: s, name: '', poster: '' } })
        for (let e = 1; e <= 6; e++) {
          const episode = await prisma.cinemaEpisode.create({ data: { seasonId: season.id, number: e, title: `قسمت ${e}`, titleEn: `Episode ${e}`, summary: 'خلاصه نمونهٔ این قسمت.', still: img(`${slug}-s${s}e${e}`, 480, 270), runtime: 45 + e, airDate: ago(400 - s * 60 - e * 7), access: e === 6 ? 'MEMBERS' : 'PUBLIC' } })
          await prisma.mediaLink.createMany({ data: demoLinks(`${slug}-s${s}e${e}`, false).slice(0, 2).map((l) => ({ ...l, ownerType: 'episode', ownerId: episode.id })) })
        }
      }
    }
  }

  // ---------------- games
  const games = [
    ['الدن رینگ', 'Elden Ring', 'PC, PS5, Xbox Series', 'نقش‌آفرینی, اکشن', 'FromSoftware', 96, 8.7],
    ['گاد آو وار: رگناروک', 'God of War Ragnarök', 'PS5, PS4, PC', 'اکشن, ماجرایی', 'Santa Monica Studio', 94, 9.0],
    ['سایبرپانک ۲۰۷۷', 'Cyberpunk 2077', 'PC, PS5, Xbox Series', 'نقش‌آفرینی, شوتر', 'CD Projekt Red', 86, 8.1],
    ['رد دد ردمپشن ۲', 'Red Dead Redemption 2', 'PC, PS4, Xbox One', 'اکشن, ماجرایی', 'Rockstar Games', 97, 9.1],
    ['هالو اینفینیت', 'Halo Infinite', 'PC, Xbox Series', 'شوتر', '343 Industries', 80, 6.8],
    ['کلش رویال', 'Clash Royale', 'Android, iOS', 'استراتژی', 'Supercell', 74, 7.2],
    ['جی‌تی‌ای ۶', 'GTA VI', 'PS5, Xbox Series', 'اکشن, جهان باز', 'Rockstar Games', null, null],
  ]
  for (const [i, g] of games.entries()) {
    const slug = `demo-${g[1].toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    const data = {
      title: g[0], titleEn: g[1], cover: img(slug, 450, 600), backdrop: img(slug + '-bg', 1600, 900), platforms: g[2], genres: g[3], developer: g[4], publisher: g[4],
      releaseDate: i === 6 ? new Date(Date.now() + 200 * 86400000) : ago(300 + i * 90), score: g[5], userScore: g[6], ageRating: 'PEGI 16', trailerUrl: 'https://www.youtube.com/watch?v=E3Huy2cdih0',
      screenshots: JSON.stringify([1, 2, 3, 4].map((n) => ({ src: img(`${slug}-shot${n}`, 1280, 720) }))),
      summary: `${g[0]} یکی از بازی‌های نمونه برای نمایش بخش بازی است؛ دنیایی بزرگ، مبارزات عمیق و داستانی جذاب.`,
      content: '<p>این متن نمونهٔ نقد و بررسی است. در بخش مدیریت می‌توانید نقد کامل را با تصویر و تیتر بنویسید.</p><h2>گیم‌پلی</h2><p>مبارزات سریع و دقیق.</p>',
      pros: JSON.stringify([{ text: 'دنیای باز عظیم' }, { text: 'گرافیک چشم‌نواز' }, { text: 'موسیقی فوق‌العاده' }]),
      cons: JSON.stringify([{ text: 'افت فریم در برخی صحنه‌ها' }]),
      requirements: JSON.stringify({ min: { os: 'Windows 10 64-bit', cpu: 'Intel Core i5-8400', gpu: 'GTX 1060 3GB', ram: '12 GB', storage: '60 GB' }, rec: { os: 'Windows 11 64-bit', cpu: 'Intel Core i7-8700K', gpu: 'RTX 2070', ram: '16 GB', storage: '60 GB SSD' } }),
      access: i === 3 ? 'MEMBERS' : 'PUBLIC', status: 'PUBLISHED', featured: i < 4, views: 800 - i * 50, publishedAt: ago(i),
    }
    const game = await prisma.gameTitle.upsert({ where: { slug }, update: data, create: { slug, ...data } })
    await prisma.mediaLink.deleteMany({ where: { ownerType: 'game', ownerId: game.id } })
    await prisma.mediaLink.createMany({ data: [
      { label: 'نسخه کامل (Repack)', kind: 'DOWNLOAD', quality: 'PC', size: '45 GB', audio: '', subtitle: false, url: `https://example.com/demo/${slug}-repack`, access: 'PUBLIC', sortOrder: 0, ownerType: 'game', ownerId: game.id },
      { label: 'لینک مستقیم پرسرعت', kind: 'DOWNLOAD', quality: 'PC', size: '45 GB', audio: '', subtitle: false, url: `https://example.com/demo/${slug}-direct`, access: 'MEMBERS', sortOrder: 1, ownerType: 'game', ownerId: game.id },
    ] })
  }

  // ---------------- VIP plans
  const plans = [
    ['demo-vip-1m', 'یک‌ماهه', 'Monthly', 30, 300n, false, [['🎬', 'همه فیلم‌ها و سریال‌ها', 'All films & series'], ['🎧', 'موزیک با کیفیت ۳۲۰', '320 kbps music']]],
    ['demo-vip-3m', 'سه‌ماهه', 'Quarterly', 90, 800n, true, [['🎬', 'همه فیلم‌ها و سریال‌ها', 'All films & series'], ['🎧', 'موزیک ۳۲۰ و دانلود', '320 kbps & downloads'], ['🏷', 'قیمت ویژه فروشگاه', 'Member store prices']]],
    ['demo-vip-12m', 'سالانه', 'Yearly', 365, 2500n, false, [['♛', 'همه امکانات VIP', 'Everything in VIP'], ['🎁', 'کدهای تخفیف اختصاصی', 'Exclusive discount codes']]],
  ]
  for (const [i, [slug, name, nameEn, days, priceMinor, highlight, perks]] of plans.entries()) {
    const data = { name, nameEn, description: `${days} روز دسترسی کامل`, descriptionEn: `${days} days of full access`, days, priceMinor, currency: 'USD', perks: JSON.stringify(perks.map(([icon, fa, en]) => ({ icon, fa, en }))), highlight, active: true, sortOrder: i }
    await prisma.membershipPlan.upsert({ where: { slug }, update: data, create: { slug, ...data } })
  }

  console.log('Demo media ready: /music  /cinema  /games  /vip')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())

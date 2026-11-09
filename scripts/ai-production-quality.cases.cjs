const { test } = require('node:test'), assert = require('node:assert/strict'), source = require('./connected-source-loader.cjs')
const config = { categoryIds: [], length: 'medium', tone: '', keywords: 'هدفون، نویز', instruction: '', cover: true, inline: 1, imageStyle: '', ratio: 'landscape', productKind: 'PHYSICAL', currency: 'IRT', specifications: '{"battery":"30"}' }
const seed = { topic: 'هدفون بی‌سیم', facts: 'باتری ۳۰ ساعت، بلوتوث ۵.۳', price: '1200', stock: 1 }
const body = 'این هدفون برای سفر و کار روزانه طراحی شده است و صدای متعادلی دارد. حذف نویز آن در محیط شلوغ کمک می‌کند. '.repeat(3)
const output = (extra = '') => ({ title: 'معرفی هدفون بی‌سیم', slug: 'wireless-headphone', excerpt: 'معرفی کوتاه هدفون بی‌سیم با حذف نویز برای استفادهٔ روزانه و سفر.', coverPrompt: 'هدفون روی میز', coverDescription: 'هدفون بی‌سیم روی میز', sections: [{ heading: 'طراحی', text: body + extra, imagePrompt: 'هدفون در سفر', imageDescription: 'هدفون در سفر' }, { heading: 'باتری', text: 'باتری ۳۰ ساعت کار می‌کند و بلوتوث ۵.۳ دارد. ' + body, imagePrompt: '', imageDescription: '' }] })
const images = [{ index: 0, url: '/a.webp', alt: 'هدفون بی‌سیم روی میز', caption: 'تصویرسازی هوش مصنوعی' }, { index: 1, url: '/b.webp', alt: 'هدفون در سفر', caption: 'تصویرسازی هوش مصنوعی' }]

test('production quality: facts from the brief pass, invented numbers, prices, warranty and missing images block a product', () => {
  const q = source()('src/modules/ai/domain/production-quality.ts')
  const run = (out, kind = 'product', extra = {}) => q.summarize(q.qualityProfileOf(kind, { ...config, ...extra }), q.textChecks({ kind, config: { ...config, ...extra }, seed, output: out, images: extra.images || images }), [])
  const clean = run(output())
  assert.equal(clean.level, 'pass', JSON.stringify(clean.findings))
  const numbers = run(output('ظرفیت باتری ۴۵ ساعت است.'))
  assert.equal(numbers.areas.claims, 'block')
  assert.equal(run(output('قیمت آن ۲ میلیون تومان است.')).areas.profile, 'block')
  assert.equal(run(output('این محصول ۱۸ ماه گارانتی دارد.')).areas.profile, 'block')
  assert.equal(run(output('این دستگاه سردرد را درمان می‌کند.')).areas.profile, 'block')
  assert.equal(run(output(), 'product', { images: [images[0]] }).areas.images, 'block')
  assert.equal(run(output(), 'product', { images: [images[0], { ...images[1], alt: 'منظرهٔ کوهستان برفی زمستان' }] }).areas.images, 'warn')
})

test('production quality: magazine, music, film and page rules differ', () => {
  const q = source()('src/modules/ai/domain/production-quality.ts')
  const check = (kind, profile, extra) => q.textChecks({ kind, config: { ...config, qualityProfile: profile, specifications: '{}' }, seed: { ...seed, facts: '' }, output: output(extra), images })
  assert(check('post', 'magazine', 'تحقیقات نشان می‌دهد این بهترین هدفون است.').some(f => f.area === 'claims' && f.level === 'warn'))
  assert(check('post', 'magazine', 'ما آن را تست کردیم و راضی بودیم.').some(f => f.level === 'block'))
  assert(check('post', 'music', 'آلبوم تازهٔ او در بیلبورد رتبه گرفت.').some(f => f.title.includes('موسیقی')))
  assert(check('post', 'music', '«' + 'این سطر ترانه است و تکرار می‌شود '.repeat(5) + '»').some(f => f.level === 'block'))
  assert(check('post', 'film', 'در پایان فیلم قهرمان می‌میرد و کارگردان جایزه گرفت.').filter(f => f.area === 'profile').length >= 2)
  assert(check('page', 'page', 'با ما در تماس باشید: info@example.com').some(f => f.level === 'block'))
  assert.equal(q.qualityProfileFits('product', 'music'), false)
  assert.equal(q.qualityProfileOf('post', {}), 'magazine')
})

test('production quality: similarity, links and Persian normalization', () => {
  const q = source()('src/modules/ai/domain/production-quality.ts')
  assert(q.similarity('معرفی هدفون بی‌سیم سونی', 'معرفي هدفون بي‌سيم سوني') > 0.99)
  assert(q.similarity('معرفی هدفون بی‌سیم', 'راهنمای خرید لپ‌تاپ') < 0.2)
  assert.deepEqual(new Set(q.linksIn({ excerpt: '', sections: [{ text: 'ببینید /blog/old-post و https://example.com/x.' }] })), new Set(['/blog/old-post', 'https://example.com/x']))
  const p = source()('src/modules/ai/domain/production.ts'), base = { categoryIds: [], length: 'medium', tone: '', keywords: '', instruction: '', cover: false, inline: 0, imageStyle: '', ratio: 'landscape', productKind: 'PHYSICAL', currency: 'IRT' }
  assert.equal(p.parseProduction({ kind: 'post', config: { ...base, qualityProfile: 'film' }, seeds: [{ topic: 'نقد فیلم', facts: '', price: '', stock: 0 }] }).config.qualityProfile, 'film')
  assert.throws(() => p.parseProduction({ kind: 'page', config: { ...base, qualityProfile: 'music' }, seeds: [{ topic: 'صفحه', facts: '', price: '', stock: 0 }] }))
})

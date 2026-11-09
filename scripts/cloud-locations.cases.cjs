const { test } = require('node:test'), assert = require('node:assert/strict'), source = require('./connected-source-loader.cjs')
test('cloud: a location belongs to Iran or abroad, from the list or by keywords', () => {
  const l = source()('src/modules/hosting/domain/locations.ts')
  assert.equal(l.regionOf('ایران، تهران'), 'IR'); assert.equal(l.regionOf('ir-mhd'), 'IR'); assert.equal(l.regionOf('آلمان، فالکن‌اشتاین'), 'INTL')
  assert.equal(l.regionOf('Tehran - Asiatech'), 'IR'); assert.equal(l.regionOf('دیتاسنتر شیراز'), 'IR'); assert.equal(l.regionOf('Helsinki'), 'INTL')
  assert.equal(l.regionOf('   '), null)
  assert(l.CLOUD_LOCATIONS.every(entry => ['IR', 'INTL'].includes(entry.region)))
  assert.equal(new Set(l.CLOUD_LOCATIONS.map(entry => entry.id)).size, l.CLOUD_LOCATIONS.length)
})

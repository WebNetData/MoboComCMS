import { test, expect, hasAdmin } from '../helpers'
import { ADMIN_STATE } from '../paths'

test.use({ storageState: hasAdmin() ? ADMIN_STATE : undefined })

/** The checkout replies are stubbed, so no order is placed; the line this test adds is removed again. */
test('an unresolved checkout retries the same order and the badge keeps the real cart count', async ({ page }) => {
  test.skip(!hasAdmin(), 'set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run signed-in checkout tests')
  const before = (await (await page.request.get('/api/cart')).json()).cart
  test.skip(!!before?.hasPhysical, 'the administrator cart already holds physical goods')
  const known = new Map<number, number>((before?.lines || []).map((line: { id: number; quantity: number }) => [line.id, line.quantity]))

  const cart = async () => (await (await page.request.get('/api/cart')).json()).cart
  /** Puts the cart back to what the administrator had before the test. */
  const restore = async () => {
    for (const line of (await cart())?.lines || []) {
      const quantity = known.get(line.id) || 0
      if (quantity !== line.quantity) await page.evaluate((body) => fetch('/api/cart', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { lineId: line.id, quantity })
    }
  }

  // A cart without physical goods needs no address or delivery time, so prefer such a product.
  await page.goto('/products', { waitUntil: 'networkidle' })
  const links = [...new Set(await page.locator('a[href^="/products/"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') || '')))].slice(0, 12)
  test.skip(!links.length, 'no products on this site')
  let ready = false
  for (const href of links) {
    await page.goto(href, { waitUntil: 'networkidle' })
    const add = page.getByRole('button', { name: /افزودن به سبد|add to cart/i }).first()
    if (!(await add.count()) || !(await add.isEnabled())) continue
    const added = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/cart' && response.request().method() === 'POST', { timeout: 30_000 })
    await add.click()
    if ((await added).status() >= 400) continue
    if (!(await cart()).hasPhysical) { ready = true; break }
    await restore()
  }

  try {
    test.skip(!ready, 'no product that can be paid without an address or a delivery time')
    expect((await cart()).count).toBeGreaterThan(0)

    const keys: string[] = []
    await page.route('**/api/cart/checkout', async (route) => {
      keys.push(route.request().headers()['idempotency-key'] || '')
      if (keys.length === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) })
      else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ orderId: 1, replayed: true }) })
    })

    await page.goto('/checkout/cart', { waitUntil: 'networkidle' })
    const pay = page.locator('button.sh-pay')
    await expect(pay).toBeEnabled()
    const stored = () => page.evaluate(() => Object.values({ ...sessionStorage }))

    await pay.click()
    await expect(page.locator('.sh-error-slot')).not.toBeEmpty()
    expect(await stored(), 'a server failure keeps the retry key').toContain(keys[0])

    // The checkout page has no cart badge of its own; the count it announces is what every badge shows.
    await page.evaluate(() => { const seen: number[] = []; Object.assign(window, { __cartCounts: seen }); window.addEventListener('mc:cart', (event) => seen.push((event as CustomEvent<{ count: number }>).detail.count)) })
    const refreshed = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/cart' && response.request().method() === 'GET')
    await pay.click()
    await refreshed
    expect(keys).toHaveLength(2)
    expect(keys[1], 'the retry is the same order').toBe(keys[0])
    await expect.poll(stored, { message: 'a confirmed order releases the key' }).not.toContain(keys[0])
    const count = (await cart()).count
    await expect.poll(() => page.evaluate(() => (window as unknown as { __cartCounts: number[] }).__cartCounts), { message: 'the badge is told the current cart, not zero' }).toEqual([count])
  } finally {
    await page.unroute('**/api/cart/checkout')
    await restore()
  }
})

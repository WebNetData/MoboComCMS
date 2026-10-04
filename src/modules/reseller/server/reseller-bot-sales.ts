import { say, localized } from '@/modules/reseller/server/bot-messages'
import { deliverResellerSale } from '@/modules/reseller/server/sale-delivery'
export { deliverResellerSale, retryResellerDeliveries } from '@/modules/reseller/server/sale-delivery'
import { db } from '@/platform/database/prisma'
import { bot } from '@/modules/notifications/server/telegram'
import { resellerBotConfig } from '@/modules/reseller/server/reseller-bot'
import { resellerOwnerKey } from '@/modules/offers/server/offers'
import { createResellerAccount, resellerWholesaleMinor } from '@/modules/reseller/server/reseller'
import { safeHappLink } from '@/modules/subscriptions/server/happ-protocol'
import { legacyNumber } from '@/shared/money'
import { logEvent } from '@/platform/observability/logger'

type BotRow = NonNullable<Awaited<ReturnType<typeof db.resellerBot.findUnique>>>
type TelegramUpdate = {
  update_id?: number
  message?: { chat?: { id?: number; type?: string }; from?: { id?: number; language_code?: string }; text?: string; photo?: { file_id: string }[]; document?: { file_id: string } }
  callback_query?: { id?: string; from?: { id?: number; language_code?: string }; data?: string; message?: { chat?: { id?: number; type?: string } } }
}
function offerLabel(offer: { nameFa: string; nameEn: string; priceMinor: bigint; currency: string; trafficGB: number; days: number }, fa: boolean) {
  return `${fa ? offer.nameFa : offer.nameEn} · ${offer.trafficGB || '∞'} GB · ${offer.days}d · ${legacyNumber(offer.priceMinor, offer.currency)} ${offer.currency}`
}

async function showOffers(row: BotRow, chatId: string, fa: boolean) {
  const offers = await db.serviceOffer.findMany({ where: { ownerKey: resellerOwnerKey(row.resellerId), active: true, plan: { active: true, panel: { active: true } } }, orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }], take: 30 })
  if (!offers.length) return say(row, chatId, localized(fa, 'No plans are available yet.', 'هنوز پلنی برای فروش فعال نیست.'))
  return say(row, chatId, `${localized(fa, `Welcome to ${row.brandName}. Select a plan:`, `به ${row.brandName} خوش آمدید. یک پلن انتخاب کنید:`)}${row.publicUrl ? `\n${row.publicUrl}` : ''}`, { inline_keyboard: offers.map(o => [{ text: offerLabel(o, fa).slice(0, 64), callback_data: `offer:${o.id}` }]) })
}

async function showOrders(row: BotRow, chatId: string, userId: string, fa: boolean) {
  const sales = await db.resellerSale.findMany({ where: { botId: row.id, telegramUserId: userId }, orderBy: { id: 'desc' }, take: 5, include: { offer: true } })
  if (!sales.length) return say(row, chatId, localized(fa, 'You have no orders yet. Use /plans.', 'هنوز سفارشی ندارید. از /plans استفاده کنید.'))
  for (const sale of sales) {
    const sub = sale.subscriptionId ? await db.subscription.findUnique({ where: { id: sale.subscriptionId } }) : null
    const link = sub?.status === 'ACTIVE' ? await safeHappLink(sub.subToken) : ''
    await say(row, chatId, `#${sale.id} · ${fa ? sale.offer.nameFa : sale.offer.nameEn} · ${sale.status}${link ? `\n${link}` : ''}`)
  }
}

async function placeOrder(row: BotRow, chatId: string, userId: string, offerId: number, updateId: string, fa: boolean) {
  const offer = await db.serviceOffer.findFirst({ where: { id: offerId, ownerKey: resellerOwnerKey(row.resellerId), active: true, plan: { active: true, panel: { active: true } } } })
  if (!offer) return say(row, chatId, localized(fa, 'This plan is no longer available.', 'این پلن دیگر فعال نیست.'))
  const openOrders = await db.resellerSale.count({ where: { botId: row.id, telegramUserId: userId, status: { in: ['AWAITING_RECEIPT', 'REVIEW', 'PROCESSING', 'PROVISIONING', 'DELIVERING'] } } })
  if (openOrders >= 3) return say(row, chatId, localized(fa, 'You already have three open orders. Finish or cancel one before creating another. Use /orders or /cancel.', 'سه سفارش باز دارید. ابتدا یکی را تکمیل یا لغو کنید. /orders یا /cancel را بزنید.'))
  const paymentMinor = offer.cardPriceMinor ?? offer.priceMinor
  const paymentCurrency = offer.cardCurrency || offer.currency
  const sale = await db.resellerSale.upsert({ where: { botId_sourceUpdateId: { botId: row.id, sourceUpdateId: updateId } }, create: { resellerId: row.resellerId, offerId: offer.id, botId: row.id, telegramUserId: userId, telegramChatId: chatId, sourceUpdateId: updateId, terms: JSON.stringify({ planId: offer.planId, trafficGB: offer.trafficGB, days: offer.days, deviceLimit: offer.deviceLimit, nameFa: offer.nameFa, nameEn: offer.nameEn, retailMinor: offer.priceMinor.toString(), retailCurrency: offer.currency }), retailMinor: paymentMinor, currency: paymentCurrency, locale: fa ? 'fa' : 'en' }, update: {} })
  return say(row, chatId, `${localized(fa, 'Order', 'سفارش')} #${sale.id}\n${fa ? offer.nameFa : offer.nameEn} · ${offer.trafficGB || '∞'} GB · ${offer.days}d\n${localized(fa, 'Card transfer amount', 'مبلغ واریز به کارت')}: ${legacyNumber(paymentMinor, paymentCurrency)} ${paymentCurrency}\n\n${localized(fa, 'Transfer the exact amount to this card, then send the receipt as a photo or document. Your order will be activated only after manual approval.', 'مبلغ دقیق را به کارت زیر واریز کنید، سپس تصویر یا فایل رسید را بفرستید. سرویس پس از تأیید دستی فعال می‌شود.')}\n${row.cardNumber}\n${row.cardHolder}`)
}

async function receiveReceipt(row: BotRow, chatId: string, userId: string, receiptFileId: string, fa: boolean) {
  const sale = await db.resellerSale.findFirst({ where: { botId: row.id, telegramUserId: userId, status: 'AWAITING_RECEIPT' }, orderBy: { id: 'desc' } })
  if (!sale) return say(row, chatId, localized(fa, 'Choose a plan with /plans before sending a receipt.', 'پیش از ارسال رسید از /plans یک پلن انتخاب کنید.'))
  const changed = await db.resellerSale.updateMany({ where: { id: sale.id, status: 'AWAITING_RECEIPT' }, data: { status: 'REVIEW', receiptFileId } })
  if (!changed.count) return
  const text = `#${sale.id} · ${sale.telegramUserId}\n${legacyNumber(sale.retailMinor, sale.currency)} ${sale.currency}\nApprove only after checking the transfer in your bank account.`
  const cfg = resellerBotConfig(row)
  const action = { inline_keyboard: [[{ text: '✅ Approve', callback_data: `approve:${sale.id}` }, { text: '❌ Reject', callback_data: `reject:${sale.id}` }]] }
  const send = receiptFileId.startsWith('document:') ? await bot('sendDocument', { chat_id: row.ownerTelegramId, document: receiptFileId.slice(9), caption: text, reply_markup: action }, cfg) : await bot('sendPhoto', { chat_id: row.ownerTelegramId, photo: receiptFileId, caption: text, reply_markup: action }, cfg)
  if (!send.ok) {
    await db.resellerSale.update({ where: { id: sale.id }, data: { lastError: send.description || 'Could not send receipt to owner' } })
    await say(row, chatId, localized(fa, 'Receipt saved. The seller has not opened the bot yet; please contact them with your order number.', 'رسید ثبت شد. نماینده هنوز ربات را باز نکرده است؛ لطفاً با شماره سفارش پیگیری کنید.'))
    return
  }
  await say(row, chatId, localized(fa, `Receipt received for order #${sale.id}. Awaiting seller approval.`, `رسید سفارش #${sale.id} دریافت شد و منتظر تأیید نماینده است.`))
}

async function cancelLatestOrder(row: BotRow, chatId: string, userId: string, fa: boolean) {
  const sale = await db.resellerSale.findFirst({ where: { botId: row.id, telegramUserId: userId, status: 'AWAITING_RECEIPT' }, orderBy: { id: 'desc' } })
  if (!sale) return say(row, chatId, localized(fa, 'No unpaid order can be cancelled.', 'سفارش پرداخت‌نشده‌ای برای لغو ندارید.'))
  await db.resellerSale.updateMany({ where: { id: sale.id, status: 'AWAITING_RECEIPT' }, data: { status: 'CANCELLED' } })
  return say(row, chatId, localized(fa, `Order #${sale.id} cancelled.`, `سفارش #${sale.id} لغو شد.`))
}

export async function reviewResellerSale(row: BotRow, saleId: number, approve: boolean, reviewer: { userId?: number; telegramId?: string } = {}) {
  const sale = await db.resellerSale.findFirst({ where: { id: saleId, botId: row.id, resellerId: row.resellerId } })
  if (!sale || sale.status !== 'REVIEW' || !sale.receiptFileId) return 'Order is no longer awaiting receipt review.'
  if (!approve) {
    const changed = await db.resellerSale.updateMany({ where: { id: sale.id, status: 'REVIEW' }, data: { status: 'REJECTED', reviewDecision: 'REJECTED', reviewedAt: new Date(), reviewerUserId: reviewer.userId || null, reviewerTelegramId: reviewer.telegramId || '' } })
    if (changed.count) await say(row, sale.telegramChatId, localized(sale.locale === 'fa', `Order #${sale.id} was not approved. Contact the seller if this is a mistake.`, `سفارش #${sale.id} تأیید نشد. اگر خطایی رخ داده با فروشنده تماس بگیرید.`))
    if (changed.count) logEvent('info', 'reseller.sale.rejected', { resellerId: row.resellerId, saleId: sale.id, reviewerUserId: reviewer.userId, reviewerTelegramId: reviewer.telegramId })
    return changed.count ? `Order #${sale.id} rejected.` : 'Already processed.'
  }
  const claim = await db.resellerSale.updateMany({ where: { id: sale.id, status: 'REVIEW' }, data: { status: 'PROCESSING', lastError: '', reviewDecision: 'APPROVED', reviewedAt: new Date(), reviewerUserId: reviewer.userId || null, reviewerTelegramId: reviewer.telegramId || '' } })
  if (!claim.count) return 'Already processing.'
  logEvent('info', 'reseller.sale.approved', { resellerId: row.resellerId, saleId: sale.id, reviewerUserId: reviewer.userId, reviewerTelegramId: reviewer.telegramId })
  const reseller = await db.reseller.findUnique({ where: { id: row.resellerId }, include: { prices: true } })
  if (!reseller?.active) {
    await db.resellerSale.update({ where: { id: sale.id }, data: { status: 'REVIEW', lastError: 'Reseller contract is inactive' } })
    return 'Reseller contract is inactive.'
  }
  let terms: { planId: number; trafficGB: number; days: number; deviceLimit: number; retailMinor: string; retailCurrency: string }
  try { terms = JSON.parse(sale.terms) } catch { return 'Order terms are invalid.' }
  if (!terms || !Number.isSafeInteger(terms.planId) || !Number.isSafeInteger(terms.trafficGB) || !Number.isSafeInteger(terms.days) || !Number.isSafeInteger(terms.deviceLimit) || !/^\d+$/.test(String(terms.retailMinor || ''))) {
    await db.resellerSale.update({ where: { id: sale.id }, data: { status: 'NEEDS_REVIEW', lastError: 'Invalid saved sale terms' } })
    return 'Saved sale terms are invalid. Contact platform support.'
  }
  const plan = await db.plan.findUnique({ where: { id: terms.planId } })
  if (!plan || plan.currency !== terms.retailCurrency || resellerWholesaleMinor(reseller, plan, terms.trafficGB) > BigInt(terms.retailMinor || 0)) {
    await db.resellerSale.update({ where: { id: sale.id }, data: { status: 'REVIEW', lastError: 'Offer no longer covers wholesale cost' } })
    return 'Offer price is below the current wholesale cost. Ask the platform admin to review pricing.'
  }
  let result: Awaited<ReturnType<typeof createResellerAccount>>
  try { result = await createResellerAccount(reseller, { email: `reseller${row.resellerId}.telegram${sale.telegramUserId}@bot-customer.invalid`, planId: terms.planId, trafficGB: terms.trafficGB, days: terms.days, deviceLimit: terms.deviceLimit, note: `Telegram sale #${sale.id}`, idempotencyKey: `bot-sale-${sale.id}` }) }
  catch (error) {
    await db.resellerSale.update({ where: { id: sale.id }, data: { status: 'NEEDS_REVIEW', lastError: error instanceof Error ? error.message.slice(0, 400) : 'Provisioning failed' } })
    return 'Could not create service. Check the reseller panel and try again.'
  }
  if (!result.ok) {
    const manualReview = ['WALLET_FAILED', 'SETTLEMENT_FAILED', 'PREVIOUS_ATTEMPT_FAILED'].includes(result.code || '')
    await db.resellerSale.update({ where: { id: sale.id }, data: { status: manualReview ? 'NEEDS_REVIEW' : 'REVIEW', lastError: result.message || result.code || 'Provisioning failed' } })
    return result.code === 'INSUFFICIENT_FUNDS' ? 'Wallet balance is insufficient. Top up and approve again.' : `Could not create service: ${result.code || 'error'}`
  }
  await db.resellerSale.update({ where: { id: sale.id }, data: { orderId: result.orderId, subscriptionId: result.subscriptionId, status: 'PROVISIONING' } })
  if (result.orderId) await deliverResellerSale(result.orderId)
  return result.fulfillmentPending ? `Order #${sale.id} paid from wallet; service is provisioning.` : `Order #${sale.id} approved and provisioned.`
}

export async function cleanupResellerBotUpdates() {
  const result = await db.resellerBotUpdate.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60_000) } } })
  return result.count
}

export async function handleResellerUpdate(row: BotRow, update: TelegramUpdate) {
  const callback = update.callback_query
  const message = update.message
  const userId = String(callback?.from?.id || message?.from?.id || '')
  const chatId = String(callback?.message?.chat?.id || message?.chat?.id || '')
  if (!userId || !chatId || (callback?.message?.chat?.type || message?.chat?.type) !== 'private') return
  const fa = (callback?.from?.language_code || message?.from?.language_code || '').toLowerCase().startsWith('fa')
  const reseller = await db.reseller.findUnique({ where: { id: row.resellerId }, select: { active: true } })
  if (!reseller?.active && message?.text?.trim().split(/\s+/)[0] !== '/orders') return say(row, chatId, localized(fa, 'Sales are temporarily unavailable.', 'فروش موقتاً در دسترس نیست.'))
  if (callback) {
    const data = callback.data || ''
    if (data.startsWith('offer:')) await placeOrder(row, chatId, userId, Number(data.slice(6)), String(update.update_id), fa)
    if (data.startsWith('approve:') || data.startsWith('reject:')) {
      if (userId !== row.ownerTelegramId) return
      const response = await reviewResellerSale(row, Number(data.split(':')[1]), data.startsWith('approve:'), { telegramId: userId })
      await say(row, chatId, response)
    }
    if (callback.id) await bot('answerCallbackQuery', { callback_query_id: callback.id }, resellerBotConfig(row))
    return
  }
  const text = (message?.text || '').trim().split(/\s+/)[0].split('@')[0]
  if (text === '/start' || text === '/plans') return showOffers(row, chatId, fa)
  if (text === '/orders') return showOrders(row, chatId, userId, fa)
  if (text === '/cancel') return cancelLatestOrder(row, chatId, userId, fa)
  const fileId = message?.photo?.at(-1)?.file_id || (message?.document?.file_id ? `document:${message.document.file_id}` : '')
  if (fileId) return receiveReceipt(row, chatId, userId, fileId, fa)
  return say(row, chatId, localized(fa, 'Use /plans to choose a plan or /orders to see your orders.', 'برای خرید /plans و برای پیگیری /orders را بزنید.'))
}

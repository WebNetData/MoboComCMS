import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import sharp from 'sharp'
import { visualPieces } from '@/shared/text/visual-order'
import type { OfficialInvoice } from '@/modules/billing/server/official-invoice'

// The invoice as a real PDF document: text that can be selected and searched, the site's Persian
// font embedded, drawn on A4 from the same data as the official invoice page. Nothing is rendered
// from the screen.

const PAGE = { width: 595.28, height: 841.89, margin: 36 }
const INK = '#0f172a', MUTED = '#64748b', LINE = '#e2e8f0', SOFT = '#f8fafc', PRIMARY = '#4f46e5', PRIMARY_DEEP = '#312e81', ACCENT = '#7c3aed'
const STATUS: Record<string, { label: string; color: string }> = {
  PAID: { label: 'پرداخت‌شده', color: '#16a34a' }, UNPAID: { label: 'در انتظار پرداخت', color: '#d97706' },
  REFUNDED: { label: 'برگشت‌داده‌شده', color: '#64748b' }, VOID: { label: 'باطل‌شده', color: '#64748b' }, DRAFT: { label: 'پیش‌نویس', color: '#64748b' },
}
const font = (name: 'Regular' | 'Bold') => join(process.cwd(), 'public', 'fonts', `Vazirmatn-${name}.ttf`)
const fa = (value: number | bigint) => value.toLocaleString('fa-IR')
const plain = (value: string) => value.replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)])
const money = (value: string) => { try { return fa(BigInt(value)) } catch { return value } }
const date = (value: Date | null) => value ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' }).format(value) : '—'

type Doc = InstanceType<typeof PDFDocument>
type Style = { size?: number; bold?: boolean; color?: string }
type Align = 'right' | 'left' | 'center'

/** A picture kept by the site (logo, stamp) as PNG bytes; anything else is left out. */
async function sitePicture(address: string): Promise<Buffer | null> {
  const match = /^\/api\/media\/covers\/([\w.-]{1,120})$/.exec(address || '')
  if (!match || match[1].includes('..')) return null
  try { return await sharp(await readFile(join(process.cwd(), 'storage', 'covers', match[1]))).resize({ width: 360, height: 360, fit: 'inside', withoutEnlargement: true }).png().toBuffer() } catch { return null }
}

export interface InvoicePdfInput {
  doc: OfficialInvoice
  /** Where the invoice can be opened; drawn as a QR code. */
  link: string
  siteUrl: string
  supportEmail: string
}

export async function invoicePdf({ doc: invoice, link, siteUrl, supportEmail }: InvoicePdfInput): Promise<Buffer> {
  const seller = invoice.seller
  const [logo, stamp] = await Promise.all([sitePicture(seller.logo), sitePicture(seller.stamp)])
  const pdf = new PDFDocument({
    size: 'A4', margin: PAGE.margin, font: font('Regular'), bufferPages: true, autoFirstPage: true,
    info: { Title: `صورتحساب ${invoice.number}`, Author: seller.sellerName || 'MoboCom', Subject: 'صورتحساب فروش کالا و خدمات', Creator: seller.sellerName || 'MoboCom' },
  })
  pdf.registerFont('regular', font('Regular')); pdf.registerFont('bold', font('Bold'))
  const chunks: Buffer[] = []
  pdf.on('data', (chunk: Buffer) => chunks.push(chunk))
  const finished = new Promise<Buffer>((resolve, reject) => { pdf.on('end', () => resolve(Buffer.concat(chunks))); pdf.on('error', reject) })

  const right = PAGE.width - PAGE.margin, left = PAGE.margin, inner = right - left
  const use = (style: Style) => pdf.font(style.bold ? 'bold' : 'regular').fontSize(style.size ?? 9.5).fillColor(style.color ?? INK)
  const widthOf = (text: string, style: Style) => { use(style); return visualPieces(text, { turnDigits: true }).reduce((sum, piece) => sum + pdf.widthOfString(piece), 0) }

  /** One line of text inside [x, x + width], cut with an ellipsis when it does not fit. */
  function line(text: string, x: number, y: number, width: number, style: Style = {}, align: Align = 'right') {
    let shown = String(text ?? '')
    if (widthOf(shown, style) > width) {
      while (shown.length > 1 && widthOf(`${shown}…`, style) > width) shown = shown.slice(0, -1)
      shown = `${shown.trimEnd()}…`
    }
    use(style)
    const pieces = visualPieces(shown, { turnDigits: true })
    const total = pieces.reduce((sum, piece) => sum + pdf.widthOfString(piece), 0)
    let cursor = align === 'right' ? x + width - total : align === 'center' ? x + (width - total) / 2 : x
    for (const piece of pieces) { pdf.text(piece, cursor, y, { lineBreak: false }); cursor += pdf.widthOfString(piece) }
  }

  /** The lines a paragraph takes in the given width (words are never split). */
  function wrap(text: string, width: number, style: Style, max = 6): string[] {
    const words = String(text ?? '').split(/\s+/).filter(Boolean), lines: string[] = []
    let current = ''
    for (const word of words) {
      const next = current ? `${current} ${word}` : word
      if (current && widthOf(next, style) > width) { lines.push(current); current = word } else current = next
    }
    if (current) lines.push(current)
    return lines.length > max ? [...lines.slice(0, max - 1), `${lines[max - 1]}…`] : lines
  }
  function paragraph(text: string, x: number, y: number, width: number, style: Style = {}, gap = 4, max = 6): number {
    const size = style.size ?? 9.5
    for (const row of wrap(text, width, style, max)) { line(row, x, y, width, style); y += size + gap }
    return y
  }
  const card = (x: number, y: number, width: number, height: number, fill = '#ffffff', stroke = LINE, radius = 10) => { pdf.roundedRect(x, y, width, height, radius).fillAndStroke(fill, stroke) }

  // ------------------------------------------------------------------ head
  function head() {
    const height = 118
    const band = pdf.linearGradient(0, 0, PAGE.width, height)
    band.stop(0, PRIMARY_DEEP).stop(0.55, PRIMARY).stop(1, ACCENT)
    pdf.rect(0, 0, PAGE.width, height).fill(band)
    pdf.save(); pdf.fillOpacity(0.1).circle(70, 8, 92).fill('#ffffff'); pdf.fillOpacity(0.07).circle(PAGE.width - 40, height + 18, 76).fill('#ffffff'); pdf.restore()

    const mark = 46, markX = right - mark, markY = 30
    pdf.roundedRect(markX, markY, mark, mark, 12).fill('#ffffff')
    if (logo) { try { pdf.image(logo, markX + 5, markY + 5, { fit: [mark - 10, mark - 10], align: 'center', valign: 'center' }) } catch { /* an unreadable picture leaves the plain mark */ } }
    else line((seller.sellerName || 'م').trim().slice(0, 1), markX, markY + 11, mark, { size: 20, bold: true, color: PRIMARY }, 'center')
    line(seller.sellerName || 'فروشگاه', left + 200, 31, inner - 200 - mark - 12, { size: 16, bold: true, color: '#ffffff' })
    line('صورتحساب فروش کالا و خدمات', left + 200, 56, inner - 200 - mark - 12, { size: 9.5, color: '#e0e7ff' })

    const status = STATUS[invoice.status] || { label: invoice.status, color: MUTED }
    const pill = widthOf(status.label, { size: 9, bold: true }) + 22
    pdf.roundedRect(left, 28, pill, 20, 10).fill('#ffffff')
    pdf.circle(left + 11, 38, 3).fill(status.color)
    line(status.label, left + 16, 32.5, pill - 22, { size: 9, bold: true, color: status.color }, 'left')
    line('شمارهٔ فاکتور', left, 58, 190, { size: 8, color: '#c7d2fe' }, 'left')
    line(invoice.number, left, 70, 190, { size: 13, bold: true, color: '#ffffff' }, 'left')
    line(`تاریخ صدور: ${date(invoice.issuedAt)}${invoice.orderId ? `   ·   سفارش ${fa(invoice.orderId).replace(/٬/g, '')}` : ''}`, left, 92, 260, { size: 8.5, color: '#e0e7ff' }, 'left')
    return height + 18
  }

  // ------------------------------------------------------------------ parties
  function party(title: string, rows: [string, string][], x: number, y: number, width: number, height: number) {
    card(x, y, width, height)
    pdf.roundedRect(x + width - 4, y + 12, 4, 16, 2).fill(PRIMARY)
    line(title, x + 12, y + 12, width - 26, { size: 10.5, bold: true })
    let rowY = y + 36
    for (const [label, value] of rows) {
      if (!value) continue
      const labelWidth = widthOf(`${label}:`, { size: 8.5, color: MUTED }) + 6
      line(`${label}:`, x + width - 12 - labelWidth, rowY, labelWidth, { size: 8.5, color: MUTED })
      const lines = wrap(value, width - 28 - labelWidth, { size: 9 }, 2)
      for (const text of lines) { line(text, x + 12, rowY, width - 28 - labelWidth, { size: 9 }); rowY += 13.5 }
      rowY += 1.5
    }
  }
  const partyRows = (who: { name: string; nationalId: string; phone: string; province: string; city: string; address: string; postalCode: string }, extra: [string, string][]): [string, string][] => [
    ['نام', who.name], ['شناسه / کد ملی', who.nationalId ? plain(who.nationalId) : ''], ...extra, ['تلفن', who.phone ? plain(who.phone) : ''],
    ['نشانی', [who.province, who.city, who.address].filter(Boolean).join('، ')], ['کد پستی', who.postalCode ? plain(who.postalCode) : ''],
  ]
  const rowsHeight = (rows: [string, string][], width: number) => rows.reduce((sum, [label, value]) => {
    if (!value) return sum
    const labelWidth = widthOf(`${label}:`, { size: 8.5 }) + 6
    return sum + wrap(value, width - 28 - labelWidth, { size: 9 }, 2).length * 13.5 + 1.5
  }, 0)

  // ------------------------------------------------------------------ table
  // Columns from the right edge: #, description, quantity, unit price, discount, tax, total.
  const COLUMNS = [
    { key: 'index', label: 'ردیف', width: 30, align: 'center' as Align },
    { key: 'description', label: 'شرح کالا یا خدمات', width: 0, align: 'right' as Align },
    { key: 'quantity', label: 'تعداد', width: 38, align: 'center' as Align },
    { key: 'unit', label: 'مبلغ واحد', width: 74, align: 'center' as Align },
    { key: 'discount', label: 'تخفیف', width: 62, align: 'center' as Align },
    { key: 'vat', label: 'مالیات', width: 62, align: 'center' as Align },
    { key: 'total', label: 'جمع', width: 80, align: 'center' as Align },
  ]
  COLUMNS[1].width = inner - COLUMNS.reduce((sum, column) => sum + column.width, 0)
  const columnX = (index: number) => right - COLUMNS.slice(0, index + 1).reduce((sum, column) => sum + column.width, 0)

  function tableHead(y: number) {
    pdf.roundedRect(left, y, inner, 26, 8).fill(PRIMARY_DEEP)
    COLUMNS.forEach((column, index) => line(column.label, columnX(index) + 6, y + 8, column.width - 12, { size: 8.5, bold: true, color: '#ffffff' }, column.align))
    return y + 30
  }
  const bottom = PAGE.height - 64

  // ------------------------------------------------------------------ compose
  let y = head()
  const half = (inner - 12) / 2
  const sellerRows = partyRows({ name: seller.sellerName, nationalId: seller.nationalId, phone: seller.phone, province: seller.province, city: seller.city, address: seller.address, postalCode: seller.postalCode }, [['کد اقتصادی', seller.economicCode ? plain(seller.economicCode) : ''], ['شمارهٔ ثبت', seller.registrationNo ? plain(seller.registrationNo) : '']])
  const buyerRows = partyRows(invoice.buyer, [['ایمیل', invoice.buyer.email]])
  const partyHeight = Math.max(rowsHeight(sellerRows, half), rowsHeight(buyerRows, half), 30) + 46
  party('فروشنده', sellerRows, left + half + 12, y, half, partyHeight)
  party('خریدار', buyerRows, left, y, half, partyHeight)
  y += partyHeight + 16

  line(`اقلام صورتحساب`, left + 160, y, inner - 160, { size: 10.5, bold: true })
  line(`مبالغ به ${invoice.unitLabel}`, left, y + 1.5, 150, { size: 8.5, color: MUTED }, 'left')
  y = tableHead(y + 20)
  invoice.rows.forEach((row, index) => {
    const description = wrap(row.description, COLUMNS[1].width - 14, { size: 9 }, 4)
    const height = Math.max(24, description.length * 13.5 + (row.code ? 12 : 0) + 11)
    if (y + height > bottom) { pdf.addPage(); y = tableHead(PAGE.margin) }
    if (index % 2 === 0) pdf.roundedRect(left, y, inner, height, 6).fill(SOFT)
    const middle = y + height / 2 - 5.5
    const cell = (column: number, text: string, style: Style = {}) => line(text, columnX(column) + 6, middle, COLUMNS[column].width - 12, { size: 9, ...style }, COLUMNS[column].align)
    cell(0, fa(row.index), { color: MUTED })
    let textY = y + (height - (description.length * 13.5 + (row.code ? 12 : 0))) / 2 + 1
    for (const text of description) { line(text, columnX(1) + 7, textY, COLUMNS[1].width - 14, { size: 9 }); textY += 13.5 }
    if (row.code) line(`کد: ${row.code}`, columnX(1) + 7, textY, COLUMNS[1].width - 14, { size: 7.5, color: MUTED })
    cell(2, fa(row.quantity)); cell(3, money(row.unit)); cell(4, row.discount === '0' ? '—' : money(row.discount), { color: MUTED }); cell(5, row.vat === '0' ? '—' : money(row.vat), { color: MUTED }); cell(6, money(row.total), { bold: true })
    y += height + 2
  })

  // Totals on the left; words, payment and the QR code on the right.
  const totals: [string, string, Style?][] = [['جمع کل', money(invoice.totals.gross)]]
  if (invoice.totals.discount !== '0') totals.push(['تخفیف', `${money(invoice.totals.discount)}−`, { color: '#dc2626' }])
  if (invoice.totals.vat !== '0') totals.push([`مالیات بر ارزش افزوده${invoice.vatPercent ? ` (${fa(invoice.vatPercent)}٪)` : ''}`, money(invoice.totals.vat)])
  if (invoice.walletApplied) totals.push(['پرداخت از کیف پول', `${money(invoice.walletApplied)}−`, { color: '#16a34a' }])
  const totalsWidth = 238, totalsHeight = totals.length * 20 + 58, sideWidth = inner - totalsWidth - 12
  const words = wrap(`${invoice.totalWords}`, sideWidth - 96, { size: 9, bold: true }, 3)
  const blockHeight = Math.max(totalsHeight, 104)
  y += 12
  if (y + blockHeight > bottom) { pdf.addPage(); y = PAGE.margin }
  card(left, y, totalsWidth, totalsHeight)
  let totalY = y + 12
  for (const [label, value, style] of totals) {
    line(label, left + 100, totalY, totalsWidth - 112, { size: 9, color: MUTED })
    line(value, left + 12, totalY, 96, { size: 9.5, ...style }, 'left')
    totalY += 20
  }
  const due = pdf.linearGradient(left + 8, totalY, left + totalsWidth - 8, totalY)
  due.stop(0, PRIMARY).stop(1, ACCENT)
  pdf.roundedRect(left + 8, totalY, totalsWidth - 16, 36, 8).fill(due)
  line('مبلغ قابل پرداخت', left + 120, totalY + 12, totalsWidth - 140, { size: 9.5, bold: true, color: '#ffffff' })
  line(`${money(invoice.totals.total)} ${invoice.unitLabel}`, left + 20, totalY + 10.5, 130, { size: 12, bold: true, color: '#ffffff' }, 'left')

  const sideX = left + totalsWidth + 12
  card(sideX, y, sideWidth, blockHeight, SOFT)
  const qrSize = 74, qrX = sideX + 12, qrY = y + (blockHeight - qrSize) / 2 - 5
  try {
    const { modules } = QRCode.create(link, { errorCorrectionLevel: 'M' })
    const cell = qrSize / modules.size
    pdf.roundedRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 6).fill('#ffffff')
    for (let rowIndex = 0; rowIndex < modules.size; rowIndex += 1) for (let column = 0; column < modules.size; column += 1) {
      if (modules.data[rowIndex * modules.size + column]) pdf.rect(qrX + column * cell, qrY + rowIndex * cell, cell + 0.05, cell + 0.05).fill(INK)
    }
    line('مشاهدهٔ آنلاین فاکتور', qrX - 8, qrY + qrSize + 8, qrSize + 16, { size: 7, color: MUTED }, 'center')
  } catch { /* a link too long for a code is simply not drawn */ }
  const textX = sideX + 12 + qrSize + 14, textWidth = sideWidth - qrSize - 38
  let sideY = y + 12
  line('مبلغ به حروف', textX, sideY, textWidth, { size: 8, color: MUTED }); sideY += 14
  for (const text of words) { line(text, textX, sideY, textWidth, { size: 9, bold: true }); sideY += 14 }
  sideY += 5
  const state = invoice.status === 'PAID'
    ? `پرداخت‌شده${invoice.paidAt ? ` در ${date(invoice.paidAt)}` : ''}${invoice.payment ? ` — ${invoice.payment}` : ''}`
    : `${(STATUS[invoice.status] || { label: invoice.status }).label}${invoice.payment ? ` — ${invoice.payment}` : ''}`
  line('وضعیت پرداخت', textX, sideY, textWidth, { size: 8, color: MUTED }); sideY += 14
  sideY = paragraph(state, textX, sideY, textWidth, { size: 9 }, 4.5, 2)
  y += blockHeight + 14

  // Notes and signatures.
  const notes = [invoice.pricesIncludeVat ? 'قیمت‌ها با احتساب مالیات بر ارزش افزوده است.' : 'مالیات بر ارزش افزوده به قیمت‌ها اضافه شده است.', seller.footerNote].filter(Boolean)
  if (y + 70 > bottom) { pdf.addPage(); y = PAGE.margin }
  const signWidth = 150, signY = y
  for (const note of notes) y = paragraph(note, left + signWidth * 2 + 24, y, inner - signWidth * 2 - 24, { size: 8.5, color: MUTED }, 4.5, 4) + 2
  ;[['مهر و امضای فروشنده', stamp] as const, ['مهر و امضای خریدار', null] as const].forEach(([label, picture], index) => {
    const x = left + index * (signWidth + 12)
    pdf.roundedRect(x, signY, signWidth, 64, 10).dash(3, { space: 3 }).stroke(LINE).undash()
    line(label, x, signY + 8, signWidth, { size: 8, color: MUTED }, 'center')
    if (picture) { try { pdf.image(picture, x + 30, signY + 21, { fit: [signWidth - 60, 39], align: 'center', valign: 'center' }) } catch { /* left empty */ } }
  })

  // Foot of every page.
  const range = pdf.bufferedPageRange()
  for (let index = 0; index < range.count; index += 1) {
    pdf.switchToPage(range.start + index)
    pdf.page.margins.bottom = 0
    pdf.moveTo(left, PAGE.height - 46).lineTo(right, PAGE.height - 46).lineWidth(0.6).stroke(LINE)
    line(`صادرشده به‌صورت الکترونیکی  ·  ${invoice.number}`, left + 290, PAGE.height - 38, inner - 290, { size: 7.5, color: MUTED })
    line([siteUrl.replace(/^https?:\/\//, ''), supportEmail].filter(Boolean).join('   ·   '), left + 74, PAGE.height - 38, 210, { size: 7.5, color: MUTED }, 'left')
    line(`صفحهٔ ${fa(index + 1)} از ${fa(range.count)}`, left, PAGE.height - 38, 66, { size: 7.5, color: MUTED }, 'left')
  }
  pdf.end()
  return finished
}

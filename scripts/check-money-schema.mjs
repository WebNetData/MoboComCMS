import fs from 'node:fs'

const files = ['prisma/schema.prisma', 'prisma/schema.postgresql.prisma']
const legacyFloat = new Set([
  'User.walletBalance',
  'Plan.price',
  'Order.totalAmount',
  'OrderItem.price',
  'ResellerPrice.price',
  'Product.price',
  'Gateway.feePercent',
  'Gateway.minAmount',
  'Invoice.subtotal', 'Invoice.discount', 'Invoice.tax', 'Invoice.total', 'Invoice.walletApplied', 'Invoice.paidAmount',
  'Payment.amount', 'Payment.fee',
  'WalletTx.amount', 'WalletTx.balanceAfter',
  'Expense.amount',
])
const financialModels = new Set(['User','Plan','Order','OrderItem','ResellerPrice','Product','Gateway','Invoice','Payment','WalletTx','Expense','WalletAccount'])
const required = new Map([
  ['Plan', ['priceMinor:BigInt', 'currency:String']],
  ['Order', ['totalMinor:BigInt', 'currency:String', 'idempotencyKey:String?']],
  ['OrderItem', ['priceMinor:BigInt']],
  ['ResellerPrice', ['priceMinor:BigInt']],
  ['Product', ['priceMinor:BigInt', 'currency:String']],
  ['Gateway', ['feeBps:Int', 'minAmountMinor:BigInt', 'fiat:String']],
  ['Invoice', ['subtotalMinor:BigInt','discountMinor:BigInt','taxMinor:BigInt','totalMinor:BigInt','walletAppliedMinor:BigInt','paidAmountMinor:BigInt','currency:String','idempotencyKey:String?']],
  ['Payment', ['amountMinor:BigInt','feeMinor:BigInt','currency:String','eventKey:String?']],
  ['WalletTx', ['amountMinor:BigInt','balanceAfterMinor:BigInt','currency:String','idempotencyKey:String?']],
  ['Expense', ['amountMinor:BigInt','currency:String']],
  ['WalletAccount', ['balanceMinor:BigInt','currency:String']],
])

function parseModels(text) {
  const result = new Map()
  for (const match of text.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const fields = new Map()
    for (const raw of match[2].split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue
      const m = line.match(/^(\w+)\s+([\w]+(?:\?|\[\])?)/)
      if (m) fields.set(m[1], m[2])
    }
    result.set(match[1], fields)
  }
  return result
}

let failed = false
for (const file of files) {
  const models = parseModels(fs.readFileSync(file, 'utf8'))
  for (const [model, fields] of models) {
    if (!financialModels.has(model)) continue
    for (const [field, type] of fields) {
      if (type === 'Float' && !legacyFloat.has(`${model}.${field}`)) {
        console.error(`${file}: new Float is forbidden in financial model: ${model}.${field}`)
        failed = true
      }
    }
  }
  for (const [model, specs] of required) {
    const fields = models.get(model)
    if (!fields) { console.error(`${file}: missing financial model ${model}`); failed = true; continue }
    for (const spec of specs) {
      const [name, type] = spec.split(':')
      if (fields.get(name) !== type) {
        console.error(`${file}: ${model}.${name} must be ${type}; got ${fields.get(name) || 'missing'}`)
        failed = true
      }
    }
  }
}
if (failed) process.exit(1)
console.log('Money schema invariants OK (legacy Float fields are allowlisted only)')

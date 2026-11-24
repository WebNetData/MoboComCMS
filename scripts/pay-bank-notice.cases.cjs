const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./connected-source-loader.cjs')()
const {parsePayBankNotice}=load('src/modules/billing/domain/pay-bank-notice.ts')
// Synthetic template: never store the owner's real bank account, balance or references.
const fixture=(patch={})=>{
 const v={kind:'انتقال_به_كارت_-_شتاب',amount:'۱۲,۳۴۰+',account:'۰۰۰۰۰۰۰۰۰۰۰۰۰',reference:'T۱۲۳۴۵۶',time:'۱۳:۴۱ ۱۴۰۵/۰۸/۱۹',balance:'۹۹۹,۹۹۹,۹۹۹',...patch}
 return `اطلاع‌رسانی بانک ملّی ایران: *بانک ملّی ایران*\n*#${v.kind}*\nمبلغ: *${v.amount}* ریال\nمانده: *${v.balance}* ریال\nشماره حساب: #${v.account}\nتوضیحات: synthetic-fixture\nشعبه: 0000\nشماره پیگیری: ${v.reference}\nمقصد تراکنش: synthetic-counterparty\nزمان: *${v.time}*`
}
const parsed=(patch={})=>{const r=parsePayBankNotice('MELLI',fixture(patch));assert.equal(r.ok,true,JSON.stringify(r));return r.notice}

test('Melli notice extracts only exact signed IRR/account/reference and an explicit Tehran minute interval',()=>{
 const n=parsed();assert.equal(n.amountRial,'12340');assert.equal(n.accountNumber,'0000000000000');assert.equal(n.transferReference,'T123456');assert.equal(n.kind,'CARD_TRANSFER');assert.equal(n.direction,'CREDIT');assert.equal(n.matching,'TRANSFER_CANDIDATE');assert.equal(n.verification,'UNVERIFIED_NOTICE');assert.equal(n.precision,'MINUTE');assert.equal(n.timeZone,'Asia/Tehran')
 assert.equal(n.occurredFrom,'2026-11-10T10:11:00.000Z');assert.equal(n.occurredBefore,'2026-11-10T10:12:00.000Z')
 assert.ok(!JSON.stringify(n).includes('synthetic-counterparty'));assert.ok(!JSON.stringify(n).includes('999999999'));assert.ok(!Object.hasOwn(n,'targetPaymentId'))
})
test('sample transaction kinds separate transfer candidates from interest, charges and withdrawals',()=>{
 for(const kind of ['انتقال_به_كارت_-_شتاب','حواله_ساتنا','حواله_پايا'])assert.equal(parsed({kind}).matching,'TRANSFER_CANDIDATE')
 assert.equal(parsed({kind:'سود_پرداخت_شده'}).matching,'NON_PAYMENT_CREDIT')
 for(const kind of ['خريد_اينترنتي','كارمزد_حواله_پل','كارمزددرخواست_مانده','برداشت_با_POS']){assert.equal(parsed({kind,amount:'۱۲,۳۴۰-'}).matching,'DEBIT');assert.equal(parsed({kind}).matching,'INCONSISTENT_TYPE')}
 assert.equal(parsed({amount:'۱۲,۳۴۰-'}).matching,'DEBIT');assert.equal(parsed({kind:'برگشت_وجه'}).matching,'UNKNOWN_TYPE');assert.equal(parsed({kind:'حواله_ساتنا_برگشت'}).matching,'UNKNOWN_TYPE')
})
test('digits, Arabic letters, grouping and supplied Markdown escaping normalize without losing leading account zeros',()=>{
 const original=fixture(),arabic=original.replace(/[۰-۹]/g,d=>String.fromCharCode(d.charCodeAt(0)-0x6f0+0x660)).replaceAll(',','٬')
 assert.deepEqual(parsePayBankNotice('MELLI',arabic),parsePayBankNotice('MELLI',original))
 assert.deepEqual(parsePayBankNotice('MELLI',original.replaceAll('_','\\_').replaceAll('\n','\r\n')),parsePayBankNotice('MELLI',original))
 assert.equal(parsePayBankNotice('MELLI',original.replace('اطلاع‌رسانی بانک ملّی ایران: ', '')).ok,true)
 assert.equal(parsed({amount:'9007199254740993+'}).amountRial,'9007199254740993');assert.equal(parsed({amount:'9,223,372,036,854,775,807+'}).amountRial,'9223372036854775807')
})
test('ambiguous/missing/duplicated/batched/spoofed message templates fail closed with no raw values in errors',()=>{
 const text=fixture()
 for(const input of [null,{},'','x'.repeat(4097),text+'\n'+text,text+'\nمبلغ: 1+ ریال',text.replace('مبلغ:', 'نام:'),text.replace('شماره پیگیری: T۱۲۳۴۵۶\n',''),text.replace('بانک ملّی ایران','بانک دیگر'),text.replace('۱۲,۳۴۰+', '\u202e۱۲,۳۴۰+'),text.replace('۱۲,۳۴۰+', '۱۲\u0000,۳۴۰+')]){
  const r=parsePayBankNotice('MELLI',input);assert.equal(r.ok,false);assert.deepEqual(Object.keys(r).sort(),['code','ok'])
 }
 for(const id of ['OTHER','MELLI_FAKE','','melli'])assert.deepEqual(parsePayBankNotice(id,text),{ok:false,code:'UNSUPPORTED_BANK'})
})
test('amount parser rejects zero/negative interpretations, malformed grouping, decimals, unit changes and hidden extra signs',()=>{
 for(const amount of ['0+','۰+','۰۱۲۳+','۱۲,۳۴+','1,23,456+','1٬000,00+','1.5+','-123+','123+-','123','123++','+123','9223372036854775808+','100000000000000000000+','1e4+'])assert.equal(parsePayBankNotice('MELLI',fixture({amount})).ok,false,amount)
 for(const text of [fixture().replace(' ریال',' تومان'),fixture().replace(' ریال',''),fixture().replace(' ریال',' ریال ۱۰۰+'),fixture().replace('مبلغ:','مبلغ کل:')])assert.equal(parsePayBankNotice('MELLI',text).ok,false)
})
test('invalid account/reference and impossible or unsupported Jalali local dates are never approximated',()=>{
 for(const account of ['123','۰'.repeat(12),'۰'.repeat(14),'۰۰۰۰۰۰۰۰۰۰۰۰x','۰۰۰ ۰۰۰۰۰۰۰۰۰۰'])assert.equal(parsePayBankNotice('MELLI',fixture({account})).ok,false)
 for(const reference of ['', '12345','T123456 more','../abcdef','T۱۲۳۴۵۶*X','x'.repeat(65)])assert.equal(parsePayBankNotice('MELLI',fixture({reference})).ok,false)
 for(const time of ['24:00 1405/08/19','12:60 1405/08/19','12:00 1405/07/31','12:00 1405/00/01','12:00 1405/13/01','12:00 1405/12/30','12:00 1405/01/00','12:00 1401/08/19','12:00 1500/08/19','1405/08/19','12:00:30 1405/08/19'])assert.equal(parsePayBankNotice('MELLI',fixture({time})).ok,false,time)
 assert.equal(parsed({time:'00:00 1405/08/19'}).occurredFrom,'2026-11-09T20:30:00.000Z')
 assert.equal(parsed({time:'23:59 1405/08/19'}).occurredBefore,'2026-11-10T20:30:00.000Z')
})

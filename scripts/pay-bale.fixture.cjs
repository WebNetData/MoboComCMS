// Constructed data only. Never copy the owner's account, balance or transaction facts here.
const {createHash}=require('node:crypto')
const binding={alias:'bank-only',instanceId:'a'.repeat(64),accountId:'123',bankPeerId:'456',bankAccountId:1,ownerUserId:1}
function melli({account='0000000000000',amount='100000',reference='TEST123456',kind='انتقال_به_کارت_-_شتاب',sign='+'}={}){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]))
 return `بانک ملّی ایران\n#${kind}\nمبلغ: ${amount}${sign} ریال\nمانده: PRIVATE_BALANCE\nشماره حساب: #${account}\nتوضیحات: PRIVATE_COUNTERPARTY\nشعبه: synthetic\nشماره پیگیری: ${reference}\nمقصد تراکنش: synthetic\nزمان: ${p.hour}:${p.minute} ${p.year}/${p.month}/${p.day}`
}
function envelope(number=1,notice={}){
 const time=new Date().toISOString(),text=melli(notice),id=String(number)
 return {event_id:createHash('sha256').update('synthetic-'+id).digest('hex'),event:'message',device_id:binding.accountId,provider:'bale',session_id:binding.alias,instance_id:binding.instanceId,peer:{type:'user',id:binding.bankPeerId},message_id:id,sender_id:binding.bankPeerId,direction:'incoming',timestamp:time,content:{kind:'text',message:text},payload:{partial:false,id,chat_id:binding.bankPeerId,from:binding.bankPeerId,is_from_me:false,timestamp:time,body:text,kind:'text',supported:true}}
}
const config=(bankAccountId=1)=>({MOBOCOM_PAY_BALE_ENABLED:'true',MOBOCOM_PAY_BALE_SESSION:binding.alias,MOBOCOM_PAY_BALE_INSTANCE:binding.instanceId,MOBOCOM_PAY_BALE_ACCOUNT:binding.accountId,MOBOCOM_PAY_BALE_BANK_PEER:binding.bankPeerId,MOBOCOM_PAY_BALE_BANK_ACCOUNT:String(bankAccountId),MOBOCOM_PAY_BALE_OWNER_USER_ID:'1',MOBOCOM_PAY_BALE_WEBHOOK_SECRET:'synthetic-only-bale-webhook-key-1234567890'})
module.exports={binding,melli,envelope,config}

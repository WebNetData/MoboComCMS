const CHANNEL = 'MOBOCOM_CHAT_WEB_V1'
import type { ChatWebProvider } from '../domain/production-execution'
export type ChatWebContext = { conversation: string; operation: string }
type Progress = (stage: string) => void

function exchange(type: 'PING' | 'RUN' | 'IMAGE' | 'RESET' | 'RELEASE', prompt: string, signal: AbortSignal, provider: ChatWebProvider = 'chatgpt', context?: ChatWebContext, onProgress?: Progress) {
  return new Promise<{ text?: string; data?: string; capabilities?: string[] }>((resolve, reject) => {
    const id = crypto.randomUUID(), timeout = setTimeout(() => fail(type === 'PING' ? 'افزونهٔ پل نصب یا به این سایت متصل نیست؛ راهنما را باز کنید.' : 'مهلت پل تمام شد؛ مرحله را برای بازیابی همان پاسخ ادامه دهید. تولید تازه خودکار ارسال نشد.'), type === 'PING' || type === 'RESET' || type === 'RELEASE' ? 5000 : type === 'IMAGE' ? 670000 : 550000)
    const cleanup = () => { clearTimeout(timeout); window.removeEventListener('message', receive); signal.removeEventListener('abort', abort) }
    const cancel = () => window.postMessage({ channel: CHANNEL, direction: 'request', type: 'CANCEL', id }, window.location.origin)
    const fail = (message: string) => { cleanup(); if (type !== 'PING') cancel(); reject(new Error(message)) }
    const abort = () => fail('درخواست لغو شد؛ ارسال احتمالی در ChatGPT ممکن است سهمیه مصرف کرده باشد.')
    const receive = (event: MessageEvent) => {
      const m = event.data
      if (event.source !== window || event.origin !== window.location.origin || !m || m.channel !== CHANNEL || m.direction !== 'response' || m.id !== id) return
      if (typeof m.error === 'string') { fail(m.error.slice(0, 500)); return }
      if (typeof m.stage === 'string' && ['prepared','sent','reading'].includes(m.stage)) { onProgress?.(m.stage); return }
      if ((type === 'RESET' || type === 'RELEASE') && m.done === true) { cleanup(); resolve({}); return }
      if (type === 'PING' && m.ready === true) { cleanup(); resolve({ capabilities: Array.isArray(m.capabilities) ? m.capabilities.filter((x: unknown) => typeof x === 'string') : [] }); return }
      if (type === 'RUN' && typeof m.text === 'string' && m.text.trim() && m.text.length <= 60000) { cleanup(); resolve({ text: m.text }); return }
      if (type === 'IMAGE' && typeof m.data === 'string' && /^data:image\/webp;base64,[a-z0-9+/]+=*$/i.test(m.data) && m.data.length <= 2800000) { cleanup(); resolve({ data: m.data }); return }
      fail('پاسخ پل معتبر نیست؛ درخواست تکرار نشد.')
    }
    if (signal.aborted) { abort(); return }
    window.addEventListener('message', receive); signal.addEventListener('abort', abort, { once: true })
 window.postMessage({ channel: CHANNEL, direction: 'request', type, id, provider, context, ...(['RUN','IMAGE'].includes(type) ? { prompt } : {}) }, window.location.origin)
  })
}

/** Browser-only transport. Never calls an inference API or falls back to one. */
export async function requestChatWeb(prompt: string, signal: AbortSignal, production = false, provider: ChatWebProvider = 'chatgpt', context?: ChatWebContext, onProgress?: Progress) {
  if (!prompt.trim() || prompt.length > 120000) throw new Error('درخواست برای پل بیش از حد طولانی است.')
 const hello = await exchange('PING', '', signal, provider)
 if(provider!=='chatgpt'&&!hello.capabilities?.includes('chat-'+provider))throw new Error('پل نسخهٔ ۰.۴ برای این سرویس لازم است؛ افزونه را ارتقا دهید.')
  if (production && !hello.capabilities?.includes('production-v2')) throw new Error('افزونهٔ پل را به نسخهٔ ۰.۳ یا جدیدتر ارتقا و دوباره به سایت متصل کنید.')
 if(context&&!hello.capabilities?.includes('production-v3'))throw new Error('برای بازیابی و تصویرهای پیوسته، پل را به نسخهٔ ۰.۵ ارتقا و صفحه را تازه کنید.')
 return (await exchange('RUN', prompt, signal, provider, context, onProgress)).text!
}

export async function requestChatWebImage(prompt: string, signal: AbortSignal, context?: ChatWebContext, onProgress?: Progress) {
  if (!prompt.trim() || prompt.length > 120000) throw new Error('پرامپت تصویر بیش از حد طولانی است.')
  const hello = await exchange('PING', '', signal)
  if (!hello.capabilities?.includes('image') || !hello.capabilities.includes('production-v1')) throw new Error('نسخهٔ افزونه تولید تصویر را پشتیبانی نمی‌کند؛ پل را ارتقا دهید.')
  if(context&&!hello.capabilities?.includes('production-v3'))throw new Error('برای تصویرهای پیوسته، پل نسخهٔ ۰.۵ لازم است؛ هنوز تصویری درخواست نشد.')
  return (await exchange('IMAGE', prompt, signal, 'chatgpt', context, onProgress)).data!
}

/** Capability check happens before claiming a persisted generation step. */
export async function checkProductionChat(signal: AbortSignal, provider: ChatWebProvider = 'chatgpt') {
 const hello = await exchange('PING', '', signal, provider)
 if(provider!=='chatgpt'&&!hello.capabilities?.includes('chat-'+provider))throw new Error('پل نسخهٔ ۰.۴ برای سرویس چت انتخاب‌شده لازم است؛ هنوز تولیدی انجام نشد.')
  if (!hello.capabilities?.includes('production-v3')) throw new Error('پل Chat وب نسخهٔ ۰.۵ لازم است؛ افزونه را ارتقا و صفحه را تازه کنید. هنوز درخواستی تولید نشده است.')
}
export async function resetProductionChat(conversation: string) { await exchange('RESET','',AbortSignal.timeout(6000),'chatgpt',{conversation,operation:'text'}) }
export async function releaseProductionChat(conversation: string) { await exchange('RELEASE','',AbortSignal.timeout(6000),'chatgpt',{conversation,operation:'text'}) }

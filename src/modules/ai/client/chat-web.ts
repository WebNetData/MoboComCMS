const CHANNEL = 'MOBOCOM_CHAT_WEB_V1'

function exchange(type: 'PING' | 'RUN', prompt: string, signal: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const id = crypto.randomUUID(), timeout = setTimeout(() => fail(type === 'PING' ? 'افزونهٔ پل نصب یا به این سایت متصل نیست؛ راهنما را باز کنید.' : 'مهلت پل تمام شد؛ درخواست خودکار تکرار نشد.'), type === 'PING' ? 2500 : 170000)
    const cleanup = () => { clearTimeout(timeout); window.removeEventListener('message', receive); signal.removeEventListener('abort', abort) }
    const cancel = () => window.postMessage({ channel: CHANNEL, direction: 'request', type: 'CANCEL', id }, window.location.origin)
    const fail = (message: string) => { cleanup(); if (type === 'RUN') cancel(); reject(new Error(message)) }
    const abort = () => fail('درخواست لغو شد؛ ارسال احتمالی در ChatGPT ممکن است سهمیه مصرف کرده باشد.')
    const receive = (event: MessageEvent) => {
      const m = event.data
      if (event.source !== window || event.origin !== window.location.origin || !m || m.channel !== CHANNEL || m.direction !== 'response' || m.id !== id) return
      if (typeof m.error === 'string') { fail(m.error.slice(0, 500)); return }
      if (type === 'PING' && m.ready === true) { cleanup(); resolve(''); return }
      if (type === 'RUN' && typeof m.text === 'string' && m.text.trim() && m.text.length <= 60000) { cleanup(); resolve(m.text); return }
      fail('پاسخ پل معتبر نیست؛ درخواست تکرار نشد.')
    }
    if (signal.aborted) { abort(); return }
    window.addEventListener('message', receive); signal.addEventListener('abort', abort, { once: true })
    window.postMessage({ channel: CHANNEL, direction: 'request', type, id, ...(type === 'RUN' ? { prompt } : {}) }, window.location.origin)
  })
}

/** Browser-only transport. Never calls an inference API or falls back to one. */
export async function requestChatWeb(prompt: string, signal: AbortSignal) {
  if (!prompt.trim() || prompt.length > 120000) throw new Error('درخواست برای پل بیش از حد طولانی است.')
  await exchange('PING', '', signal)
  return exchange('RUN', prompt, signal)
}

// Local CA supplied by the parent test through NODE_EXTRA_CA_CERTS; never disable TLS verification.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const net = require('node:net')
const path = require('node:path')
const load = require('../connected-source-loader.cjs')({ '@/modules/settings/server': { readJsonSetting: async () => undefined } })
const { viaProxy } = load('src/modules/social/server/egress.ts')
const dir = process.argv[2], sockets = new Set(), seen = []
const track = socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) }
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const fixture = https.createServer({ key: fs.readFileSync(path.join(dir, 'key.pem')), cert: fs.readFileSync(path.join(dir, 'cert.pem')) }, async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk
  seen.push({ url: req.url, authorization: req.headers.authorization, host: req.headers.host, body })
  res.writeHead(200, { 'content-type': 'application/json' })
  if (req.url === '/stall') { res.write('{'); return }
  res.end(JSON.stringify({ choices: [{ message: { content: 'آماده‌ام' } }] }))
})
fixture.on('connection', track)
const authorities = []
const proxy = http.createServer().on('connect', (req, socket) => {
  authorities.push(req.url)
  // Remap only inside this recording fixture, so production still does real CONNECT and TLS/SNI verification.
  const upstream = net.connect(fixture.address().port, '127.0.0.1', () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    socket.pipe(upstream).pipe(socket)
  })
  track(upstream)
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
  socket.on('close', () => upstream.destroy())
})
proxy.on('connection', track)

async function main() {
  await listen(fixture); await listen(proxy)
  const port = proxy.address().port
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
    const response = await viaProxy(new URL(url), { method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: '{"model":"gemini-2.5-flash"}', signal: AbortSignal.timeout(3000) }, port)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).choices[0].message.content, 'آماده‌ام')
    assert.deepEqual(authorities, ['generativelanguage.googleapis.com:443'])
    assert.deepEqual(seen[0], { url: '/v1beta/openai/chat/completions', host: 'generativelanguage.googleapis.com', authorization: 'Bearer synthetic', body: '{"model":"gemini-2.5-flash"}' })
    // A proxy can send headers and then stop. The fetch signal must still close its response stream.
    const controller = new AbortController()
    const stalled = await viaProxy(new URL('https://generativelanguage.googleapis.com/stall'), { signal: controller.signal }, port)
    const body = stalled.text()
    controller.abort(new Error('fixture deadline'))
    let watchdog
    try {
      const result = await Promise.race([body.then(() => 'resolved', () => 'aborted'), new Promise(resolve => { watchdog = setTimeout(() => resolve('hung'), 1000) })])
      assert.equal(result, 'aborted', 'deadline must abort body consumption after headers')
    } finally { clearTimeout(watchdog) }
    await assert.rejects(viaProxy(new URL('https://wrong-host.example/'), { signal: AbortSignal.timeout(3000) }, port), /certificate|Hostname\/IP/)
    console.log('Real CONNECT + verified TLS Gemini POST, body deadline and wrong-host refusal passed')
  } finally { for (const socket of sockets) socket.destroy(); proxy.close(); fixture.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

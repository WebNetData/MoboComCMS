const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const cp = require('node:child_process')

test('form webhooks pin public TLS and observe the response without retaining its body', { skip: process.platform === 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forms-webhook-tls-'))
  try {
    cp.execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', dir + '/key.pem', '-out', dir + '/cert.pem', '-days', '1', '-subj', '/CN=hooks.example', '-addext', 'subjectAltName=DNS:hooks.example'], { stdio: 'ignore' })
    const program = String.raw`
const fs = require('node:fs'), https = require('node:https'), tls = require('node:tls'), assert = require('node:assert/strict')
let server
;(async () => {
  const dir = process.argv[1], state = { posts: 0, path: '', host: '', body: '', mode: 'ok', connects: 0 }
  server = https.createServer({ key: fs.readFileSync(dir + '/key.pem'), cert: fs.readFileSync(dir + '/cert.pem') }, (req, res) => {
    state.posts++
    state.path = req.url
    state.host = req.headers.host
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      state.body = body
      if (state.mode === 'redirect') { res.writeHead(302, { location: 'https://other.example/' }); res.end(); return }
      // Deliberately never finish the body. The sender must finish on response headers.
      res.writeHead(202, { 'Content-Type': 'text/plain' })
      res.flushHeaders()
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const source = require('./scripts/connected-source-loader.cjs')({
    'node:dns/promises': { lookup: async host => { assert.equal(host, 'hooks.example'); return [{ address: '8.8.8.8', family: 4 }] } },
    'node:tls': { ...tls, connect: options => {
      state.connects++
      assert.equal(options.host, '8.8.8.8')
      assert.equal(options.port, 8443)
      assert.equal(options.servername, 'hooks.example')
      assert.equal(options.rejectUnauthorized, true)
      return tls.connect({ ...options, host: '127.0.0.1', port: server.address().port })
    } },
  })
  const owner = source('src/platform/http/public-https-post.ts')
  assert.equal(owner.publicAddress('127.0.0.1'), false)
  await assert.rejects(owner.publicHttpsPost('https://127.0.0.1:8443/', '{}', {}), owner.PublicHttpsDestinationError)
  assert.equal(state.connects, 0)
  const destination = 'https://hooks.example:8443/callback?kind=synthetic'
  assert.equal(await owner.publicHttpsPost(destination, '{"test":true}', {}, { beforeSend: async () => false }), null)
  assert.equal(state.posts, 0)
  const result = await Promise.race([
    owner.publicHttpsPost(destination, '{"test":true}', {}, { beforeSend: async () => true }),
    new Promise((_, reject) => setTimeout(() => reject(Error('response headers were not sufficient')), 3000)),
  ])
  assert.deepEqual(result, { status: 202 })
  assert.equal(state.posts, 1)
  assert.equal(state.path, '/callback?kind=synthetic')
  assert.equal(state.host, 'hooks.example:8443')
  assert.equal(state.body, '{"test":true}')
  state.mode = 'redirect'
  assert.deepEqual(await owner.publicHttpsPost(destination, '{}', {}), { status: 302 })
  assert.equal(state.posts, 2, 'redirect must not trigger another POST')
  assert.equal(state.connects, 3)
})().catch(error => { console.error(error.stack); process.exitCode = 1 }).finally(() => { server?.closeAllConnections?.(); server?.close() })
`
    const result = cp.spawnSync(process.execPath, ['-e', program, dir], {
      cwd: process.cwd(), env: { ...process.env, NODE_EXTRA_CA_CERTS: dir + '/cert.pem' },
      encoding: 'utf8', timeout: 30000, maxBuffer: 2e6,
    })
    assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || '') + (result.error?.message || ''))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// Runs the existing Playwright suite against a compiled application, never a deployed site.
// The caller supplies a disposable migrated/seeded PostgreSQL database and test secrets.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { spawn, execFileSync } = require('node:child_process')
const http = require('node:http'), https = require('node:https')
const url = new URL(process.env.NEXTAUTH_URL || 'http://invalid')
if (process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || process.env.NODE_ENV !== 'production' || url.origin !== 'https://e2e.mobocom.test:3443') {
  throw Error('COMPILED_DISPOSABLE_HTTPS_FIXTURE_REQUIRED')
}
execFileSync(process.execPath, ['scripts/production-preflight.cjs'], { stdio: 'inherit' })
if (!fs.existsSync('.next/BUILD_ID')) throw Error('PRODUCTION_BUILD_REQUIRED')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobocom-e2e-tls-'))
const certificate = path.join(directory, 'certificate.pem'), key = path.join(directory, 'key.pem')
let app, suite, proxy, ending = false
function finish(code) {
  if (ending) return
  ending = true
  suite?.kill('SIGTERM'); app?.kill('SIGTERM'); proxy?.close()
  const resolved = path.resolve(directory), root = path.resolve(os.tmpdir())
  if (path.dirname(resolved) === root && path.basename(resolved).startsWith('mobocom-e2e-tls-')) fs.rmSync(resolved, { recursive: true, force: true })
  process.exitCode = code
}
process.on('SIGTERM', () => finish(143)); process.on('SIGINT', () => finish(130))
async function ready() {
  for (let attempt = 0; attempt < 120 && !ending; attempt++) {
    const healthy = await new Promise(resolve => {
      const request = https.get(`${url.origin}/api/health/ready`, { rejectUnauthorized: false, timeout: 2000 }, response => { response.resume(); resolve(response.statusCode === 200) })
      request.on('timeout', () => request.destroy()); request.on('error', () => resolve(false))
    })
    if (healthy) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw Error('PRODUCTION_FIXTURE_NOT_READY')
}
async function main() {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', certificate, '-days', '1', '-subj', '/CN=e2e.mobocom.test', '-addext', 'subjectAltName=DNS:e2e.mobocom.test'], { stdio: 'ignore' })
  fs.chmodSync(key, 0o600)
  // Next normalizes loopback IPs to localhost in middleware URLs. Match that
  // hostname so an internal rewrite is not mistaken for an HTTPS upstream.
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3100', '-H', 'localhost'], {
    stdio: 'inherit', windowsHide: true,
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --dns-result-order=ipv4first`, NODE_EXTRA_CA_CERTS: certificate, REPOSITORY_ALLOW_PRIVATE: '1' },
  })
  app.on('error', error => { console.error(error.message); finish(1) })
  app.on('exit', code => { if (!ending) { console.error('Application exited before the browser suite finished'); finish(code || 1) } })
  proxy = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(certificate) }, (request, response) => {
    const upstream = http.request({ host: '127.0.0.1', port: 3100, path: request.url, method: request.method, headers: { ...request.headers, 'x-forwarded-proto': 'https', 'x-forwarded-host': request.headers.host } }, result => { response.writeHead(result.statusCode, result.headers); result.pipe(response) })
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end('Fixture application unavailable') })
    request.on('aborted', () => upstream.destroy()); request.pipe(upstream)
  })
  proxy.on('error', error => { console.error(error.message); finish(1) })
  proxy.listen(3443, '127.0.0.1')
  await ready()
  if (ending) return
  suite = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], {
    stdio: 'inherit', windowsHide: true,
    env: { ...process.env, E2E_BASE_URL: url.origin, E2E_FIXTURE_CERT: certificate },
  })
  suite.on('error', error => { console.error(error.message); finish(1) })
  suite.on('exit', code => finish(code ?? 1))
}
main().catch(error => { console.error(error.message); finish(1) })

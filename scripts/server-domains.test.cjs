const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const ts = require('typescript')

function load(relative) {
  const file = path.resolve(__dirname, '..', `${relative}.ts`)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const d = load('src/modules/server-panel/domain/domains')

test('domains are normalized and validated', () => {
  assert.equal(d.normalizeDomain('HTTPS://Dl.MoboCom.net/path?x'), 'dl.mobocom.net')
  assert.equal(d.normalizeDomain('mobocom.net.'), 'mobocom.net')
  for (const bad of ['localhost', 'a..b.com', '-a.com', 'a_b.com', 'x.c', '', '1.2.3.4']) assert.equal(d.normalizeDomain(bad), '', bad)
  assert.equal(d.normalizeCertDomain('*.MoboCom.net'), '*.mobocom.net')
  assert.equal(d.normalizeCertDomain('*.*.x.com'), '')
  assert.equal(d.apexOf('a.b.mobocom.net'), 'mobocom.net')
  assert.equal(d.apexOf('shop.example.co.ir'), 'example.co.ir')
})

test('wildcard certificates cover exactly one level', () => {
  const names = ['mobocom.net', '*.mobocom.net']
  assert.equal(d.certCovers(names, 'mobocom.net'), true)
  assert.equal(d.certCovers(names, 'dl.mobocom.net'), true)
  assert.equal(d.certCovers(names, 'a.dl.mobocom.net'), false)
  assert.equal(d.certCovers(names, 'evilmobocom.net'), false)
  assert.deepEqual(d.certificateNames('dl.mobocom.net', { wildcard: true, www: false }), ['mobocom.net', '*.mobocom.net'])
  assert.deepEqual(d.certificateNames('mobocom.net', { wildcard: false, www: true }), ['mobocom.net', 'www.mobocom.net'])
})

test('site entries: modes, targets and helper arguments', () => {
  const app = d.validateSite({ domain: 'MoboCom.net', mode: 'app', target: 'ignored', www: true, https: true })
  assert.deepEqual(d.siteApplyArgs(app), ['site-apply', 'mobocom.net', 'app', '-', '1', '1', 'mobocom.net'])
  const dl = d.validateSite({ domain: 'dl.mobocom.net', mode: 'static', target: 'dl', www: true })
  assert.equal(dl.target, '/var/www/dl')
  assert.equal(dl.www, false, 'www only for apex domains')
  assert.throws(() => d.validateSite({ domain: 'dl.mobocom.net', mode: 'static', target: '/etc/passwd' }), d.DomainError)
  assert.throws(() => d.validateSite({ domain: 'dl.mobocom.net', mode: 'static', target: '/var/www/../etc' }), d.DomainError)
  assert.throws(() => d.validateSite({ domain: 'x.com', mode: 'redirect', target: 'https://x.com' }), /خودش/)
  assert.throws(() => d.validateSite({ domain: 'x.com', mode: 'proxy', target: 'http://a;b' }), d.DomainError)
  assert.equal(d.validateSite({ domain: 'x.com', mode: 'proxy', target: 'http://127.0.0.1:8080' }).target, 'http://127.0.0.1:8080')
  assert.equal(d.validateSite({ domain: 'x.com', note: '<b>hi</b>' }).note, 'bhi/b')
})

test('certbot output is parsed with expiry days', () => {
  const out = `Found the following certs:\n  Certificate Name: mobocom.net\n    Serial Number: 4a\n    Key Type: ECDSA\n    Domains: mobocom.net *.mobocom.net\n    Expiry Date: 2026-12-01 10:00:00+00:00 (VALID: 63 days)\n    Certificate Path: /etc/letsencrypt/live/mobocom.net/fullchain.pem\n  Certificate Name: old.net\n    Domains: old.net\n    Expiry Date: 2026-09-01 10:00:00+00:00 (INVALID: EXPIRED)\n`
  const certs = d.parseCertificates(out, new Date('2026-09-29T10:00:00Z'))
  assert.equal(certs.length, 2)
  assert.deepEqual(certs[0].domains, ['mobocom.net', '*.mobocom.net'])
  assert.equal(certs[0].daysLeft, 63)
  assert.equal(certs[0].valid, true)
  assert.equal(certs[1].valid, false)
  assert.deepEqual(d.parseCertificates('No certificates found.'), [])
})

test('site address and DNS records', () => {
  assert.equal(d.normalizeSiteUrl('HTTPS://MoboCom.net/'), 'https://mobocom.net')
  assert.equal(d.normalizeSiteUrl('https://mobocom.net/shop'), '')
  assert.equal(d.normalizeSiteUrl('ftp://mobocom.net'), '')
  assert.deepEqual(d.validateDnsRecord({ type: 'a', name: 'dl', content: '1.2.3.4', proxied: true }, 'mobocom.net'), { type: 'A', name: 'dl.mobocom.net', content: '1.2.3.4', proxied: true, ttl: 1 })
  assert.equal(d.validateDnsRecord({ type: 'A', name: '@', content: '1.2.3.4' }, 'mobocom.net').name, 'mobocom.net')
  assert.equal(d.validateDnsRecord({ type: 'TXT', name: '_acme-challenge', content: 'x', proxied: true }, 'mobocom.net').proxied, false)
  assert.throws(() => d.validateDnsRecord({ type: 'A', name: 'dl', content: 'example.com' }, 'mobocom.net'), d.DomainError)
  assert.throws(() => d.validateDnsRecord({ type: 'NS', name: 'dl', content: 'ns.x.com' }, 'mobocom.net'), d.DomainError)
})

const helper = path.resolve(__dirname, '..', 'deploy/ubuntu/mobocom-webctl')
function webctl(args, dir) {
  return spawnSync('bash', [helper, ...args], { encoding: 'utf8', env: { ...process.env, WEBCTL_DRY: '1', WEBCTL_NGINX_DIR: dir, WEBCTL_ENV_FILE: path.join(dir, 'app.env'), WEBCTL_ACME_ROOT: path.join(dir, 'acme') } })
}

test('root helper writes nginx from templates and refuses bad input', { skip: process.platform === 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webctl-'))
  try {
    let r = webctl(['site-apply', 'mobocom.net', 'app', '-', '1', '1', 'mobocom.net'], dir)
    assert.equal(r.status, 0, r.stderr)
    const conf = fs.readFileSync(path.join(dir, 'sites-available/mobocom-mobocom.net.conf'), 'utf8')
    assert.match(conf, /server_name mobocom.net www.mobocom.net;/)
    assert.match(conf, /listen 443 ssl http2;/)
    assert.match(conf, /live\/mobocom.net\/fullchain.pem/)
    assert.match(conf, /return 301 https:\/\/\$host\$request_uri;/)
    assert.ok(fs.existsSync(path.join(dir, 'sites-enabled/mobocom-mobocom.net.conf')))
    r = webctl(['site-apply', 'dl.mobocom.net', 'static', '/var/www/dl', '0', '0', '-'], dir)
    assert.equal(r.status, 0, r.stderr)
    assert.match(fs.readFileSync(path.join(dir, 'sites-available/mobocom-dl.mobocom.net.conf'), 'utf8'), /root \/var\/www\/dl;/)
    for (const bad of [
      ['site-apply', 'x.com;rm', 'app', '-', '0', '0', '-'],
      ['site-apply', 'x.com', 'static', '/etc', '0', '0', '-'],
      ['site-apply', 'x.com', 'proxy', 'http://a b', '0', '0', '-'],
      ['cert-issue', 'x.com', 'http', 'a@b.com', '*.x.com'],
      ['cert-issue', 'x.com', 'http', 'not-an-email', 'x.com'],
      ['site-url', 'javascript:alert(1)'],
      ['nope'],
    ]) assert.equal(webctl(bad, dir).status, 2, bad.join(' '))
    r = webctl(['cert-issue', 'x.com', 'http', 'a@b.com', 'x.com', 'www.x.com'], dir)
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /certbot certonly .*--cert-name x.com .*-d x.com -d www.x.com --webroot/)
    fs.writeFileSync(path.join(dir, 'app.env'), 'NEXTAUTH_URL=http://old.net\nOTHER=1\n')
    assert.equal(webctl(['site-url', 'https://mobocom.net'], dir).status, 0)
    assert.equal(fs.readFileSync(path.join(dir, 'app.env'), 'utf8'), 'NEXTAUTH_URL=https://mobocom.net\nOTHER=1\n')
    assert.equal(webctl(['site-remove', 'dl.mobocom.net'], dir).status, 0)
    assert.ok(!fs.existsSync(path.join(dir, 'sites-available/mobocom-dl.mobocom.net.conf')))
    assert.match(webctl(['status'], dir).stdout, /"nginx":[01]/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

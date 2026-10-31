const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const ts = require('typescript-api')

function load(relative) {
  const file = path.resolve(__dirname, '..', `${relative}.ts`)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const d = load('src/modules/server-panel/domain/domains')
const installation = require('./connected-source-loader.cjs')()('src/modules/server-panel/domain/installation.ts')

test('web setup validates SSL choices without accepting arbitrary host operations', () => {
  const base = { domain: 'HTTPS://MoboCom.net/', email: 'owner@example.com', acmeAgreement: true }
  for (const method of ['http', 'cloudflare']) assert.deepEqual(installation.installationNetworkInput({ ...base, method }), { domain: 'mobocom.net', method, email: 'owner@example.com', www: false, url: 'https://mobocom.net' })
  assert.equal(installation.installationNetworkInput({ domain: 'mobocom.net', method: 'pem', www: true }).www, true)
  for (const input of [{ ...base, method: 'shell' }, { ...base, domain: 'a.com;id' }, { ...base, domain: '127.0.0.1' }, { ...base, email: 'bad' }, { ...base, acmeAgreement: false }, { domain: 'mobocom.net', method: 'external' }]) assert.throws(() => installation.installationNetworkInput(input))
})

test('Linux certificate helper keeps private versions and restores the pointer after a failed reload', { skip: process.platform === 'win32' || spawnSync('python3', ['--version']).status !== 0 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'certificate-helper-')), root = path.join(dir, 'certificates'), bin = path.join(dir, 'bin')
  try {
    fs.mkdirSync(bin); const cert = path.join(dir, 'cert.pem'), key = path.join(dir, 'key.pem'), other = path.join(dir, 'other.pem'), expired = path.join(dir, 'expired.pem')
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-subj', '/CN=example.com', '-addext', 'subjectAltName=DNS:example.com', '-addext', 'basicConstraints=critical,CA:FALSE', '-days', '2', '-out', cert, '-keyout', key], { stdio: 'ignore' })
    execFileSync('openssl', ['genpkey', '-algorithm', 'EC', '-pkeyopt', 'ec_paramgen_curve:P-256', '-out', other], { stdio: 'ignore' })
    // OpenSSL on Ubuntu26 no longer accepts negative -days. Issue a genuinely expired leaf with the same key.
    const config = path.join(dir, 'ca.cnf'), csr = path.join(dir, 'expired.csr')
    fs.writeFileSync(path.join(dir, 'index'), ''); fs.writeFileSync(path.join(dir, 'serial'), '01\n')
    fs.writeFileSync(config, `[ca]\ndefault_ca=fixture\n[fixture]\ndatabase=${dir}/index\nserial=${dir}/serial\nnew_certs_dir=${dir}\ndefault_md=sha256\npolicy=names\nx509_extensions=leaf\n[names]\ncommonName=supplied\n[leaf]\nbasicConstraints=critical,CA:FALSE\nsubjectAltName=DNS:example.com\n`)
    execFileSync('openssl', ['req', '-new', '-key', key, '-subj', '/CN=example.com', '-out', csr], { stdio: 'ignore' })
    execFileSync('openssl', ['ca', '-selfsign', '-batch', '-notext', '-config', config, '-keyfile', key, '-in', csr, '-startdate', '20200101000000Z', '-enddate', '20200102000000Z', '-out', expired], { stdio: 'ignore' })
    const payload = (c = cert, k = key) => fs.readFileSync(c).toString('base64') + '\n' + fs.readFileSync(k).toString('base64') + '\n'
    const helper = path.resolve(__dirname, '../deploy/ubuntu/certificate-import.py')
    const call = (args, input = payload(), env = process.env) => spawnSync('python3', [helper, ...args], { input, env, encoding: 'utf8' })
    const args = ['import', root, 'manual-example.com', 'example.com']
    let r = call(args); assert.equal(r.status, 0, r.stderr)
    const current = path.join(root, 'manual-example.com/current'), previous = fs.readlinkSync(current)
    assert.equal(fs.statSync(path.join(current, 'privkey.pem')).mode & 0o777, 0o600)
    assert.match(call(['list', root], '').stdout, /Certificate Name: manual-example.com/)
    for (const [input, changedArgs] of [[payload(cert, other), args], [payload(expired), args], ['not-base64\nkey\n', args], [payload(), [...args.slice(0, 3), 'wrong.example.com']], [payload(), ['import', root, '../escape', 'example.com']]]) {
      r = call(changedArgs, input); assert.equal(r.status, 2, r.stdout); assert.equal(fs.readlinkSync(current), previous)
      assert(!r.stderr.includes('PRIVATE KEY'))
    }
    for (const program of ['nginx', 'systemctl']) fs.writeFileSync(path.join(bin, program), '#!/bin/sh\nexit 1\n', { mode: 0o700 })
    r = call([...args, 'reload'], payload(), { ...process.env, PATH: bin + path.delimiter + process.env.PATH })
    assert.equal(r.status, 2); assert.equal(fs.readlinkSync(current), previous, 'failed Nginx check restores the previous certificate')
    assert.equal(call(['delete', root, 'manual-example.com'], '').status, 0)
    assert(!fs.existsSync(current))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('imported certificate output accepts the first block and ISO expiry timestamps', () => {
  const parsed = d.parseCertificates('  Certificate Name: manual-example.com\n    Domains: example.com\n    Expiry Date: 2030-01-01T12:00:00+00:00 (VALID: 20 days)\n    Certificate Path: /private/fullchain.pem', new Date('2029-12-01T00:00:00Z'))
  assert.equal(parsed.length, 1); assert.equal(parsed[0].valid, true); assert.equal(parsed[0].expiresAt, '2030-01-01T12:00:00.000Z')
})

test('PEM uploads validate key, SAN, dates, bounds and safe names before helper execution', () => {
  const { validateCertificateUpload } = require('./connected-source-loader.cjs')({})('src/modules/server-panel/server/certificates.ts')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-cert-'))
  try {
    const cert = path.join(dir, 'cert.pem'), key = path.join(dir, 'key.pem'), other = path.join(dir, 'other.pem')
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-subj', '/CN=example.com', '-addext', 'subjectAltName=DNS:example.com,DNS:www.example.com', '-addext', 'basicConstraints=critical,CA:FALSE', '-days', '2', '-out', cert, '-keyout', key], { stdio: 'ignore' })
    execFileSync('openssl', ['genpkey', '-algorithm', 'EC', '-pkeyopt', 'ec_paramgen_curve:P-256', '-out', other], { stdio: 'ignore' })
    const input = { domain: 'example.com', certificate: fs.readFileSync(cert, 'utf8'), privateKey: fs.readFileSync(key, 'utf8') }
    const value = validateCertificateUpload(input)
    assert.equal(value.name, 'manual-example.com'); assert.equal(value.domain, 'example.com'); assert.ok(value.expiresAt)
    for (const patch of [{ domain: 'other.example.com' }, { name: '../../escape' }, { name: '--option' }, { certificate: 'garbage' }, { certificate: input.certificate + 'garbage' }, { privateKey: fs.readFileSync(other, 'utf8') }, { privateKey: 'x'.repeat(32769) }]) assert.throws(() => validateCertificateUpload({ ...input, ...patch }))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

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
    assert.match(conf, /location = \/api\/admin\/server\/updates\/package/)
    assert.match(conf, /client_max_body_size 512m;/)
    assert.match(conf, /proxy_request_buffering off;/)
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

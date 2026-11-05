const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const cp = require('node:child_process')
const ts = require('typescript-api')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
function load(relative, stubs = {}) {
  const source = ts.transpileModule(read(relative), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)((name) => stubs[name] || require(name), mod, mod.exports)
  return mod.exports
}
const { parseProxyConfig, ProxyConfigError } = load('src/modules/social/domain/xray-link.ts')
const egressDomain = load('src/modules/social/domain/egress.ts')
const builder = require('../deploy/ubuntu/xray-config.cjs')
const UUID = '0e6a5f6e-7c2b-4b4e-9b3a-2f1d3c4b5a69'
const b64 = (value) => Buffer.from(value).toString('base64')

test('share links become one Xray outbound: VLESS with REALITY or WebSocket+TLS, VMess, Trojan, Shadowsocks, SOCKS', () => {
  const reality = parseProxyConfig(`vless://${UUID}@edge.example.com:443?type=tcp&security=reality&sni=www.microsoft.com&fp=chrome&pbk=${'A'.repeat(43)}&sid=6ba85179e30d4fc2&flow=xtls-rprx-vision&encryption=none#%D8%B3%D8%B1%D9%88%D8%B1`)
  assert.equal(reality.protocol, 'vless'); assert.equal(reality.server, 'edge.example.com'); assert.equal(reality.label, 'سرور')
  assert.deepEqual(reality.outbound.settings, { vnext: [{ address: 'edge.example.com', port: 443, users: [{ id: UUID, encryption: 'none', flow: 'xtls-rprx-vision' }] }] })
  assert.deepEqual(reality.outbound.streamSettings, { network: 'tcp', security: 'reality', realitySettings: { serverName: 'www.microsoft.com', fingerprint: 'chrome', publicKey: 'A'.repeat(43), shortId: '6ba85179e30d4fc2', spiderX: '' } })

  const ws = parseProxyConfig(`vless://${UUID}@1.2.3.4:8443?type=ws&security=tls&sni=cdn.example.com&host=cdn.example.com&path=%2Fapi&alpn=h2,http/1.1`)
  assert.deepEqual(ws.outbound.streamSettings, { network: 'ws', security: 'tls', tlsSettings: { serverName: 'cdn.example.com', alpn: ['h2', 'http/1.1'] }, wsSettings: { path: '/api', host: 'cdn.example.com' } })

  const vmess = parseProxyConfig('vmess://' + b64(JSON.stringify({ v: '2', ps: 'vm', add: 'vm.example.com', port: '443', id: UUID, aid: '0', scy: 'auto', net: 'grpc', path: 'svc', tls: 'tls', sni: 'vm.example.com' })))
  assert.equal(vmess.label, 'vm')
  assert.deepEqual(vmess.outbound.settings.vnext[0].users, [{ id: UUID, alterId: 0, security: 'auto' }])
  assert.equal(vmess.outbound.streamSettings.network, 'grpc'); assert.equal(vmess.outbound.streamSettings.security, 'tls')

  const trojan = parseProxyConfig('trojan://p%40ss@tr.example.com:443?sni=tr.example.com#t')
  assert.deepEqual(trojan.outbound.settings, { servers: [{ address: 'tr.example.com', port: 443, password: 'p@ss' }] })
  assert.equal(trojan.outbound.streamSettings.security, 'tls', 'Trojan is TLS unless the link says otherwise')

  const sip002 = parseProxyConfig(`ss://${b64('chacha20-ietf-poly1305:secret')}@ss.example.com:8388#ss`)
  assert.deepEqual(sip002.outbound.settings, { servers: [{ address: 'ss.example.com', port: 8388, method: 'chacha20-ietf-poly1305', password: 'secret' }] })
  const legacy = parseProxyConfig(`ss://${b64('aes-256-gcm:pw@10.0.0.9:443')}`)
  assert.equal(legacy.outbound.settings.servers[0].address, '10.0.0.9')
  const blake = parseProxyConfig(`ss://2022-blake3-aes-128-gcm:${encodeURIComponent('a2V5a2V5a2V5a2V5a2V5aw==')}@[2001:db8::1]:443`)
  assert.equal(blake.outbound.settings.servers[0].address, '2001:db8::1'); assert.equal(blake.outbound.settings.servers[0].password, 'a2V5a2V5a2V5a2V5a2V5aw==')

  assert.deepEqual(parseProxyConfig('socks5://u:p@10.1.1.1:1080').outbound.settings, { servers: [{ address: '10.1.1.1', port: 1080, users: [{ user: 'u', pass: 'p' }] }] })
})

test('Xray outbound JSON is accepted only with the keys an outbound needs', () => {
  const outbound = { protocol: 'vless', settings: { vnext: [{ address: 'j.example.com', port: 443, users: [{ id: UUID, encryption: 'none' }] }] }, streamSettings: { network: 'tcp', security: 'none' } }
  assert.equal(parseProxyConfig(JSON.stringify(outbound)).server, 'j.example.com')
  assert.equal(parseProxyConfig(JSON.stringify({ outbounds: [{ protocol: 'freedom', settings: {} }, outbound] })).protocol, 'vless', 'the first usable outbound of a whole configuration')
  for (const [input, message] of [
    [JSON.stringify({ ...outbound, sendThrough: '1.1.1.1' }), /sendThrough/],
    [JSON.stringify({ ...outbound, streamSettings: { network: 'tcp', sockopt: { mark: 255 } } }), /sockopt/],
    [JSON.stringify({ ...outbound, streamSettings: { security: 'tls', tlsSettings: { allowInsecure: true } } }), /allowInsecure/],
    [JSON.stringify({ protocol: 'freedom', settings: {} }), /پشتیبانی نمی‌شود/],
  ]) assert.throws(() => parseProxyConfig(input), (error) => error instanceof ProxyConfigError && message.test(error.message), input)
})

test('a link that is unsafe or broken is refused with a reason the owner can act on', () => {
  for (const [input, message] of [
    ['', /وارد کنید/],
    ['wireguard://x', /شناخته نشد/],
    [`vless://${UUID}@h.example.com:443?security=tls&allowInsecure=1`, /allowInsecure/],
    [`vless://not a uuid@h.example.com:443`, /خوانده نشد|UUID/],
    [`vless://${UUID}@h.example.com:70000`, /خوانده نشد|پورت/],
    [`vless://${UUID}@h.example.com:443?type=kcp`, /kcp/],
    [`vless://${UUID}@h.example.com:443?security=reality&pbk=short`, /pbk/],
    [`vless://${UUID}@h.example.com:443?encryption=aes`, /none/],
    [`ss://${b64('rc4-md5:pw')}@h.example.com:1`, /rc4-md5/],
    ['vmess://%%%', /base64|VMess/],
    ['x'.repeat(20000), /طولانی/],
  ]) assert.throws(() => parseProxyConfig(input), (error) => error instanceof ProxyConfigError && message.test(error.message), input.slice(0, 60))
})

test('the root builder fixes listening and routing: 127.0.0.1 only, Telegram and Instagram through the outbound, the rest dropped', () => {
  const outbound = parseProxyConfig(`vless://${UUID}@edge.example.com:443?security=tls&sni=edge.example.com`).outbound
  const config = builder.build(outbound)
  assert.deepEqual(config.inbounds, [{ tag: 'site', listen: '127.0.0.1', port: 10809, protocol: 'http', settings: { allowTransparent: false } }])
  assert.equal(config.outbounds[0].tag, 'upstream'); assert.equal(config.outbounds[0].protocol, 'vless')
  assert.deepEqual(config.outbounds[1], { tag: 'drop', protocol: 'blackhole' })
  assert.deepEqual(config.routing.rules, [
    { type: 'field', inboundTag: ['site'], domain: builder.DOMAINS, outboundTag: 'upstream' },
    { type: 'field', inboundTag: ['site'], outboundTag: 'drop' },
  ])
  for (const domain of ['domain:telegram.org', 'domain:facebook.com', 'domain:instagram.com']) assert.ok(builder.DOMAINS.includes(domain))
  assert.equal(config.log.access, 'none', 'no request log of the owner\'s traffic')
  // What the panel sends cannot add listeners, change routing or weaken TLS.
  for (const [bad, message] of [
    [{ ...outbound, inbounds: [] }, /inbounds/],
    [{ protocol: 'freedom', settings: {} }, /freedom/],
    [{ ...outbound, streamSettings: { sockopt: {} } }, /sockopt/],
    [{ ...outbound, streamSettings: { tlsSettings: { allowInsecure: true } } }, /allowInsecure/],
    [[outbound], /object/],
  ]) assert.throws(() => builder.build(bad), message)
  // As the root helper runs it: JSON on stdin, configuration on stdout, a refusal on stderr.
  const ran = cp.spawnSync(process.execPath, [path.join(root, 'deploy/ubuntu/xray-config.cjs')], { input: JSON.stringify(outbound), encoding: 'utf8' })
  assert.equal(ran.status, 0, ran.stderr); assert.equal(JSON.parse(ran.stdout).inbounds[0].listen, '127.0.0.1')
  const refused = cp.spawnSync(process.execPath, [path.join(root, 'deploy/ubuntu/xray-config.cjs')], { input: '{"protocol":"dokodemo-door","settings":{}}', encoding: 'utf8' })
  assert.equal(refused.status, 2); assert.match(refused.stderr, /not allowed/)
})

test('the root helper applies only what Xray accepts, and the installer checks the pinned hash before installing', { skip: process.platform === 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xrayctl-'))
  try {
    // A stand-in for xray: "run -test -c FILE" accepts a configuration whose outbound server is not refused.example.
    const fake = path.join(dir, 'xray')
    fs.writeFileSync(fake, '#!/bin/sh\n[ "$1 $2 $3" = "run -test -c" ] || exit 9\nif grep -q refused.example "$4"; then echo "Failed to build outbound"; exit 1; fi\necho "Configuration OK."\n', { mode: 0o755 })
    const run = (input) => cp.spawnSync('bash', [path.join(root, 'deploy/ubuntu/mobocom-xrayctl'), 'apply'], { input, encoding: 'utf8', env: { ...process.env, XRAYCTL_DRY: '1', XRAYCTL_XRAY: fake, XRAYCTL_BUILDER: path.join(root, 'deploy/ubuntu/xray-config.cjs'), XRAYCTL_DIR: dir } })
    const good = parseProxyConfig(`trojan://pw@ok.example:443`).outbound
    let result = run(JSON.stringify(good)); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /configuration accepted/)
    result = run(JSON.stringify({ ...good, settings: { servers: [{ address: 'refused.example', port: 443, password: 'x' }] } }))
    assert.equal(result.status, 2); assert.match(result.stderr, /Xray rejected the configuration: Failed to build outbound/)
    result = run('{"protocol":"freedom","settings":{}}'); assert.equal(result.status, 2); assert.match(result.stderr, /not allowed/)
    result = run('x'.repeat(70000)); assert.equal(result.status, 2); assert.match(result.stderr, /too large/)
    const status = cp.spawnSync('bash', [path.join(root, 'deploy/ubuntu/mobocom-xrayctl'), 'status'], { encoding: 'utf8', env: { ...process.env, XRAYCTL_DRY: '1', XRAYCTL_XRAY: path.join(dir, 'missing'), XRAYCTL_DIR: dir } })
    assert.deepEqual(JSON.parse(status.stdout), { installed: 0, version: '', configured: 0, active: 0, port: 10809, builder: 1 }, 'an old or missing builder reads as version 1')
    const newer = cp.spawnSync('bash', [path.join(root, 'deploy/ubuntu/mobocom-xrayctl'), 'status'], { encoding: 'utf8', env: { ...process.env, XRAYCTL_DRY: '1', XRAYCTL_XRAY: path.join(dir, 'missing'), XRAYCTL_DIR: dir, XRAYCTL_BUILDER: path.join(root, 'deploy/ubuntu/xray-config.cjs') } })
    assert.equal(JSON.parse(newer.stdout).builder, 2)
    // check: Xray tests the profiles, nothing is installed or restarted.
    const check = cp.spawnSync('bash', [path.join(root, 'deploy/ubuntu/mobocom-xrayctl'), 'check'], { input: JSON.stringify({ version: 2, profiles: [{ tag: 'p1', outbound: good }], routes: { ai: 'p1' } }), encoding: 'utf8', env: { ...process.env, XRAYCTL_DRY: '1', XRAYCTL_XRAY: fake, XRAYCTL_BUILDER: path.join(root, 'deploy/ubuntu/xray-config.cjs'), XRAYCTL_DIR: dir } })
    assert.equal(check.status, 0, check.stderr); assert.match(check.stdout, /OK configuration accepted/)
    assert.equal(fs.existsSync(path.join(dir, 'config.json')), false)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }

  const install = read('deploy/ubuntu/xray-install.sh')
  assert.ok(install.indexOf('does not match its pinned SHA-256') < install.indexOf('install -m 755 -o root -g root "$WORK/xray"'), 'the hash is checked before the binary is installed')
  assert.match(install, /mobocom ALL=\(root\) NOPASSWD: \/usr\/local\/sbin\/mobocom-xrayctl\n/)
  const pins = read('deploy/ubuntu/xray-core.txt').replace(/\r\n/g, '\n').split('\n').filter((line) => line && !line.startsWith('#')).map((line) => line.split(' '))
  assert.deepEqual(pins.map((row) => row[1]).sort(), ['Xray-linux-64.zip', 'Xray-linux-arm64-v8a.zip'])
  for (const row of pins) { assert.match(row[0], /^v\d+\.\d+\.\d+$/); assert.match(row[2], /^[0-9a-f]{64}$/) }
  const unit = read('deploy/ubuntu/mobocom-xray.service')
  for (const line of ['User=mobocom-xray', 'NoNewPrivileges=true', 'ProtectSystem=strict', 'CapabilityBoundingSet=', 'ConditionPathExists=/etc/mobocom/xray/config.json']) assert.ok(unit.includes(line), line)
  const installer = read('deploy/ubuntu/install.sh')
  assert.equal((installer.match(/ xray-install\.sh xray-core\.txt xray-config\.cjs mobocom-xrayctl mobocom-xray\.service; do/g) || []).length, 2, 'both installation modes carry the proxy assets')
  assert.match(installer, /bash "\$ROOT_ASSETS\/xray-install\.sh" \|\| note /, 'the optional proxy never stops the installation')
})

test('the site sends only Telegram and Instagram through the local proxy, and only while the owner has it on', async () => {
  let enabled = false
  // The first setting (one link, on/off) still drives Telegram and Instagram until profiles are saved.
  const egress = load('src/modules/social/server/egress.ts', { '@/modules/settings/server': { readJsonSetting: async (key) => key === 'social.proxy.v1' ? { enabled, link: 'encrypted' } : undefined }, '@/modules/social/domain/egress': egressDomain })
  // A local proxy that records what it is asked to reach and refuses it (no TLS is needed to see the tunnel request).
  const asked = []
  const proxy = http.createServer().on('connect', (req, socket) => { asked.push(req.url); socket.end('HTTP/1.1 403 Forbidden\r\n\r\n') })
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve))
  const port = proxy.address().port
  try {
    await assert.rejects(egress.viaProxy(new URL('https://api.telegram.org/botX/getMe'), { method: 'POST', body: '{}' }, port), /refused api\.telegram\.org \(403\)/)
    assert.deepEqual(asked, ['api.telegram.org:443'], 'the tunnel goes to the host, with the request inside it')
    const closed = await new Promise((resolve) => { const s = http.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) }) })
    await assert.rejects(egress.viaProxy(new URL('https://graph.facebook.com/'), {}, closed), /social-network proxy is not reachable/)
    const aborted = AbortSignal.abort(new Error('stopped'))
    await assert.rejects(egress.viaProxy(new URL('https://api.telegram.org/'), { signal: aborted }, port), /stopped/)
  } finally { proxy.close() }
  // socialFetch: other hosts and a switched-off proxy go out directly (here: a stub fetch).
  const direct = []
  const realFetch = global.fetch
  global.fetch = async (url) => { direct.push(String(url)); return new Response('direct') }
  try {
    await egress.socialFetch('https://example.com/x')
    await egress.socialFetch('https://api.telegram.org/botX/getMe')
    enabled = true; egress.forgetSocialProxySetting()
    await egress.socialFetch('https://example.com/y')
    await egress.socialFetch('http://api.telegram.org/plain')
    assert.deepEqual(direct, ['https://example.com/x', 'https://api.telegram.org/botX/getMe', 'https://example.com/y', 'http://api.telegram.org/plain'])
    await assert.rejects(egress.socialFetch('https://api.telegram.org/botX/getMe'), /social-network proxy is not reachable/, 'on and an allowed host: through the proxy, which is not running here')
  } finally { global.fetch = realFetch }
  assert.deepEqual([...egress.SOCIAL_PROXY_HOSTS], ['api.telegram.org', 'graph.facebook.com', 'graph.instagram.com'])
})

test('the root builder takes named profiles: each purpose reaches only its own hosts through its profile, the rest is dropped', () => {
  const a = parseProxyConfig(`vless://${UUID}@edge.example.com:443?security=tls&sni=edge.example.com`).outbound
  const b = parseProxyConfig('trojan://pw@other.example:443').outbound
  const config = builder.build({ version: 2, profiles: [{ tag: 'p1', outbound: a }, { tag: 'p2', outbound: b }], routes: { telegram: 'p1', updates: 'p2', ai: 'p2' } })
  assert.deepEqual(config.inbounds, [{ tag: 'site', listen: '127.0.0.1', port: 10809, protocol: 'http', settings: { allowTransparent: false } }])
  assert.deepEqual(config.outbounds.map((o) => o.tag), ['p1', 'p2', 'drop'])
  assert.deepEqual(config.routing.rules, [
    { type: 'field', inboundTag: ['site'], domain: builder.PURPOSES.telegram, outboundTag: 'p1' },
    { type: 'field', inboundTag: ['site'], domain: builder.PURPOSES.updates, outboundTag: 'p2' },
    { type: 'field', inboundTag: ['site'], domain: builder.PURPOSES.ai, outboundTag: 'p2' },
    { type: 'field', inboundTag: ['site'], outboundTag: 'drop' },
  ])
  assert.ok(builder.PURPOSES.updates.includes('domain:github.com'))
  assert.equal(builder.BUILDER_VERSION, 2)
  // The panel cannot name hosts, add keys, reuse or invent tags, or weaken an outbound.
  for (const [bad, message] of [
    [{ version: 2, profiles: [{ tag: 'p1', outbound: a }], routes: { anything: 'p1' } }, /not known/],
    [{ version: 2, profiles: [{ tag: 'p1', outbound: a }], routes: { telegram: 'p2' } }, /not given/],
    [{ version: 2, profiles: [{ tag: 'p1', outbound: a }], routes: {} }, /no purpose/],
    [{ version: 2, profiles: [{ tag: 'p1', outbound: a }, { tag: 'p1', outbound: b }], routes: { telegram: 'p1' } }, /each once/],
    [{ version: 2, profiles: [{ tag: 'upstream', outbound: a }], routes: { telegram: 'upstream' } }, /p1 to p8/],
    [{ version: 2, profiles: [{ tag: 'p1', outbound: a, domains: ['x.com'] }], routes: { telegram: 'p1' } }, /domains/],
    [{ version: 2, profiles: [{ tag: 'p1', outbound: { protocol: 'freedom', settings: {} } }], routes: { telegram: 'p1' } }, /freedom/],
    [{ version: 2, profiles: [{ tag: 'p1', outbound: a }], routes: { telegram: 'p1' }, rules: [] }, /rules/],
    [{ version: 2, profiles: Array.from({ length: 9 }, (_, i) => ({ tag: `p${i + 1}`, outbound: a })), routes: { telegram: 'p1' } }, /between 1 and 8/],
  ]) assert.throws(() => builder.build(bad), message)
})

test('profiles and purposes: hosts map to purposes, old settings become profile p1, and an old builder takes only one shared profile', () => {
  const d = egressDomain
  assert.equal(d.purposeOfHost('api.telegram.org'), 'telegram')
  assert.equal(d.purposeOfHost('graph.instagram.com'), 'instagram')
  assert.equal(d.purposeOfHost('api.openai.com'), 'ai')
  assert.equal(d.purposeOfHost('generativelanguage.googleapis.com'), 'ai')
  assert.equal(d.purposeOfHost('storage.googleapis.com'), null, 'only the listed Google host, not all of googleapis.com')
  assert.equal(d.purposeOfHost('evilopenai.com'), null)
  assert.equal(d.purposeOfHost('example.com'), null)
  const legacy = d.fromLegacy({ enabled: true, link: 'enc', label: 'Germany', protocol: 'vless', server: 'de.example:443' })
  assert.deepEqual(legacy.routes, { telegram: 'p1', instagram: 'p1' }); assert.equal(legacy.profiles[0].name, 'Germany')
  assert.deepEqual(d.fromLegacy({ enabled: false, link: 'enc' }).routes, {})
  assert.deepEqual(d.fromLegacy({}).profiles, [])
  const settings = d.normalizeEgress({ profiles: [{ id: 'p1', name: ' A ', link: 'x' }, { id: 'p1', name: 'dup', link: 'y' }, { id: 'p9', link: 'z' }, { id: 'p2', name: 'B', link: 'w' }], routes: { telegram: 'p1', ai: 'p2', updates: 'p7', bogus: 'p1' } })
  assert.deepEqual(settings.profiles.map((p) => [p.id, p.name]), [['p1', 'A'], ['p2', 'B']])
  assert.deepEqual(settings.routes, { telegram: 'p1', ai: 'p2' }, 'unknown purposes and missing profiles are dropped')
  assert.equal(d.nextProfileId(settings), 'p3')
  const out = (p) => `outbound-${p.id}`
  assert.deepEqual(d.helperPayload(settings, out, 2), { kind: 'v2', body: { version: 2, profiles: [{ tag: 'p1', outbound: 'outbound-p1' }, { tag: 'p2', outbound: 'outbound-p2' }], routes: { telegram: 'p1', ai: 'p2' } } })
  assert.deepEqual(d.helperPayload(settings, out, 1), { kind: 'old-builder' })
  assert.deepEqual(d.helperPayload({ ...settings, routes: { telegram: 'p2', instagram: 'p2' } }, out, 1), { kind: 'v1', body: 'outbound-p2' })
  assert.deepEqual(d.helperPayload({ ...settings, routes: {} }, out, 2), { kind: 'none' })
})

test('the site sends a purpose through the proxy only when that purpose has a profile', async () => {
  const stored = { profiles: [{ id: 'p1', name: 'A', link: 'enc' }], routes: { ai: 'p1' } }
  const egress = load('src/modules/social/server/egress.ts', { '@/modules/settings/server': { readJsonSetting: async (key) => key === 'egress.proxy.v2' ? stored : { enabled: true, link: 'old' } }, '@/modules/social/domain/egress': egressDomain })
  const direct = []
  const realFetch = global.fetch
  global.fetch = async (url) => { direct.push(String(url)); return new Response('direct') }
  try {
    await egress.egressFetch('https://api.telegram.org/botX/getMe')
    assert.deepEqual(direct, ['https://api.telegram.org/botX/getMe'], 'saved profiles replace the first setting: Telegram has none here')
    await assert.rejects(egress.egressFetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: new Headers({ authorization: 'Bearer x' }), body: '{}' }), /proxy is not reachable/, 'AI goes to the local proxy (not running here)')
  } finally { global.fetch = realFetch }
  // The AI client and the updater use the same profiles.
  const ai = read('src/modules/ai/server/client.ts')
  assert.match(ai, /fetch: egressFetch as unknown as typeof fetch/)
  assert.match(ai, /await egressFetch\(`\$\{baseUrl\}\/chat\/completions`/)
  assert.match(read('deploy/ubuntu/git-fetch.sh'), /PANEL_PROXY="\$\{UPDATE_STATE_DIR:-storage\/update\}\/git-proxy"/)
})

test('the updater fetch reads the panel proxy file and still validates it', { skip: process.platform === 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitproxy-'))
  try {
    const repo = path.join(dir, 'repo'); fs.mkdirSync(repo)
    const git = (...args) => cp.execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, encoding: 'utf8' })
    git('init', '-q'); fs.writeFileSync(path.join(repo, 'a'), '1'); git('add', '-A'); git('commit', '-qm', 'x')
    const app = path.join(dir, 'app'); cp.execFileSync('git', ['clone', '-q', repo, app])
    const state = path.join(dir, 'state'); fs.mkdirSync(state)
    const run = () => cp.spawnSync('bash', [path.join(root, 'deploy/ubuntu/git-fetch.sh'), '--tags', 'origin'], { cwd: app, encoding: 'utf8', env: { ...process.env, UPDATE_STATE_DIR: state, UPDATE_GIT_PROXY: '' } })
    fs.writeFileSync(path.join(state, 'git-proxy'), 'http://127.0.0.1:10809\n')
    let result = run(); assert.equal(result.status, 0, result.stderr); assert.match(result.stderr, /through UPDATE_GIT_PROXY/)
    fs.writeFileSync(path.join(state, 'git-proxy'), 'http://x; id\n')
    result = run(); assert.equal(result.status, 2); assert.match(result.stderr, /invalid UPDATE_GIT_PROXY/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('Telegram, the reseller bot receipts and Instagram publishing all go through socialFetch', () => {
  assert.match(read('src/modules/notifications/server/telegram.ts'), /await socialFetch\(`\$\{config\.apiBase\}\/bot\$\{config\.token\}\/\$\{method\}`/)
  assert.match(read('src/modules/reseller/server/http/reseller/bot/sales/[id]/receipt/route.ts'), /await socialFetch\(`https:\/\/api\.telegram\.org\/file\/bot/)
  const social = read('src/modules/social/server/social.ts')
  assert.equal((social.match(/await socialFetch\(`https:\/\/graph\.facebook\.com\//g) || []).length, 2)
  assert.doesNotMatch(social, /await fetch\(`https:\/\/graph\.facebook\.com/)
  // The panel endpoint is behind the unlocked Server Panel and never writes the link into the audit log.
  const http = read('src/modules/server-panel/server/http/proxy.ts')
  assert.equal((http.match(/const gate = await serverGate\(req\)/g) || []).length, 2)
  assert.doesNotMatch(http, /audit\([^)]*link/)
})

test('Gemini HTTPS proxy preserves the request, verifies certificates and aborts a stalled body', { skip: process.platform === 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-tls-'))
  try {
    cp.execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem'), '-subj', '/CN=generativelanguage.googleapis.com', '-addext', 'subjectAltName=DNS:generativelanguage.googleapis.com'], { stdio: 'ignore' })
    const result = cp.spawnSync(process.execPath, [path.join(root, 'scripts/fixtures/egress-tls.cjs'), dir], { cwd: root, env: { ...process.env, NODE_EXTRA_CA_CERTS: path.join(dir, 'cert.pem') }, encoding: 'utf8', timeout: 15000 })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

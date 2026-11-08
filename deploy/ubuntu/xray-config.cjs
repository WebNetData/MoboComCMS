#!/usr/bin/env node
// Builds the whole Xray-core configuration of the site's outbound proxy from JSON read on stdin. Installed root-owned and
// run by mobocom-xrayctl. The Server Panel decides only where traffic leaves: one or more named outbounds (profiles)
// and which profile each purpose uses. Listening (an HTTP proxy on 127.0.0.1:10809), the hosts of each purpose (below),
// dropping everything else, and logging are fixed here, so the panel can neither open a port nor send other traffic out.
//
//   version 1 (still accepted): one outbound, used for Telegram and Instagram.
//   version 2: {"version":2,"profiles":[{"tag":"p1","outbound":{…}}],"routes":{"telegram":"p1","updates":"p2"}}
'use strict'

const PORT = 10809
const PROTOCOLS = ['vless', 'vmess', 'trojan', 'shadowsocks', 'socks', 'http']
const OUTBOUND_KEYS = ['protocol', 'settings', 'streamSettings', 'tag', 'mux']
const STREAM_KEYS = ['network', 'security', 'tlsSettings', 'realitySettings', 'wsSettings', 'grpcSettings', 'xhttpSettings', 'httpupgradeSettings', 'tcpSettings', 'rawSettings']
const BUILDER_VERSION = 2
// The hosts each purpose may reach. A purpose without a profile, and every other host, is dropped.
const PURPOSES = {
  telegram: ['domain:telegram.org', 'domain:t.me', 'domain:telegram.me'],
  instagram: ['domain:facebook.com', 'domain:fbcdn.net', 'domain:instagram.com', 'domain:cdninstagram.com'],
  updates: ['domain:github.com', 'domain:githubusercontent.com'],
  ai: ['domain:openai.com', 'domain:anthropic.com', 'full:generativelanguage.googleapis.com', 'domain:openrouter.ai', 'domain:groq.com', 'full:dashscope-intl.aliyuncs.com', 'full:api.deepseek.com'],
}
const DOMAINS = [...PURPOSES.telegram, ...PURPOSES.instagram]
const MAX_PROFILES = 8
const MAX = 65536

function refuse(message) { const error = new Error(message); error.refused = true; throw error }

/** One checked outbound with the given tag. */
function outboundOf(outbound, tag) {
  if (!outbound || typeof outbound !== 'object' || Array.isArray(outbound)) refuse('the outbound must be a JSON object')
  if (!PROTOCOLS.includes(outbound.protocol)) refuse(`protocol ${JSON.stringify(outbound.protocol)} is not allowed`)
  for (const key of Object.keys(outbound)) if (!OUTBOUND_KEYS.includes(key)) refuse(`outbound key ${JSON.stringify(key)} is not allowed`)
  if (!outbound.settings || typeof outbound.settings !== 'object' || Array.isArray(outbound.settings)) refuse('outbound settings are missing')
  const stream = outbound.streamSettings
  if (stream !== undefined) {
    if (!stream || typeof stream !== 'object' || Array.isArray(stream)) refuse('streamSettings must be an object')
    for (const key of Object.keys(stream)) if (!STREAM_KEYS.includes(key)) refuse(`streamSettings key ${JSON.stringify(key)} is not allowed`)
    if (stream.tlsSettings && stream.tlsSettings.allowInsecure === true) refuse('allowInsecure is not allowed')
  }
  return { protocol: outbound.protocol, settings: outbound.settings, ...(stream ? { streamSettings: stream } : {}), ...(outbound.mux ? { mux: outbound.mux } : {}), tag }
}

function configuration(outbounds, rules) {
  return {
    log: { loglevel: 'warning', access: 'none', dnsLog: false },
    inbounds: [{ tag: 'site', listen: '127.0.0.1', port: PORT, protocol: 'http', settings: { allowTransparent: false } }],
    outbounds: [...outbounds, { tag: 'drop', protocol: 'blackhole' }],
    routing: { domainStrategy: 'AsIs', rules: [...rules, { type: 'field', inboundTag: ['site'], outboundTag: 'drop' }] },
  }
}

/** Version 2: named profiles and the profile each purpose uses. */
function buildProfiles(input) {
  for (const key of Object.keys(input)) if (!['version', 'profiles', 'routes'].includes(key)) refuse(`key ${JSON.stringify(key)} is not allowed`)
  if (!Array.isArray(input.profiles) || !input.profiles.length || input.profiles.length > MAX_PROFILES) refuse(`between 1 and ${MAX_PROFILES} profiles are needed`)
  const tags = new Set()
  const outbounds = input.profiles.map((profile) => {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) refuse('a profile must be a JSON object')
    for (const key of Object.keys(profile)) if (!['tag', 'outbound'].includes(key)) refuse(`profile key ${JSON.stringify(key)} is not allowed`)
    if (typeof profile.tag !== 'string' || !/^p[1-8]$/.test(profile.tag) || tags.has(profile.tag)) refuse('profile tags are p1 to p8, each once')
    tags.add(profile.tag)
    return outboundOf(profile.outbound, profile.tag)
  })
  const routes = input.routes
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)) refuse('routes must be a JSON object')
  const rules = []
  for (const [purpose, tag] of Object.entries(routes)) {
    if (!Object.prototype.hasOwnProperty.call(PURPOSES, purpose)) refuse(`purpose ${JSON.stringify(purpose)} is not known`)
    if (!tags.has(tag)) refuse(`purpose ${purpose} names a profile that is not given`)
    rules.push({ type: 'field', inboundTag: ['site'], domain: PURPOSES[purpose], outboundTag: tag })
  }
  if (!rules.length) refuse('no purpose uses a profile')
  return configuration(outbounds, rules)
}

function build(input) {
  if (input && typeof input === 'object' && !Array.isArray(input) && input.version === 2) return buildProfiles(input)
  // Version 1: one outbound for Telegram and Instagram, exactly as before.
  return configuration([outboundOf(input, 'upstream')], [{ type: 'field', inboundTag: ['site'], domain: DOMAINS, outboundTag: 'upstream' }])
}

module.exports = { build, PORT, DOMAINS, PROTOCOLS, PURPOSES, BUILDER_VERSION }

if (require.main === module) {
  const chunks = []
  let size = 0
  process.stdin.on('data', (chunk) => { size += chunk.length; if (size > MAX) { process.stderr.write('the outbound is too large\n'); process.exit(2) } chunks.push(chunk) })
  process.stdin.on('end', () => {
    try {
      process.stdout.write(JSON.stringify(build(JSON.parse(Buffer.concat(chunks).toString('utf8'))), null, 2) + '\n')
    } catch (error) {
      process.stderr.write(`${error.refused ? error.message : 'the outbound is not valid JSON'}\n`)
      process.exit(2)
    }
  })
}

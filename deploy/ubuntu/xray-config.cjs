#!/usr/bin/env node
// Builds the whole Xray-core configuration of the site's social-network proxy from one outbound read on stdin (JSON).
// Installed root-owned and run by mobocom-xrayctl. The Server Panel decides only where traffic leaves; listening
// (an HTTP proxy on 127.0.0.1:10809), routing (Telegram and Instagram/Facebook hosts only, everything else dropped) and
// logging are fixed here, so the panel can neither open a port nor send other traffic through the proxy.
'use strict'

const PORT = 10809
const PROTOCOLS = ['vless', 'vmess', 'trojan', 'shadowsocks', 'socks', 'http']
const OUTBOUND_KEYS = ['protocol', 'settings', 'streamSettings', 'tag', 'mux']
const STREAM_KEYS = ['network', 'security', 'tlsSettings', 'realitySettings', 'wsSettings', 'grpcSettings', 'xhttpSettings', 'httpupgradeSettings', 'tcpSettings', 'rawSettings']
const DOMAINS = ['domain:telegram.org', 'domain:t.me', 'domain:telegram.me', 'domain:facebook.com', 'domain:fbcdn.net', 'domain:instagram.com', 'domain:cdninstagram.com']
const MAX = 65536

function refuse(message) { const error = new Error(message); error.refused = true; throw error }

function build(outbound) {
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
  const upstream = { protocol: outbound.protocol, settings: outbound.settings, ...(stream ? { streamSettings: stream } : {}), ...(outbound.mux ? { mux: outbound.mux } : {}), tag: 'upstream' }
  return {
    log: { loglevel: 'warning', access: 'none', dnsLog: false },
    inbounds: [{ tag: 'site', listen: '127.0.0.1', port: PORT, protocol: 'http', settings: { allowTransparent: false } }],
    outbounds: [upstream, { tag: 'drop', protocol: 'blackhole' }],
    routing: {
      domainStrategy: 'AsIs',
      rules: [
        { type: 'field', inboundTag: ['site'], domain: DOMAINS, outboundTag: 'upstream' },
        { type: 'field', inboundTag: ['site'], outboundTag: 'drop' },
      ],
    },
  }
}

module.exports = { build, PORT, DOMAINS, PROTOCOLS }

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

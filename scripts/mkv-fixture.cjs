// A small Matroska file built byte by byte for tests: EBML header, a Segment with SeekHead, Info, Tracks, clusters of
// filler "video" with subtitle blocks between, and Cues that point at every subtitle line the way mkvmerge writes them
// (time, cluster, relative position, duration). Options leave the subtitle cues out, give clusters a short size field,
// compress a track with zlib, or add a picture subtitle track.
const zlib = require('node:zlib')

const idBytes = n => { const out = []; let v = n; while (v > 0) { out.unshift(v & 0xff); v = Math.floor(v / 256) } return Buffer.from(out) }
// Sizes are written in 8 bytes (0x01 + 7), as mkvmerge does for clusters; `short` writes the smallest size field.
const sizeBytes = (n, short) => {
  if (short) { for (let len = 1; len <= 8; len++) if (n < 2 ** (7 * len) - 1) { const out = Buffer.alloc(len); let v = n; for (let i = len - 1; i >= 0; i--) { out[i] = v & 0xff; v = Math.floor(v / 256) } out[0] |= 0x80 >> (len - 1); return out } }
  const out = Buffer.alloc(8); out[0] = 0x01; let v = n; for (let i = 7; i >= 1; i--) { out[i] = v & 0xff; v = Math.floor(v / 256) } return out
}
const el = (id, ...parts) => { const body = Buffer.concat(parts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p))); return Buffer.concat([idBytes(id), sizeBytes(body.length), body]) }
const uint = (id, value, width = 0) => { const bytes = []; let v = value; do { bytes.unshift(v & 0xff); v = Math.floor(v / 256) } while (v > 0); while (bytes.length < width) bytes.unshift(0); return el(id, Buffer.from(bytes)) }
const str = (id, value) => el(id, Buffer.from(value, 'utf8'))

/**
 * tracks: [{ number, codec, language, name, forced, header, zlib }]; lines: { [track]: [{ start, duration, text }] } (ms).
 * Returns { file, lines: where each subtitle block was put, subtitleBytes } .
 */
function buildMkv({ tracks, lines, filler = 256 * 1024, clusterMs = 5000, length = 60_000, subtitleCues = true, shortClusterSize = false }) {
  const trackEntries = [el(0xAE, uint(0xD7, 1), uint(0x83, 1), str(0x86, 'V_MPEG4/ISO/AVC'))]
  for (const t of tracks) {
    const parts = [uint(0xD7, t.number), uint(0x83, 0x11), str(0x86, t.codec)]
    if (t.language) parts.push(str(0x22B59C, t.language))
    if (t.name) parts.push(str(0x536E, t.name))
    if (t.forced) parts.push(uint(0x55AA, 1))
    if (t.header) parts.push(str(0x63A2, t.header))
    if (t.zlib) parts.push(el(0x6D80, el(0x6240, uint(0x5032, 1), uint(0x5033, 0), el(0x5034, uint(0x4254, 0)))))
    trackEntries.push(el(0xAE, ...parts))
  }
  const info = el(0x1549A966, uint(0x2AD7B1, 1_000_000))
  const tracksEl = el(0x1654AE6B, ...trackEntries)
  const seekEntry = (id, pos) => el(0x4DBB, uint(0x53AB, id), uint(0x53AC, pos, 8))
  const seekLength = el(0x114D9B74, seekEntry(0x1549A966, 0), seekEntry(0x1654AE6B, 0), seekEntry(0x1C53BB6B, 0)).length
  // Clusters: filler video, then the subtitle blocks that start within the cluster's time.
  const placed = [], clusters = []
  let at = seekLength + info.length + tracksEl.length
  for (let time = 0; time < length; time += clusterMs) {
    const body = [uint(0xE7, time), el(0xA3, Buffer.concat([Buffer.from([0x81, 0, 0, 0x80]), Buffer.alloc(filler, 7)]))]
    const blocks = []
    for (const t of tracks) for (const line of lines[t.number] || []) {
      if (line.start < time || line.start >= time + clusterMs) continue
      const raw = Buffer.from(line.text, 'utf8'), payload = t.zlib ? zlib.deflateSync(raw) : raw
      const rel = line.start - time
      const block = el(0xA0, el(0xA1, Buffer.concat([Buffer.from([0x80 | t.number, (rel >> 8) & 0xff, rel & 0xff, 0x00]), payload])), uint(0x9B, line.duration))
      blocks.push({ t, line, block })
    }
    let offset = body.reduce((n, b) => n + b.length, 0)
    for (const b of blocks) { placed.push({ track: b.t.number, time: b.line.start, duration: b.line.duration, cluster: at, relative: offset, size: b.block.length }); offset += b.block.length; body.push(b.block) }
    const content = Buffer.concat(body)
    const cluster = Buffer.concat([idBytes(0x1F43B675), sizeBytes(content.length, shortClusterSize), content])
    clusters.push(cluster); at += cluster.length
  }
  const cuesAt = at
  const points = [el(0xBB, uint(0xB3, 0), el(0xB7, uint(0xF7, 1), uint(0xF1, seekLength + info.length + tracksEl.length), uint(0xF0, 3)))]
  if (subtitleCues) for (const p of placed) points.push(el(0xBB, uint(0xB3, p.time), el(0xB7, uint(0xF7, p.track), uint(0xF1, p.cluster), uint(0xF0, p.relative), uint(0xB2, p.duration))))
  const cues = el(0x1C53BB6B, ...points)
  const seek = el(0x114D9B74, seekEntry(0x1549A966, seekLength), seekEntry(0x1654AE6B, seekLength + info.length), seekEntry(0x1C53BB6B, cuesAt))
  const segment = el(0x18538067, seek, info, tracksEl, ...clusters, cues)
  const file = Buffer.concat([el(0x1A45DFA3, str(0x4282, 'matroska')), segment])
  return { file, placed, subtitleBytes: placed.reduce((n, p) => n + p.size, 0) }
}

module.exports = { buildMkv }

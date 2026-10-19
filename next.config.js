/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: { '/*': ['./scripts/backup-worker.cjs', './scripts/backup-core.cjs'] },
  // SFTP/FTP clients load native optional modules at runtime; never bundle them.
  serverExternalPackages: ['ssh2', 'ssh2-sftp-client', 'basic-ftp', 'cpu-features', 'ioredis', 'pdfkit'],
  // CDN: CDN_URL (e.g. https://cdn.example.com) serves /_next/static from a CDN pull zone.
  assetPrefix: process.env.CDN_URL || undefined,
  async headers() {
    const year = 'public, max-age=31536000, immutable'
    const week = 'public, max-age=604800, stale-while-revalidate=86400'
    return [
      { source: '/fonts/:path*', headers: [{ key: 'Cache-Control', value: year }] },
      { source: '/images/:path*', headers: [{ key: 'Cache-Control', value: week }] },
      { source: '/icons/:path*', headers: [{ key: 'Cache-Control', value: week }] },
      // Let CDNs and browsers reuse cross-origin fonts and static files.
      { source: '/_next/static/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }] },
    ]
  },
}

// Development and production output must not overwrite each other during preview.
module.exports = (phase) => ({
  ...nextConfig,
  distDir: phase === 'phase-development-server' ? '.next-dev' : '.next',
})

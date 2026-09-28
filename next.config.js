/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: { '/*': ['./scripts/backup-worker.cjs', './scripts/backup-core.cjs'] },
  eslint: { ignoreDuringBuilds: true },
  // SFTP/FTP clients load native optional modules at runtime; never bundle them.
  serverExternalPackages: ['ssh2', 'ssh2-sftp-client', 'basic-ftp', 'cpu-features'],
}

// Development and production output must not overwrite each other during preview.
module.exports = (phase) => ({
  ...nextConfig,
  distDir: phase === 'phase-development-server' ? '.next-dev' : '.next',
})

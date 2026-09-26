/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: { '/*': ['./scripts/backup-worker.cjs', './scripts/backup-core.cjs'] },
  eslint: { ignoreDuringBuilds: true },
}

// Development and production output must not overwrite each other during preview.
module.exports = (phase) => ({
  ...nextConfig,
  distDir: phase === 'phase-development-server' ? '.next-dev' : '.next',
})

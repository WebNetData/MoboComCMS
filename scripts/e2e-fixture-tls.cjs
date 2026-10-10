const fs = require('node:fs')
const { X509Certificate, createHash } = require('node:crypto')

/** Trust only the disposable HTTPS fixture's public key in Chromium, including service workers. */
function fixtureTLS(baseURL) {
  const certificate = process.env.E2E_FIXTURE_CERT
  if (!certificate) return { args: [], ignoreHTTPSErrors: false }
  const url = new URL(baseURL)
  if (process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || url.protocol !== 'https:' || !['localhost', '127.0.0.1', 'e2e.mobocom.test'].includes(url.hostname)) {
    throw Error('TLS_CERTIFICATE_REQUIRES_DISPOSABLE_LOCAL_FIXTURE')
  }
  const key = new X509Certificate(fs.readFileSync(certificate)).publicKey.export({ type: 'spki', format: 'der' })
  const hash = createHash('sha256').update(key).digest('base64')
  // Playwright's request client also needs to accept the generated certificate.
  // Chromium receives a single-certificate exception rather than a global TLS switch.
  return { args: [`--ignore-certificate-errors-spki-list=${hash}`], ignoreHTTPSErrors: true }
}

module.exports = { fixtureTLS }

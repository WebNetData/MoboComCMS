export class AiError extends Error {
  constructor(message: string, readonly status = 400, readonly credentialReason?: 'auth' | 'quota' | 'rate' | 'unavailable', readonly retryCredential = true) { super(message) }
}

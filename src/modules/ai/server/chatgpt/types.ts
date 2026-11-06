export class ChatGptError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}
export const AUTH = 'https://auth.openai.com'
export const RESOURCE = 'https://api.openai.com/v1'
export const CALLBACK = 'http://127.0.0.1:1455/auth/callback'
export const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
export type Registration = { clientId: string; subject: string; email: string; access: string; refresh: string; idToken: string; expires: number; scopes: string[] }
export type Pending = { state: string; nonce: string; verifier: string; clientId: string; subject: string; expires: number }
export type State = { version: 1; hostId: string; enabled: boolean; active: string; model: string; accounts: Registration[]; pending?: Pending; completing?: string }
export const validClient = (value: unknown): value is string => typeof value === 'string' && /^oaiapp_[A-Za-z0-9_-]{1,200}$/.test(value)
export const validModel = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value)

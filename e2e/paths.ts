import path from 'node:path'

/** The saved administrator session (created by global setup when credentials are given). */
export const ADMIN_STATE = process.env.E2E_ADMIN_STATE || path.join(__dirname, '.auth', 'admin.json')

import type { DriverConnection } from '@/modules/hosting/server/drivers/contract'
import type { CloudOperationInput, CloudOperationResult } from '@/modules/hosting/server/drivers/operations'
import { hostingRequest } from '@/modules/hosting/server/drivers/http'

const unknown = (): CloudOperationResult => ({ state: 'UNKNOWN', code: 'WHM_RESULT_UNKNOWN' })
export async function whmOperation(
  connection: DriverConnection,
  input: CloudOperationInput,
  inspect = false,
): Promise<CloudOperationResult> {
  const base = new URL(connection.url),
    headers = {
      authorization:
        connection.config.authMode === 'PASSWORD'
          ? 'Basic ' + Buffer.from(connection.username + ':' + connection.secret).toString('base64')
          : 'whm ' + connection.username + ':' + connection.secret,
      'content-type': 'application/x-www-form-urlencoded',
    }
  if (
    base.protocol !== 'https:' ||
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    base.username ||
    base.password ||
    !['', '2087'].includes(base.port)
  )
    return { state: 'FAILED', code: 'WHM_CONFIG' }
  const user = input.action === 'CREATE' ? input.username : input.resourceId
  if (!user || !/^[a-z][a-z0-9]{1,15}$/.test(user)) return { state: 'FAILED', code: 'WHM_ACCOUNT' }
  async function call(command: string, args: Record<string, string>, write = false) {
    const url = new URL('/json-api/' + command, base)
    url.searchParams.set('api.version', '1')
    if (!write) for (const [k, v] of Object.entries(args)) url.searchParams.set(k, v)
    const r = await hostingRequest(url.href, {
      method: write ? 'POST' : 'GET',
      headers,
      body: write ? new URLSearchParams(args).toString() : undefined,
      timeoutMs: 30000,
    })
    let d: Record<string, any>
    try {
      d = JSON.parse(r.text)
    } catch {
      throw Error('INVALID')
    }
    if (r.status !== 200 || d?.metadata?.result !== 1) throw Error('REFUSED')
    return d.data
  }
  try {
    // listaccts with exact matching avoids treating denied accountsummary as absence.
    const listed = await call('listaccts', { search: user, searchtype: 'user', searchmethod: 'exact' })
    if (!Array.isArray(listed?.acct)) return unknown()
    const account = listed.acct.find((a: Record<string, unknown>) => a.user === user)
    const matches =
      account &&
      account.domain === input.name &&
      (connection.username === 'root' || account.owner === connection.username)
    if (inspect) {
      if (input.action === 'TERMINATE' && !account) return { state: 'DONE', code: 'WHM_REMOVED' }
      if (!matches) return unknown()
      const suspended = account.suspended === 1 || account.suspended === '1'
      if (input.action === 'CREATE')
        return suspended
          ? unknown()
          : {
              state: 'DONE',
              code: 'WHM_CREATED',
              resourceId: user,
              data: {
                username: user,
                password: input.password,
                panelUrl: base.origin.replace(':2087', ':2083'),
                ipv4: typeof account.ip === 'string' ? account.ip : '',
              },
            }
      if ((input.action === 'SUSPEND' && suspended) || (input.action === 'UNSUSPEND' && !suspended))
        return { state: 'DONE', code: 'WHM_STATE_CONFIRMED', resourceId: user }
      return unknown()
    }
    if (input.action === 'CREATE') {
      if (account) return { state: 'FAILED', code: 'WHM_ACCOUNT_EXISTS' }
      if (!input.password || !input.plan || !['SHARED', 'CLOUD_HOSTING'].includes(String(input.config.kind)))
        return { state: 'FAILED', code: 'WHM_CREATE_CONFIG' }
      try {
        await call(
          'createacct',
          {
            username: user,
            domain: input.name,
            password: input.password,
            plan: input.plan,
            contactemail: input.email || '',
            hasshell: '0',
          },
          true,
        )
      } catch {
        return unknown()
      }
    } else {
      if (!matches) return { state: 'FAILED', code: 'WHM_OWNERSHIP' }
      const command = (
        { SUSPEND: 'suspendacct', UNSUSPEND: 'unsuspendacct', TERMINATE: 'removeacct' } as Record<string, string>
      )[input.action]
      if (!command) return { state: 'FAILED', code: 'WHM_UNSUPPORTED' }
      try {
        await call(
          command,
          { user, ...(input.action === 'SUSPEND' ? { reason: 'MoboCom service suspension' } : {}) },
          true,
        )
      } catch {
        return unknown()
      }
    }
    return { state: 'PENDING', code: 'WHM_CONFIRMING', resourceId: user, reference: user }
  } catch {
    return inspect ? unknown() : { state: 'FAILED', code: 'WHM_PREFLIGHT_REFUSED' }
  }
}

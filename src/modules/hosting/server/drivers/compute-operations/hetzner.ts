import type { DriverConnection } from '@/modules/hosting/server/drivers/contract'
import type { CloudOperationInput, CloudOperationResult } from '@/modules/hosting/server/drivers/operations'
import { hostingRequest } from '@/modules/hosting/server/drivers/http'

const uncertain = (): CloudOperationResult => ({ state: 'UNKNOWN', code: 'COMPUTE_RESULT_UNKNOWN' })
export async function hetznerOperation(
  c: DriverConnection,
  i: CloudOperationInput,
  reference: string,
  inspect: boolean,
): Promise<CloudOperationResult> {
  const api = 'https://api.hetzner.cloud/v1',
    headers = { authorization: 'Bearer ' + c.secret, 'content-type': 'application/json' }
  const call = async (path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', data?: unknown) => {
    const r = await hostingRequest(api + path, {
      headers,
      method,
      body: data === undefined ? undefined : JSON.stringify(data),
      timeoutMs: 30000,
    })
    if (
      r.status === 404 &&
      method === 'GET' &&
      inspect &&
      i.action === 'TERMINATE' &&
      path === '/servers/' + encodeURIComponent(i.resourceId || '')
    )
      return {}
    if (r.status < 200 || r.status >= 300) throw Error('REFUSED')
    return r.text ? JSON.parse(r.text) : {}
  }
  try {
    const data = i.resourceId
      ? await call('/servers/' + encodeURIComponent(i.resourceId))
      : await call('/servers?name=' + encodeURIComponent(i.resourceName))
    const server = i.resourceId
      ? data.server
      : data.servers?.find((s: Record<string, unknown>) => s.name === i.resourceName)
    const own = server && server.name === i.resourceName && server.labels?.mobocom === i.namespace
    if (inspect) {
      if (i.action === 'TERMINATE' && !server) return { state: 'DONE', code: 'SERVER_REMOVED' }
      if (!own) return uncertain()
      if (reference) {
        const action = (await call('/servers/' + server.id + '/actions/' + encodeURIComponent(reference))).action
        if (action?.status === 'error') return uncertain()
        if (action?.status !== 'success') return { state: 'PENDING', code: 'SERVER_TASK_PENDING', reference }
      }
      if (i.action === 'CREATE' && ['running', 'off'].includes(server.status))
        return {
          state: 'DONE',
          code: 'SERVER_CREATED',
          resourceId: String(server.id),
          data: {
            username: 'root',
            password: i.password,
            ipv4: server.public_net?.ipv4?.ip || '',
            ipv6: server.public_net?.ipv6?.ip || '',
            powerState: server.status === 'running' ? 'RUNNING' : 'STOPPED',
          },
        }
      if (['START', 'UNSUSPEND', 'REBOOT'].includes(i.action) && server.status === 'running' && reference)
        return { state: 'DONE', code: 'SERVER_RUNNING', resourceId: String(server.id), data: { powerState: 'RUNNING' } }
      if (['STOP', 'SHUTDOWN', 'SUSPEND'].includes(i.action) && server.status === 'off')
        return { state: 'DONE', code: 'SERVER_STOPPED', data: { powerState: 'STOPPED' } }
      return uncertain()
    }
    if (i.action === 'CREATE') {
      if (server) return { state: 'FAILED', code: 'SERVER_NAME_EXISTS' }
      if (!i.password || !i.plan || !i.config.image || !i.config.location)
        return { state: 'FAILED', code: 'SERVER_CREATE_CONFIG' }
      const body = {
        name: i.resourceName,
        server_type: i.plan,
        image: i.config.image,
        location: i.config.location,
        labels: { mobocom: i.namespace },
        start_after_create: true,
        user_data:
          '#cloud-config\nchpasswd:\n  expire: false\n  users:\n    - name: root\n      password: ' +
          JSON.stringify(i.password) +
          '\n      type: text\nssh_pwauth: true\n',
      }
      try {
        const created = await call('/servers', 'POST', body)
        return created.action?.id && created.server?.id
          ? {
              state: 'PENDING',
              code: 'SERVER_CREATING',
              reference: String(created.action.id),
              resourceId: String(created.server.id),
            }
          : uncertain()
      } catch {
        return uncertain()
      }
    }
    if (!own) return { state: 'FAILED', code: 'SERVER_OWNERSHIP' }
    const command = (
      {
        START: 'poweron',
        UNSUSPEND: 'poweron',
        STOP: 'poweroff',
        SUSPEND: 'poweroff',
        SHUTDOWN: 'shutdown',
        REBOOT: 'reboot',
      } as Record<string, string>
    )[i.action]
    try {
      const result =
        i.action === 'TERMINATE'
          ? await call('/servers/' + server.id, 'DELETE')
          : command
            ? await call('/servers/' + server.id + '/actions/' + command, 'POST', {})
            : null
      return result?.action?.id
        ? {
            state: 'PENDING',
            code: 'SERVER_TASK_PENDING',
            reference: String(result.action.id),
            resourceId: String(server.id),
          }
        : uncertain()
    } catch {
      return uncertain()
    }
  } catch {
    return inspect ? uncertain() : { state: 'FAILED', code: 'COMPUTE_PREFLIGHT_REFUSED' }
  }
}

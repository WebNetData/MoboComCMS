import type { DriverConnection } from '@/modules/hosting/server/drivers/contract'
import type { CloudOperationInput, CloudOperationResult } from '@/modules/hosting/server/drivers/operations'
import { hostingRequest } from '@/modules/hosting/server/drivers/http'

const uncertain = (): CloudOperationResult => ({ state: 'UNKNOWN', code: 'COMPUTE_RESULT_UNKNOWN' })
export async function proxmoxOperation(
  c: DriverConnection,
  i: CloudOperationInput,
  reference: string,
  inspect: boolean,
): Promise<CloudOperationResult> {
  const base = new URL(c.url),
    node = String(i.config.node || ''),
    vmid = Number(i.resourceId || Number(i.config.vmidBase) + Number(i.serviceId)),
    template = Number(i.plan || i.config.templateVmid)
  if (
    base.protocol !== 'https:' ||
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    base.username ||
    base.password ||
    !['', '8006'].includes(base.port) ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(node) ||
    !Number.isSafeInteger(vmid) ||
    vmid < 100 ||
    vmid > 999999999
  )
    return { state: 'FAILED', code: 'PVE_CONFIG' }
  const api = base.origin + '/api2/json',
    prefix = '/nodes/' + encodeURIComponent(node) + '/qemu/' + vmid,
    headers = {
      authorization: 'PVEAPIToken=' + c.username + '=' + c.secret,
      'content-type': 'application/x-www-form-urlencoded',
    }
  const call = async (
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    fields?: Record<string, string>,
  ) => {
    const r = await hostingRequest(api + path, {
      method,
      headers,
      body: fields ? new URLSearchParams(fields).toString() : undefined,
      timeoutMs: 30000,
    })
    if (r.status < 200 || r.status >= 300) throw Error('REFUSED')
    const parsed = JSON.parse(r.text)
    if (!('data' in parsed)) throw Error('INVALID')
    return parsed.data
  }
  try {
    const all = await call('/cluster/resources?type=vm')
    if (!Array.isArray(all)) return uncertain()
    const vm = all.find((v: Record<string, unknown>) => Number(v.vmid) === vmid),
      own = vm && vm.name === i.resourceName && vm.node === node
    if (inspect) {
      if (i.action === 'TERMINATE' && !vm) return { state: 'DONE', code: 'VM_REMOVED' }
      if (!own) return uncertain()
      const config = await call(prefix + '/config')
      if (config.description !== i.namespace) return uncertain()
      if (config.lock) return { state: 'PENDING', code: 'VM_LOCKED', reference }
      if (reference) {
        const task = await call(
          '/nodes/' + encodeURIComponent(node) + '/tasks/' + encodeURIComponent(reference) + '/status',
        )
        if (task.status !== 'stopped') return { state: 'PENDING', code: 'VM_TASK_PENDING', reference }
        if (task.exitstatus !== 'OK') return uncertain()
      }
      if (i.action === 'CREATE') {
        if (i.stage === 'CLONE')
          return { state: 'NEXT', code: 'VM_CLONED', resourceId: String(vmid), next: { stage: 'CONFIGURE' } }
        if (i.stage === 'CONFIGURE') return uncertain()
        if (vm.status === 'running')
          return {
            state: 'DONE',
            code: 'VM_CREATED',
            resourceId: String(vmid),
            data: { username: String(i.config.cloudUser || 'root'), password: i.password, powerState: 'RUNNING' },
          }
      } else if (['STOP', 'SUSPEND', 'SHUTDOWN'].includes(i.action) && vm.status === 'stopped')
        return { state: 'DONE', code: 'VM_STOPPED', data: { powerState: 'STOPPED' } }
      else if (['START', 'UNSUSPEND', 'REBOOT'].includes(i.action) && vm.status === 'running' && reference)
        return { state: 'DONE', code: 'VM_RUNNING', data: { powerState: 'RUNNING' } }
      return uncertain()
    }
    let path = prefix,
      method: 'POST' | 'PUT' | 'DELETE' = 'POST',
      fields: Record<string, string> | undefined = {}
    if (i.action === 'CREATE' && (!i.stage || i.stage === 'CLONE')) {
      if (vm) return { state: 'FAILED', code: 'VM_ID_OCCUPIED' }
      if (!Number.isSafeInteger(template) || template < 100 || template === vmid)
        return { state: 'FAILED', code: 'VM_TEMPLATE_CONFIG' }
      path = '/nodes/' + encodeURIComponent(node) + '/qemu/' + template + '/clone'
      fields = { newid: String(vmid), name: i.resourceName, full: '1', description: i.namespace }
    } else {
      if (!own) return { state: 'FAILED', code: 'VM_OWNERSHIP' }
      const config = await call(prefix + '/config')
      if (config.description !== i.namespace) return { state: 'FAILED', code: 'VM_MARKER_MISMATCH' }
      if (i.action === 'CREATE' && i.stage === 'CONFIGURE') {
        path += '/config'
        method = 'PUT'
        fields = {
          description: i.namespace,
          ciuser: String(i.config.cloudUser || 'root'),
          cipassword: i.password || '',
          ipconfig0: 'ip=dhcp',
        }
        if (!i.password) return { state: 'FAILED', code: 'VM_PASSWORD_MISSING' }
      } else if (i.action === 'TERMINATE') {
        method = 'DELETE'
        fields = undefined
      } else {
        const command = (
          {
            START: 'start',
            UNSUSPEND: 'start',
            STOP: 'stop',
            SUSPEND: 'stop',
            SHUTDOWN: 'shutdown',
            REBOOT: 'reboot',
            CREATE: 'start',
          } as Record<string, string>
        )[i.action]
        if (!command) return { state: 'FAILED', code: 'VM_UNSUPPORTED' }
        path += '/status/' + command
      }
    }
    try {
      const response = await call(path, method, fields)
      if (i.action === 'CREATE' && i.stage === 'CONFIGURE')
        return { state: 'NEXT', code: 'VM_CONFIGURED', resourceId: String(vmid), next: { stage: 'START' } }
      return {
        state: 'PENDING',
        code: 'VM_TASK_PENDING',
        resourceId: String(vmid),
        reference: typeof response === 'string' && response.startsWith('UPID:') ? response : '',
      }
    } catch {
      return uncertain()
    }
  } catch {
    return inspect ? uncertain() : { state: 'FAILED', code: 'PVE_PREFLIGHT_REFUSED' }
  }
}

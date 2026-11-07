/** Retained native control-plane APIs keep their host filesystem/service authority. */
export function nativeControlPlaneTarget(pathname: string, search: string, managed: boolean) {
  if (!managed || !pathname.startsWith('/api/admin/server/') || pathname === '/api/admin/server/engineering' || pathname.startsWith('/api/admin/server/engineering/')) return null
  const target = new URL('http://127.0.0.1:3000')
  target.pathname = pathname
  target.search = search
  return target
}

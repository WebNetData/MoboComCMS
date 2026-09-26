// Minimal GitHub Git Data API client used to apply code packages as a single
// commit. `fetch` is injected so the flow is testable without the network.

export interface GitTarget { token: string; repo: string; branch: string; apiBase?: string }
export interface GitFile { path: string; data: Buffer }
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>

export class GitApplyError extends Error {}

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const BRANCH = /^[A-Za-z0-9._/-]{1,100}$/

export function validGitTarget(target: Partial<GitTarget>): target is GitTarget {
  return !!target.token && !!target.repo && REPO.test(target.repo) && !!target.branch && BRANCH.test(target.branch) && !target.branch.includes('..')
}

function client(target: GitTarget, fetcher: FetchLike) {
  const base = (target.apiBase || 'https://api.github.com').replace(/\/+$/, '')
  return async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetcher(`${base}/repos/${target.repo}${path}`, {
      method,
      headers: { Authorization: `Bearer ${target.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'MoboComCMS-packages' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new GitApplyError(`GitHub ${method} ${path.split('?')[0]} failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`)
    }
    return response.json() as Promise<T>
  }
}

/** Files currently under `directory` on the branch (used to import sources and to delete removed files). */
export async function listDirectory(target: GitTarget, directory: string, fetcher: FetchLike) {
  const call = client(target, fetcher)
  const ref = await call<{ object: { sha: string } }>('GET', `/git/ref/heads/${target.branch}`)
  const commit = await call<{ tree: { sha: string } }>('GET', `/git/commits/${ref.object.sha}`)
  const tree = await call<{ tree: { path: string; type: string; sha: string }[]; truncated?: boolean }>('GET', `/git/trees/${commit.tree.sha}?recursive=1`)
  if (tree.truncated) throw new GitApplyError('the repository tree is too large to list')
  const prefix = directory.replace(/\/?$/, '/')
  return { headSha: ref.object.sha, baseTree: commit.tree.sha, files: tree.tree.filter(item => item.type === 'blob' && item.path.startsWith(prefix)).map(item => ({ path: item.path, sha: item.sha })) }
}

export async function readBlob(target: GitTarget, sha: string, fetcher: FetchLike): Promise<Buffer> {
  const blob = await client(target, fetcher)<{ content: string; encoding: string }>('GET', `/git/blobs/${sha}`)
  return Buffer.from(blob.content, blob.encoding === 'base64' ? 'base64' : 'utf8')
}

/**
 * Replace everything under `directory` with `files` in one commit on the
 * branch. Files that exist there but are not in the package are deleted.
 * The ref update is a fast-forward, so a concurrent push makes it fail
 * instead of silently discarding someone else's work.
 */
export async function commitDirectory(target: GitTarget, directory: string, files: GitFile[], message: string, fetcher: FetchLike) {
  const call = client(target, fetcher)
  const { headSha, baseTree, files: existing } = await listDirectory(target, directory, fetcher)
  const prefix = directory.replace(/\/?$/, '/')
  const wanted = new Set(files.map(file => prefix + file.path))
  const entries: { path: string; mode: '100644'; type: 'blob'; sha: string | null }[] = []
  for (const file of files) {
    const blob = await call<{ sha: string }>('POST', '/git/blobs', { content: file.data.toString('base64'), encoding: 'base64' })
    entries.push({ path: prefix + file.path, mode: '100644', type: 'blob', sha: blob.sha })
  }
  for (const file of existing) if (!wanted.has(file.path)) entries.push({ path: file.path, mode: '100644', type: 'blob', sha: null })
  const tree = await call<{ sha: string }>('POST', '/git/trees', { base_tree: baseTree, tree: entries })
  if (tree.sha === baseTree) return { commit: headSha, changed: false }
  const commit = await call<{ sha: string; html_url?: string }>('POST', '/git/commits', { message, tree: tree.sha, parents: [headSha] })
  await call('PATCH', `/git/refs/heads/${target.branch}`, { sha: commit.sha, force: false })
  return { commit: commit.sha, url: commit.html_url || `https://github.com/${target.repo}/commit/${commit.sha}`, changed: true }
}

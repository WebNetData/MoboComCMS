import os from 'node:os'
import { spawn } from 'node:child_process'
import type { Writable } from 'node:stream'

/** Why ffprobe/ffmpeg gave nothing: not installed, out of time, or the file was not readable. */
export class MediaToolError extends Error {
  constructor(readonly reason: 'missing' | 'timeout' | 'failed', readonly feedError: unknown = null) { super(`media tool ${reason}`) }
}

/** Container formats the tools may open, and no protocol but the local file or the pipe the server feeds. */
export const INPUT_LIMITS = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm,avi,mpegts', '-max_alloc', '67108864']

/**
 * Runs ffprobe/ffmpeg without a shell, with a minimal environment and bounded output. `feed` writes the
 * input into stdin (a remote file read through the guarded fetcher); ffmpeg itself never opens the network.
 * `feedError` is what went wrong while feeding, if anything — a tool that stops reading early causes one too.
 */
export function runMediaTool(binary: 'ffprobe' | 'ffmpeg', args: string[], options: { timeoutMs: number; feed?: (stdin: Writable) => Promise<unknown>; maxOutput?: number }) {
  return new Promise<{ stdout: string; feedError: unknown }>((resolve, reject) => {
    const child = spawn(binary, args, { shell: false, windowsHide: true, stdio: [options.feed ? 'pipe' : 'ignore', 'pipe', 'pipe'], env: { NODE_ENV: process.env.NODE_ENV || 'production', PATH: process.env.PATH || '', SystemRoot: process.env.SystemRoot || '', TEMP: os.tmpdir(), TMP: os.tmpdir(), LANG: 'C.UTF-8', AV_LOG_FORCE_NOCOLOR: '1' } })
    let stdout = '', overflow = false, timedOut = false, settled = false
    const limit = options.maxOutput ?? 256_000
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, options.timeoutMs)
    child.stdout?.on('data', data => { stdout += data; if (stdout.length > limit) { overflow = true; child.kill('SIGKILL') } })
    child.stderr?.resume()
    let fed: Promise<unknown> = Promise.resolve(null)
    if (options.feed && child.stdin) {
      const stdin = child.stdin
      stdin.on('error', () => { /* the tool stopped reading; the feeder sees it as its own error */ })
      // Whatever the feeder does with its streams, the tool sees the end of its input once feeding stops; it never waits for bytes that will not come.
      fed = options.feed(stdin).then(() => { stdin.end(); return null }, error => { stdin.destroy(); return error ?? new Error('feed failed') })
    }
    child.once('error', () => { if (settled) return; settled = true; clearTimeout(timer); reject(new MediaToolError('missing')) })
    child.once('close', code => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.stdin?.destroy()
      void fed.then(feedError => {
        if (code === 0 && !overflow && !timedOut) resolve({ stdout, feedError })
        else reject(new MediaToolError(timedOut ? 'timeout' : 'failed', feedError))
      })
    })
  })
}

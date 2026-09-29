import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The database engine this build was generated for (the schema variant decides it, not the address). */
export function buildProvider(): 'postgresql' | 'sqlite' | 'unknown' {
  try {
    const schema = readFileSync(join(process.cwd(), 'node_modules', '.prisma', 'client', 'schema.prisma'), 'utf8')
    const match = /datasource\s+\w+\s*\{[^}]*provider\s*=\s*"(\w+)"/.exec(schema)
    return match?.[1] === 'postgresql' ? 'postgresql' : match?.[1] === 'sqlite' ? 'sqlite' : 'unknown'
  } catch { return 'unknown' }
}

/**
 * Creates or updates the tables from the code's migrations (`prisma migrate deploy` for PostgreSQL,
 * `db push` for the SQLite development build). Resolves with the tail of the tool's output.
 */
export function applyMigrations(): Promise<string> {
  const cli = join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js')
  if (!existsSync(cli)) return Promise.reject(new Error('ابزار Prisma در این بسته نیست؛ جدول‌ها را با «npm run deploy:migrate» بسازید'))
  const args = buildProvider() === 'postgresql'
    ? [cli, 'migrate', 'deploy', '--schema', 'prisma/schema.postgresql.prisma']
    : [cli, 'db', 'push', '--skip-generate', '--schema', 'prisma/schema.prisma']
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, { cwd: process.cwd(), env: process.env, timeout: 180_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      const text = `${stdout}\n${stderr}`.split('\n').slice(-30).join('\n').trim()
      if (error) reject(new Error(text || error.message))
      else resolve(text)
    })
  })
}

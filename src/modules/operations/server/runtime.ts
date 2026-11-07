import { readFileSync } from 'node:fs'

/** Retained blue/green runtimes serve old connections; only the active one starts scheduled work. */
export function runtimeOwnsBackgroundWork() {
  const own = process.env.ENGINEERING_RUN_ID || 'native'
  try {
    const current = JSON.parse(readFileSync('/run/mobocom-engineering/active.json', 'utf8'))
    return typeof current.id === 'string' && current.id === own
  } catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' && own === 'native' }
}

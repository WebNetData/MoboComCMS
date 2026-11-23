import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Server compatibility readers share the version of this running artifact.
// Resolve once, as the updater does, without bundling package metadata in clients.
export const coreVersion: string = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version

const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const raw = fs.existsSync('.env') ? fs.readFileSync('.env','utf8') : ''
const url = process.env.DATABASE_URL || raw.match(/^DATABASE_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1] || ''
const schema = /^postgres(?:ql)?:/.test(url) ? 'prisma/schema.postgresql.prisma' : 'prisma/schema.prisma'
const result = spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'generate','--schema',schema],{stdio:'inherit',windowsHide:true})
process.exit(result.status ?? 1)

import fs from 'node:fs'

function normalize(text) {
  return text
    .replace(/provider\s*=\s*"(?:sqlite|postgresql)"/, 'provider = "<database>"')
    .replace(/\r\n/g, '\n')
    .trim()
}

const sqlite = normalize(fs.readFileSync('prisma/schema.prisma', 'utf8'))
const postgres = normalize(fs.readFileSync('prisma/schema.postgresql.prisma', 'utf8'))
if (sqlite !== postgres) {
  console.error('Prisma schema parity failed: SQLite and PostgreSQL models differ.')
  console.error('Only datasource provider may differ between the two schema files.')
  process.exit(1)
}
console.log('Prisma SQLite/PostgreSQL schema parity OK')

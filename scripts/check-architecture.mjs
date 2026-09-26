import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const src = path.join(root, 'src')
const errors = []

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? files(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })
}

function importsOf(source) {
  return [...source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g)].map((match) => match[1])
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/')
}

for (const file of files(src)) {
  const rel = relative(file)
  const source = fs.readFileSync(file, 'utf8')
  const imports = importsOf(source)

  if (rel.includes('/domain/')) {
    for (const specifier of imports) {
      if (
        specifier === 'react' || specifier.startsWith('react/') ||
        specifier === 'next' || specifier.startsWith('next/') ||
        specifier === '@prisma/client' ||
        specifier.startsWith('@/platform/') || specifier.startsWith('@/app/') ||
        specifier.includes('/infrastructure/') || specifier.includes('/server/') || specifier.includes('/ui/')
      ) {
        errors.push(`${rel}: domain layer cannot import ${specifier}`)
      }
    }
  }

  if (rel.includes('/application/')) {
    for (const specifier of imports) {
      if (
        specifier === 'react' || specifier.startsWith('react/') ||
        specifier === 'next' || specifier.startsWith('next/') ||
        specifier === '@prisma/client' || specifier.startsWith('@/platform/database/') ||
        specifier.startsWith('@/app/') || specifier.includes('/infrastructure/') || specifier.includes('/server/') || specifier.includes('/ui/')
      ) {
        errors.push(`${rel}: application layer cannot import ${specifier}`)
      }
    }
  }

  if (rel.startsWith('src/shared/')) {
    for (const specifier of imports) {
      if (specifier.startsWith('@/modules/') || specifier.startsWith('@/app/') || specifier.startsWith('@/components/')) {
        errors.push(`${rel}: shared layer cannot depend on ${specifier}`)
      }
    }
  }

  if (rel.startsWith('src/platform/')) {
    for (const specifier of imports) {
      if (specifier.startsWith('@/modules/') || specifier.startsWith('@/app/') || specifier.startsWith('@/components/')) {
        errors.push(`${rel}: platform layer cannot depend on ${specifier}`)
      }
    }
  }

  if (!rel.startsWith('src/lib/') && imports.some((specifier) => specifier.startsWith('@/lib/'))) {
    errors.push(`${rel}: legacy @/lib imports are forbidden; import the owning module/platform/shared API`)
  }

  if ((rel.startsWith('src/app/') || rel.startsWith('src/components/')) && imports.includes('@prisma/client')) {
    errors.push(`${rel}: UI/delivery layers cannot use Prisma model types as contracts`)
  }

  if (rel.startsWith('src/components/') && (source.includes("@/lib/db") || source.includes("@/platform/database/prisma"))) {
    errors.push(`${rel}: components cannot access the database directly`)
  }

  if (rel.startsWith('src/app/') && (source.includes("@/lib/db") || source.includes("@/platform/database/prisma"))) {
    errors.push(`${rel}: app layer cannot access the database directly; use the owning module boundary`)
  }

  if (rel.startsWith('src/themes/code/')) {
    for (const specifier of imports) {
      if (
        specifier === '@prisma/client' || specifier.startsWith('@/platform/database/') ||
        specifier.startsWith('@/app/') || specifier.startsWith('@/modules/') || specifier.startsWith('@/components/')
      ) {
        errors.push(`${rel}: code themes must use the Theme API/SDK instead of private Core dependency ${specifier}`)
      }
      if ((specifier.includes('/server/') || specifier.endsWith('/server')) && !specifier.startsWith('@/themes/')) {
        errors.push(`${rel}: code themes cannot import core server internals (${specifier})`)
      }
    }
  }

  if (rel.startsWith('src/plugins/') && rel !== 'src/plugins/registry.tsx' && rel !== 'src/plugins/types.ts') {
    for (const specifier of imports) {
      if (
        specifier === '@prisma/client' || specifier.startsWith('@/platform/database/') || specifier.startsWith('@/app/') ||
        specifier.startsWith('@/modules/') || specifier.startsWith('@/components/')
      ) {
        errors.push(`${rel}: plugins must use the extension SDK/contracts instead of private Core dependency ${specifier}`)
      }
      if ((specifier.includes('/server/') || specifier.endsWith('/server')) && !specifier.startsWith('@/extensions/') && !specifier.startsWith('@/plugins/')) {
        errors.push(`${rel}: plugins cannot import core server internals (${specifier}); expose a stable extension SDK capability instead`)
      }
    }
  }
}

if (errors.length) {
  console.error('Architecture check failed:\n' + errors.map((item) => ` - ${item}`).join('\n'))
  process.exit(1)
}

console.log('Architecture boundaries OK')

const fs = require('node:fs')
const path = require('node:path')

/** Runtime uploads/configuration belong to the persistent volume, never to release assets. */
function checkRuntimeTraces(projectRoot = process.cwd()) {
  const root = path.resolve(projectRoot), output = path.join(root, '.next'), storage = path.join(root, 'storage')
  if (!fs.existsSync(path.join(output, 'BUILD_ID'))) throw new Error('A completed production build is required')
  let manifests = 0, entries = 0
  const rejected = []
  function walk(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name)
      if (item.isDirectory()) { if (item.name !== 'cache') walk(file); continue }
      if (!item.name.endsWith('.nft.json')) continue
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!Array.isArray(manifest.files) || manifest.files.some(entry => typeof entry !== 'string')) throw new Error('Invalid build trace: ' + path.relative(output, file))
      manifests++; entries += manifest.files.length
      const includesRuntime = manifest.files.some(entry => {
        const relative = path.relative(storage, path.resolve(path.dirname(file), entry))
        return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)
      })
      if (includesRuntime) rejected.push(path.relative(output, file))
    }
  }
  walk(output)
  if (!manifests) throw new Error('No production file traces were generated')
  if (rejected.length) throw new Error('Runtime storage must not be shipped in build traces: ' + rejected.join(', '))
  return { manifests, entries }
}

module.exports = { checkRuntimeTraces }
if (require.main === module) {
  try { console.log(JSON.stringify({ runtimeStorageExcluded: true, ...checkRuntimeTraces() })) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}

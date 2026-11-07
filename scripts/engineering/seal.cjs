// Hash actual immutable runtime bytes, not a label or a successful build message.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
async function sealDirectory(root) {
    const base = fs.realpathSync(root), digest = crypto.createHash('sha256');
    const ignored = new Set(['.git', '.agents', '.claude', '.codex', '.ai', '.mobocom', 'docs', 'storage']);
    async function visit(directory, relative = '') {
        for (const name of fs.readdirSync(directory).sort()) {
            if (!relative && ignored.has(name))
                continue;
            const file = path.join(directory, name), key = relative ? relative + '/' + name : name;
            if (key === '.next/cache' || key === 'public/uploads' || key === '.engineering-checks.json')
                continue;
            if (!relative && (name === '.env' || (name.startsWith('.env.') && !name.endsWith('.example'))))
                throw new Error('A runtime artifact cannot contain production dotenv files');
            const stat = fs.lstatSync(file);
            digest.update(key + '\0');
            if (stat.isSymbolicLink()) {
                if (path.isAbsolute(fs.readlinkSync(file)) || !fs.realpathSync(file).startsWith(base + path.sep))
                    throw new Error('Artifact link escapes a portable root');
                digest.update('link\0' + fs.readlinkSync(file) + '\0');
            }
            else if (stat.isDirectory()) {
                digest.update('directory\0');
                await visit(file, key);
            }
            else if (stat.isFile()) {
                digest.update('file\0' + stat.size + '\0' + (stat.mode & 0o111) + '\0');
                for await (const chunk of fs.createReadStream(file))
                    digest.update(chunk);
                digest.update('\0');
            }
            else
                throw new Error('Unsupported artifact entry');
        }
    }
    await visit(base);
    return digest.digest('hex');
}
if (require.main === module)
    sealDirectory('/artifact').then(value => process.stdout.write(value + '\n')).catch(() => { console.error('Runtime artifact integrity could not be verified'); process.exitCode = 1; });
module.exports = { sealDirectory };

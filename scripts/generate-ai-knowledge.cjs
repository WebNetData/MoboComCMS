const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), root = process.argv.includes('--root') ? path.resolve(process.argv[process.argv.indexOf('--root') + 1]) : path.resolve(__dirname, '..');
const files = ['AGENTS.md', 'docs/agent/ARCHITECTURE.md', 'docs/agent/PLATFORM_DECISIONS.md', 'docs/agent/FRONTEND_QUALITY.md', 'docs/agent/MOBOCOM_MAP.md', ...['audit', 'spec', 'develop', 'release', 'contracts', 'extensions'].map(s => `.agents/skills/mobocom-${s}/SKILL.md`)];
const shipped = path.join(root, 'src/modules/ai/domain/engineering-knowledge.generated.json');
if (files.some(file => !fs.existsSync(path.join(root, file)))) {
    const bundle = JSON.parse(fs.readFileSync(shipped, 'utf8'));
    if (bundle.version !== 1 || bundle.entries.length !== files.length || bundle.entries.some((entry, i) => entry.path !== files[i] || typeof entry.body !== 'string' || crypto.createHash('sha256').update(entry.body).digest('hex') !== entry.sha256))
        throw new Error('Shipped AI knowledge integrity failed');
    console.log('Verified shipped canonical AI knowledge; source-only skills are not required on release installs');
    process.exit(0);
}
const entries = files.map(file => { const body = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n'); return { path: file, sha256: crypto.createHash('sha256').update(body).digest('hex'), body }; }), text = JSON.stringify({ version: 1, entries }, null, 2) + '\n', target = path.join(root, 'src/modules/ai/domain/engineering-knowledge.generated.json');
if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8').replaceAll('\r\n', '\n') !== text)
        throw new Error('AI knowledge bundle is stale; run scripts/generate-ai-knowledge.cjs');
}
else
    fs.writeFileSync(target, text);
console.log(`AI engineering knowledge: ${entries.length} canonical documents`);

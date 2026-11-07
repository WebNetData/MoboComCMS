const p = require('./protocol.cjs'), w = require('./workspace.cjs'), { fs, path, TOOLS, check, state, writeState, git } = p;
async function github(c, route, method = 'GET', body) { const token = fs.readFileSync(c.tokenFile, 'utf8').trim(); check(token.length > 10, 'Missing restricted GitHub credential'); const response = await fetch('https://api.github.com/repos/' + c.repository + route, { method, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000), redirect: 'error' }); check(response.ok, 'GitHub request failed (' + response.status + '); credential/branch must be checked by operator'); return response.status === 204 ? null : response.json(); }
function publicSummary(row) {
    return 'Scoped source changes in ' + [...new Set(row.changed.map(file => file.split('/').slice(0, 3).join('/')))].slice(0, 5).join(', ');
}
function finalizeKnowledge(c, row) {
    const dir = w.source(row.id), relative = 'src/modules/ai/domain/engineering-knowledge.generated.json';
    p.command('/usr/bin/node', [path.join(TOOLS, 'generate-ai-knowledge.cjs'), '--root', dir]);
    const knowledgeSha = p.hash(fs.readFileSync(path.join(dir, relative)));
    row.validatedArtifact ||= row.artifact;
    row.knowledgeSha = knowledgeSha;
    w.docker(['run', '--rm', '--network', 'none', '--user', '1000:1000', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '128m', '--cpus', '0.5', '--mount', 'type=volume,source=' + row.volume + ',target=/artifact', '--mount', 'type=bind,source=' + path.join(dir, relative) + ',target=/input/knowledge.json,readonly', '--entrypoint', 'node', c.dependencyImage, '-e', "require('fs').copyFileSync('/input/knowledge.json','/artifact/src/modules/ai/domain/engineering-knowledge.generated.json')"]);
    row.artifact = require('./artifact.cjs').artifactDigest(c, row);
    const report = path.join(dir, 'docs/agent/handoffs/AI_RUN_' + row.id + '.md');
    fs.writeFileSync(report, fs.readFileSync(report, 'utf8').replace(row.validatedArtifact, row.artifact));
    writeState(row.id, row);
}
function architectureReceipt(row) {
    const dir = w.source(row.id), name = 'AI_RUN_' + row.id + '.md', relative = 'docs/agent/handoffs/' + name, summary = publicSummary(row), report = `# AI engineering run ${row.id}\n\nScope: ${summary}\n\nBase: ${row.baseSha}. Artifact: ${row.artifact}.\n\nChanged owner files:\n${row.changed.map(p => '- ' + p).join('\n')}\n\nExecuted isolated checks:\n${row.checks.map(c => '- ' + c.name + ': ' + (c.passed ? 'passed' : 'failed')).join('\n')}\n\nNo live data, secrets or host execution in the build. New empty PostgreSQL\nfixture only. Production promotion requires current owner approval and merge.\nCode rollback retains customer data; schema/dependency/host changes are outside\nthis automatic workflow. Inspect UI changes in the PR before approval.\n`;
    fs.writeFileSync(p.filePath(dir, relative, true), report);
    for (const file of ['docs/agent/ARCHITECTURE.md', 'docs/agent/MOBOCOM_MAP.md', 'docs/agent/CAPABILITY_LEDGER.md']) {
        const target = p.filePath(dir, file, true), old = fs.readFileSync(target, 'utf8'), link = `AI engineering ${row.id}: ${summary}. Isolated validation passed; production verification is separate. [Change and check receipt](handoffs/${name}).\n\n`;
        if (!old.includes(`AI engineering ${row.id}:`))
            fs.writeFileSync(target, link + old);
    }
}
async function publish(c, id) {
    const row = state(id);
    check(row && ['publishing', 'published'].includes(row.phase), 'Artifact is not ready for PR');
    if (row.phase === 'published')
        return w.publicReceipt(row);
    require('./deployment.cjs').approval(c, id, 'publish');
    check(row.artifact && row.checks.every(c => c.passed), 'Validation must pass before PR');
    const dir = w.source(id);
    if (!row.headSha) {
        if (!row.publicationPrepared) {
            check(p.hash(row.changed.map(name => name + '\0' + p.hash(fs.readFileSync(p.filePath(dir, name, true)))).join('\n')) === row.inputHash, 'Validated source changed');
            row.publicationPrepared = true;
            writeState(id, row);
        }
        architectureReceipt(row);
        finalizeKnowledge(c, row);
        git(dir, ['add', '--', 'src', 'docs', 'scripts']);
        git(dir, ['-c', 'user.name=MoboCom AI', '-c', 'user.email=ai-engineering@localhost.invalid', 'commit', '-m', 'feat(ai): staged engineering ' + id]);
        row.headSha = git(dir, ['rev-parse', 'HEAD']);
        row.treeSha = git(dir, ['rev-parse', 'HEAD^{tree}']);
        row.diffSummary = git(dir, ['diff', '--stat', row.baseSha, 'HEAD']).slice(0, 6000);
        writeState(id, row);
    }
    git(dir, ['push', 'origin', 'HEAD:refs/heads/ai/engineering-' + id]);
    const pulls = await github(c, '/pulls?state=all&head=' + encodeURIComponent(c.repository.split('/')[0] + ':ai/engineering-' + id) + '&base=main&per_page=10');
    let pr = pulls.find(pr => pr.head?.sha === row.headSha && pr.head?.repo?.full_name === c.repository);
    if (!pr) {
        require('./deployment.cjs').approval(c, id, 'publish');
        pr = await github(c, '/pulls', 'POST', { base: 'main', head: 'ai/engineering-' + id, title: 'MoboCom AI change ' + id.slice(0, 8), body: 'Private MoboCom engineering request.\n\n' + row.diffSummary + '\n\nIsolated checks/build passed; no production deployment or live data access.\nArtifact: `' + row.artifact + '`\n\nOwner reviews/merges and separately approves this exact artifact in the Server Panel. See `docs/agent/handoffs/AI_RUN_' + id + '.md` for changed owners, executed checks, limitations and code rollback. UI changes need visual review; this report does not claim an unexecuted browser test.' });
    }
    row.prNumber = pr.number;
    row.prUrl = pr.html_url;
    row.phase = 'published';
    writeState(id, row);
    return w.publicReceipt(row);
}
async function merged(c, row) { check(row.prNumber, 'PR must exist'); const pr = await github(c, '/pulls/' + row.prNumber); check(pr.merged_at && pr.base?.ref === 'main' && pr.head?.sha === row.headSha && pr.head?.repo?.full_name === c.repository, 'Owner must merge this exact PR before promotion'); git(w.source(row.id), ['fetch', '--depth', '1', 'origin', 'main']); check(git(w.source(row.id), ['rev-parse', 'FETCH_HEAD^{tree}']) === row.treeSha, 'Main changed after validation; create a fresh request against current main'); return true; }
module.exports = { github, publish, merged, architectureReceipt, publicSummary, finalizeKnowledge };

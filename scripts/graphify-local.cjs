/* Project-scoped, offline, source-only adapter to the official Graphify CLI. */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const local = path.join(root, '.mobocom', 'graphify');
const graph = path.join(local, 'graphify-out', 'graph.json');
const extensions = /\.(?:[cm]?[jt]sx?)$/i;
function python() {
  const r = cp.spawnSync('uv', ['tool', 'dir'], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error('uv tool dir failed');
  const p = path.join(r.stdout.trim(), 'graphifyy', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (!fs.existsSync(p)) throw new Error('Install the pinned graphifyy tool; see DEVSTACK Graphify');
  const v = cp.spawnSync(p, ['-c', 'from importlib.metadata import version; print(version("graphifyy"))'], { encoding: 'utf8', windowsHide: true });
  if (v.status !== 0 || v.stdout.trim() !== '0.9.84') throw new Error('Graphify version drift: expected 0.9.84');
  return p;
}
function run(args, label) {
  fs.mkdirSync(local, { recursive: true });
  const id = `${label}-${Date.now()}-${process.pid}`;
  const request = { cwd: root, args, log: path.join(local, `${id}.log`), result: path.join(local, `${id}.json`) };
  const file = path.join(local, `${id}.request.json`);
  fs.writeFileSync(file, JSON.stringify(request));
  const r = cp.spawnSync(python(), [path.join(root, 'tools/devstack/graphify-run.py'), file], { encoding: 'utf8', windowsHide: true, maxBuffer: 2e6 });
  if (r.status !== 0) throw new Error(`Graphify failed (${r.status}); inspect ${request.log}\n${r.stderr.slice(-1200)}`);
  const measured = JSON.parse(fs.readFileSync(request.result, 'utf8'));
  return measured;
}
function corpus() {
  const r = cp.spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'src'], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error('Cannot enumerate Git-visible source');
  return [...new Set(r.stdout.split('\0').filter(p => p && extensions.test(p)))].filter(p => {
    const parts = p.split('/');
    return !parts.some(x => /secret|credential|node_modules|__generated__/i.test(x)) && !/\.(?:min\.js|bak|tmp)$/i.test(p) && fs.existsSync(path.join(root, p));
  }).sort();
}
function sourceStamp() {
  const files = corpus();
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(path.join(root, '.graphifyignore')));
  // Git's exclusion result is included through the selected file list.
  for (const p of files) {
    const abs = path.join(root, p);
    if (fs.lstatSync(abs).isSymbolicLink()) throw new Error(`Source symlink refused: ${p}`);
    hash.update(p); hash.update(fs.readFileSync(abs));
  }
  return { hash: hash.digest('hex'), fileCount: files.length };
}
function readGraph() {
  if (!fs.existsSync(graph)) throw new Error('No graph: run refresh first');
  return JSON.parse(fs.readFileSync(graph, 'utf8'));
}
function verify() {
  const g = readGraph();
  const nodes = g.nodes || [], edges = g.links || g.edges || [];
  if (!nodes.length || !edges.length) throw new Error('Empty graph');
  const allowed = new Set(corpus());
  // Dynamic external imports are synthetic nodes: the module specifier is put
  // in source_file even though Graphify never read that package's source.
  const external = new Set(nodes.filter(n => n._origin === 'ast' && n.confidence === 'EXTRACTED'
    && n.source_file === n.label && !n.source_location && !fs.existsSync(path.resolve(root, n.source_file))
    && edges.some(e => e.target === n.id && ['imports_from', 'dynamic_import'].includes(e.relation) && allowed.has(e.source_file))).map(n => n.id));
  const sources = [...new Set(nodes.filter(n => !external.has(n.id)).flatMap(n => [n.source_file, ...(n.source_files || [])]).filter(Boolean))];
  for (const source of sources) {
    const relative = (path.isAbsolute(source) ? path.relative(root, source) : source).replaceAll('\\', '/');
    if (!allowed.has(relative)) throw new Error(`Out-of-corpus graph source: ${relative}`);
  }
  for (const source of Object.keys(JSON.parse(fs.readFileSync(path.join(local, 'graphify-out', 'manifest.json'), 'utf8')))) {
    if (!allowed.has(source.replaceAll('\\', '/'))) throw new Error(`Out-of-corpus indexed file: ${source}`);
  }
  if (g.input_tokens || g.output_tokens) throw new Error('Unexpected semantic token usage');
  return { nodes: nodes.length, edges: edges.length, sourceFiles: sources.length,
    graphBytes: fs.statSync(graph).size, externalImportNodes: external.size, semanticTokens: 0 };
}
function refresh() {
  fs.mkdirSync(local, { recursive: true });
  const lock = path.join(local, 'refresh.lock');
  let fd;
  try { fd = fs.openSync(lock, 'wx'); } catch { throw new Error('Graph refresh already locked; inspect the owning process before removing a stale lock'); }
  try {
  fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
  const stamp = sourceStamp(), statePath = path.join(local, 'state.json');
  const old = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : null;
  if (old?.hash === stamp.hash && fs.existsSync(graph)) return { skipped: true, reason: 'Source and ignore selection unchanged', ...verify() };
  const incremental = fs.existsSync(graph);
  // Repeated extract is the supported manifest-based incremental path. No update/watch hooks.
  const result = run(['extract', root, '--code-only', '--no-cluster', '--no-dedup', '--max-workers', '2', '--out', local], 'refresh');
  const verified = verify();
  fs.writeFileSync(statePath, JSON.stringify({ ...stamp, updated: new Date().toISOString(), incremental, result, verified }, null, 2));
  return { incremental, ...result, ...verified };
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  let result;
  if (command === 'refresh' && !rest.length) result = refresh();
  else if (command === 'verify' && !rest.length) result = verify();
  else if (command === 'status' && !rest.length) result = { version: '0.9.84', exists: fs.existsSync(graph), current: fs.existsSync(path.join(local, 'state.json')) && JSON.parse(fs.readFileSync(path.join(local, 'state.json'), 'utf8')).hash === sourceStamp().hash };
  else if (['query', 'path', 'affected'].includes(command)) {
    if (rest.length !== (command === 'path' ? 2 : 1) || rest.some(x => x.startsWith('-'))) throw new Error('Supply one query/symbol, or two path symbols');
    verify();
    const stateFile = path.join(local, 'state.json');
    if (!fs.existsSync(stateFile) || JSON.parse(fs.readFileSync(stateFile, 'utf8')).hash !== sourceStamp().hash) throw new Error('Graph is stale: run refresh before querying');
    result = run([command, ...rest, '--graph', graph, ...(command === 'query' ? ['--budget', '1500'] : command === 'affected' ? ['--depth', '2'] : [])], command);
    const text = fs.readFileSync(result.log, 'utf8');
    console.log(text.slice(0, 8000));
    if (text.length > 8000) console.log(`Output capped at 8000 characters; full local result: ${result.log}`);
  } else throw new Error('Usage: node scripts/graphify-local.cjs refresh|status|verify|query <text>|path <from> <to>|affected <symbol>');
  console.log(JSON.stringify(result));
  return result;
}
if (require.main === module) { try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { root, local, graph, run, corpus, sourceStamp, readGraph, verify, refresh };

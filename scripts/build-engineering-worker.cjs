const path = require('node:path'), root = path.resolve(__dirname, '..'), compiler = require('next/dist/compiled/webpack/webpack');
if (typeof compiler.init === 'function')
    compiler.init();
const ready = require('next/dist/compiled/webpack/webpack'), webpack = ready.webpack || ready.default?.webpack || ready.default;
if (typeof webpack !== 'function')
    throw new Error('Installed webpack compiler is unavailable');
const output = process.argv[2];
if (!output || !path.isAbsolute(output))
    throw new Error('Pass an absolute private build-output directory');
webpack({ mode: 'production', target: 'node22', entry: path.join(root, 'scripts/engineering/worker-entry.ts'), output: { path: output, filename: 'worker.cjs', library: { type: 'commonjs2' } }, resolve: { extensions: ['.ts', '.tsx', '.mjs', '.js', '.json'], alias: { '@': path.join(root, 'src') } }, externals: [({ request }, callback) => request && !request.startsWith('.') && !request.startsWith('@/') && !path.isAbsolute(request) ? callback(null, 'commonjs ' + request) : callback()], module: { rules: [{ test: /\.tsx?$/, use: [{ loader: path.join(root, 'scripts/engineering/transpile-loader.cjs') }] }] }, optimization: { minimize: false }, devtool: false }, (error, stats) => {
    if (error || stats.hasErrors()) {
        console.error(error?.message || stats.toString({ all: false, errors: true }));
        process.exitCode = 1;
    }
    else
        console.log('Built independent engineering worker from canonical owners');
});

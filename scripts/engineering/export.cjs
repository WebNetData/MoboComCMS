// Fixed byte copy only. No source module is loaded or executed.
const fs = require('node:fs'), path = require('node:path');
if (require.main === module) {
    const source = '/artifact', target = '/target';
    fs.cpSync(source, target, { recursive: true, dereference: false, verbatimSymlinks: true, filter(file) {
            const key = path.relative(source, file).split(path.sep).join('/');
            return key !== 'storage' && !key.startsWith('storage/') && key !== 'public/uploads' && !key.startsWith('public/uploads/') && key !== '.next/cache' && !key.startsWith('.next/cache/');
        } });
}

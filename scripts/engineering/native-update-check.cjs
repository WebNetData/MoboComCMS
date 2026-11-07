const fs = require('node:fs');
try {
    if (JSON.parse(fs.readFileSync('/run/mobocom-engineering/active.json', 'utf8')).id !== 'native') {
        console.error('Active blue/green runtime: use the Engineering panel or switch back before native update/migrations.');
        process.exitCode = 3;
    }
}
catch (e) {
    if (e.code !== 'ENOENT') {
        console.error('Runtime ownership cannot be verified; update refused.');
        process.exitCode = 3;
    }
}

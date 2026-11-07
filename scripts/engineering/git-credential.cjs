#!/usr/bin/env node
const fs = require('node:fs');
if (process.getuid() !== 0 || process.argv[2] !== 'get')
    process.exit(0);
const c = JSON.parse(fs.readFileSync('/etc/mobocom/engineering.json', 'utf8')), input = fs.readFileSync(0, 'utf8');
const fields = Object.fromEntries(input.trim().split('\n').map(l => { const at = l.indexOf('='); return [l.slice(0, at), l.slice(at + 1)]; }));
if (fields.protocol !== 'https' || fields.host !== 'github.com' || ![c.repository, c.repository + '.git'].includes(fields.path))
    process.exit(1);
process.stdout.write('username=x-access-token\npassword=' + fs.readFileSync(c.tokenFile, 'utf8').trim() + '\n\n');

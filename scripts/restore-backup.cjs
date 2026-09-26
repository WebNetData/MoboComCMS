// Only restores to a newly created, randomly named temporary database, then drops it.
const path = require('node:path')
const {restoreTest} = require('./backup-core.cjs')
const file = process.argv[2]
if(!file)throw Error('Usage: node --env-file=.env scripts/restore-backup.cjs path/to/backup.dump.enc')
restoreTest(path.resolve(file)).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('RESTORE_TEST_FAILED');process.exitCode=1})

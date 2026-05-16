const { existsSync } = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const rootDir = process.cwd()
const protoDir = path.join(rootDir, 'proto')
const protoNodeModulesPath = path.join(protoDir, 'node_modules', 'protobufjs-cli')

if (!existsSync(protoNodeModulesPath)) {
    console.log('proto generation deps not installed in proto/, running npm install --prefix proto')
    runNpm(['--prefix', protoDir, 'install'])
}

runNpm(['--prefix', protoDir, 'run', 'generate'])

function runNpm(args) {
    const npmExecPath = process.env.npm_execpath
    const result = npmExecPath
        ? spawnSync(process.execPath, [npmExecPath, ...args], {
              cwd: rootDir,
              stdio: 'inherit',
              timeout: 120_000
          })
        : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
              cwd: rootDir,
              stdio: 'inherit',
              shell: true,
              timeout: 120_000
          })

    if (result.status !== 0) {
        process.exit(result.status ?? 1)
    }
}

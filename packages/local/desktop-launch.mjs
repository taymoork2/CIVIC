import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
if (!process.env.CIVIC_ELECTRON_BINARY) throw Error('Set CIVIC_ELECTRON_BINARY to an installed Electron binary. Start the CIVIC server separately.')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(env.CIVIC_ELECTRON_BINARY, [fileURLToPath(new URL('desktop.mjs', import.meta.url))], { env, stdio: 'inherit' })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })

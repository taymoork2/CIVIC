import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(env.CIVIC_ELECTRON_BINARY || electron, [fileURLToPath(new URL('desktop.mjs', import.meta.url))], { env, stdio: 'inherit' })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })

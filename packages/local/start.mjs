import { spawn } from 'node:child_process'
import { mkdir, open, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import { store } from './store.mjs'

const here = dirname(fileURLToPath(import.meta.url))
await mkdir(store, { recursive: true, mode: 0o700 })
const config = await readFile(join(store, 'local-config.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return {}; throw error })
const port = Number(process.env.CIVIC_LOCAL_PORT ?? 3012)
if (!Number.isInteger(port) || port < 0 || port > 65535 || port > 0 && port < 1024 || process.env.CIVIC_LOCAL_STORE && port === 3012 || !process.argv.includes('--serve') && port === 0) throw Error('An isolated store needs its own valid port')
if (process.argv.includes('--serve')) {
  const { createServer } = await import('vite')
  process.env.CIVIC_STORE = store
  const server = await createServer({ configFile: config.hostConfig ?? join(here, 'vite.config.mjs'), cacheDir: join(store, '.vite'), server: { host: '127.0.0.1', port, strictPort: true } })
  await server.listen(); server.printUrls()
  process.once('SIGTERM', () => void server.close().finally(() => process.exit()))
} else {
  const probe = createServer()
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve) })
  await new Promise(resolve => probe.close(resolve))
  const log = await open(join(store, 'server.log'), 'a', 0o600)
  const env = { ...process.env, CIVIC_STORE: store, CIVIC_PUBLIC_ORIGIN: config.origin ?? '' }
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--serve'], { detached: true, stdio: ['ignore', log.fd, log.fd], env })
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
  child.unref(); await log.close()
  await writeFile(join(store, 'runtime.json'), JSON.stringify({ pid: child.pid, port, origin: config.origin, startedAt: new Date().toISOString() }, null, 2), { mode: 0o600 })
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (await fetch(`http://127.0.0.1:${port}/review`, { signal: AbortSignal.timeout(2000) }).then(response => response.ok).catch(() => false)) { console.log(`CIVIC http://127.0.0.1:${port}/review\nPID ${child.pid}; logs ${join(store, 'server.log')}`); process.exit(0) }
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw Error(`Startup failed; inspect ${join(store, 'server.log')}`)
}

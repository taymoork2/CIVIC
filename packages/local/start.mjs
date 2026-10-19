import { spawn } from 'node:child_process'
import { open, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import { store } from './onboard.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const config = JSON.parse(await readFile(join(store, 'local-config.json'), 'utf8'))
const port = Number(process.env.CIVIC_LOCAL_PORT ?? 3012)
if (!Number.isInteger(port) || port < 1024 || port > 65535 || process.env.CIVIC_LOCAL_STORE && port === 3012) throw Error('An isolated store needs its own valid port')
if (process.argv.includes('--serve')) {
  const { createServer } = await import('vite')
  const server = await createServer({ configFile: join(here, 'vite.config.mjs'), root: join(config.laundry, 'apps/web'), cacheDir: join(store, '.vite') })
  await server.listen(); server.printUrls()
} else {
  const probe = createServer()
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve) })
  await new Promise(resolve => probe.close(resolve))
  const log = await open(join(store, 'server.log'), 'a', 0o600)
  const env = { ...process.env, CIVIC_STORE: store, CIVIC_PUBLIC_ORIGIN: config.origin ?? '', AMP_ORB: '', PUBLIC_URL: '', VITE_CONVEX_URL: 'http://127.0.0.1:1', VITE_CONVEX_SITE_URL: 'http://127.0.0.1:1' }
  delete env.CIVIC_PROJECT; delete env.CIVIC_APP_ROOT
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

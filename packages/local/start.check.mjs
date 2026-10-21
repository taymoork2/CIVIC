import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

test('an explicitly configured missing integration reports its path instead of loading a private default', async () => {
  const store = await mkdtemp(join(tmpdir(), 'civic-missing-host-')), missing = join(store, 'missing-integration.mjs')
  await writeFile(join(store, 'local-config.json'), JSON.stringify({ hostConfig: missing }))
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./start.mjs', import.meta.url)), '--serve'], { env: { ...process.env, CIVIC_LOCAL_STORE: store, CIVIC_LOCAL_PORT: '0' }, encoding: 'utf8', timeout: 10000 })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /missing-integration\.mjs/)
})

test('generic startup accepts a manifest without a private integration or local configuration', { timeout: 25000 }, async () => {
  const store = await mkdtemp(join(tmpdir(), 'civic-generic-host-'))
  const child = spawn(process.execPath, [fileURLToPath(new URL('./start.mjs', import.meta.url)), '--serve'], {
    env: { ...process.env, CIVIC_LOCAL_STORE: store, CIVIC_LOCAL_PORT: '0', CIVIC_PROJECT: fileURLToPath(new URL('../canvas/examples/notebook/civic.project.json', import.meta.url)) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  try {
    const origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Startup timed out: ' + output)), 20000)
      child.once('exit', code => { clearTimeout(timer); reject(Error(`Startup exited ${code}: ${output}`)) })
      for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
        output += chunk
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/)
        if (match) { clearTimeout(timer); resolve(match[0]) }
      })
    })
    assert.equal((await fetch(origin + '/review')).status, 200)
  } finally {
    child.kill('SIGTERM')
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve))
  }
})

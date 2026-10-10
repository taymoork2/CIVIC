import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

test('flow seeding refuses remote or mismatched deployment targets before touching accounts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'flow-target-check-'))
  const env = join(directory, 'target.env')
  for (const [app, deployment, backend] of [
    ['https://example.com', 'anonymous:anonymous-agent', 'http://127.0.0.1:3220'],
    ['http://127.0.0.1:3038', 'prod:real-household', 'http://127.0.0.1:3258'],
    ['http://127.0.0.1:3038', 'anonymous:anonymous-agent', 'https://example.com'],
    ['https://macbook-pro.tail221f42.ts.net', 'anonymous:anonymous-agent', 'http://127.0.0.1:3258'],
  ]) {
    await writeFile(env, `CONVEX_DEPLOYMENT=${deployment}\nVITE_CONVEX_URL=${backend}\n`)
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./flow-test-account.mjs', import.meta.url)), app, '--env-file', env], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Flow testing requires an explicitly selected anonymous local backend/)
  }
})

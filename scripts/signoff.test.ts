import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../tools/signoff/src/config.ts'
import { isSignoffProcess } from './signoff.ts'

test('matches actual sign-off script processes, not snippets or lookalikes', () => {
  for (const command of ['bash /repo/bin/signoff --no-post', '/bin/bash bin/signoff', 'node /repo/scripts/signoff.ts', '/opt/bin/node scripts/signoff.ts --fresh', 'bash "/repo with spaces/bin/signoff"', '/opt/node -e import("/orca/scripts/signoff.ts").then((m) => m.signoff("/x"))']) assert.equal(isSignoffProcess(command), true, command)
  for (const command of ['bash -c "node /repo/scripts/signoff.ts"', 'node -e "bash /repo/bin/signoff"', 'rg bash /repo/bin/signoff', 'node /repo/scripts/signoff.ts.test', 'bash /repo/bin/signoff-other', 'bash /repo/notbin/signoff', 'civic-signoff-waiting']) assert.equal(isSignoffProcess(command), false, command)
})

test('the manifest keeps the existing checks and typed commit guard', () => {
  const config = loadConfig(readFileSync(new URL('../.signoff.json', import.meta.url), 'utf8'))
  assert.equal(config.typedCommits, true)
  assert.deepEqual(config.checks.map(check => [check.cwd, ...check.argv]), [
    ['packages', 'pnpm', 'install', '--frozen-lockfile'],
    ['packages', 'pnpm', 'run', 'check'],
    ['packages', 'pnpm', 'test'],
    ['packages', 'pnpm', '--filter', '@civic/graph', 'run', 'validate'],
    ...['demo/fluent-button', 'demo/card', 'demo/rebrand', 'projects/discovery-app'].map(dir => ['.', 'node', `${dir}/build.ts`, '--check']),
    ...['gate', 'release', 'browser'].map(name => ['.', 'node', 'scripts/signoff.ts', '--step', name]),
    ['.', 'node', 'packages/install.check.mjs'],
  ])
})

test('dry run explains optional steps and refuses posting', () => {
  const adapter = fileURLToPath(new URL('./signoff.ts', import.meta.url))
  const result = spawnSync(process.execPath, [adapter, '--dry-run', '--browser'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /browser \(enabled\)/u)
  assert.match(result.stdout, /exit 1 is reported/u)
  assert.match(result.stdout, /with-temp-root\.mjs/u)
  const post = spawnSync(process.execPath, [adapter, '--dry-run', '--post'], { encoding: 'utf8' })
  assert.equal(post.status, 1)
  assert.match(post.stderr, /Posting requires/u)
})

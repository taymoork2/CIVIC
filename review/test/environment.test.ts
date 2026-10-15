import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { before, test } from 'node:test'
import { resolveLens, validateGraph, type Environment, type Line } from '../../graph/src/index.ts'
import { readCheckout, run, Store } from '../src/index.ts'

// Decision 0013, point 3: library releases are lines, and an Environment record says which
// revision of which line runs on staging or production, so a story can be read through a lens.

const root = mkdtempSync(join(tmpdir(), 'civic-environment-'))
const sh = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const env = { ...process.env, CIVIC_AGENT: undefined, CIVIC_FOR: undefined, CIVIC_PERSON: 'taymoor' }

async function civic(...args: string[]): Promise<string> {
  const out: string[] = []
  assert.equal(await run(args, root, env, (text) => out.push(text)), 0)
  return out.join('\n')
}

const records = () => Store.forCommonDir(readCheckout(root).commonDir).read()

before(() => {
  sh('init', '-q', '-b', 'main')
  sh('config', 'user.email', 'taymoor@example.com')
  sh('config', 'user.name', 'Taymoor')
  sh('commit', '-q', '--allow-empty', '-m', 'start')
})

test('a library release is a line released from main, at its version', async () => {
  assert.equal(await civic('release-line', '@fluentui/react-components@9.74.9'), 'line:npm.release.fluentui.react-components.9.74.9 at 9.74.9, released from line:git.main')
  const line = records().records.find((record): record is Line => record.id === 'line:npm.release.fluentui.react-components.9.74.9')!
  assert.deepEqual(line, { id: line.id, kind: 'line', title: '@fluentui/react-components@9.74.9', type: 'release', tool: 'npm', ref: '@fluentui/react-components@9.74.9', base: 'line:git.main', head: '9.74.9', status: 'open' })
})

test('an environment records which revision of each line runs there, keeping its newest observation per line', async () => {
  const first = sh('rev-parse', 'HEAD')
  assert.equal(await civic('environment', 'staging', '--runs', 'line:git.main', '--url', 'https://staging.example.com/app', '--canvas'), `environment:staging at https://staging.example.com runs line:git.main at ${first.slice(0, 12)}`)
  sh('commit', '-q', '--allow-empty', '-m', 'next')
  await civic('environment', 'staging', '--runs', `line:git.main@${first}`, '--runs', 'line:npm.release.fluentui.react-components.9.74.9')
  const staging = records().records.find((record): record is Environment => record.id === 'environment:staging')!
  assert.deepEqual(staging.runs.map((run) => [run.line, run.revision]), [['line:git.main', first], ['line:npm.release.fluentui.react-components.9.74.9', '9.74.9']])
  assert.equal(staging.canvas, true)
  assert.deepEqual(validateGraph(records()).filter((issue) => issue.severity === 'error'), [])

  // Main has moved on, so staging runs it behind its head; the lens can say so.
  const lens = resolveLens(records().records, { code: 'line:git.main', environment: 'environment:staging' })
  assert.equal(lens.query, 'code=line:git.main&environment=environment:staging')
  assert.notEqual(lens.code!.head, staging.runs[0]!.revision)
})

test('an environment names lines the store knows', async () => {
  await assert.rejects(civic('environment', 'production', '--runs', 'line:git.nowhere'), /No line line:git\.nowhere/)
  assert.ok(!records().records.some((record) => record.id === 'environment:production'))
})

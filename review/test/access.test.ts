import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { before, test } from 'node:test'
import { validateGraph, type WorkRequest } from '../../graph/src/index.ts'
import { parseAccess, readCheckout, run, Store } from '../src/index.ts'

// Roadmap step 5: writes carry expected versions, so a stale view never overwrites, and
// who may read, write, approve and resolve comes from a reviewed file on the default branch.

const root = mkdtempSync(join(tmpdir(), 'civic-access-'))
const main = join(root, 'app')
const worktree = join(root, 'app-fix')
const taymoor = { CIVIC_PERSON: 'taymoor' }
const sam = { CIVIC_PERSON: 'sam' }
const agentForSam = { CIVIC_AGENT: 'codex', CIVIC_FOR: 'sam' }
const agent = { CIVIC_AGENT: 'claude-code', CIVIC_FOR: 'taymoor' }

const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

async function civic(cwd: string, who: Record<string, string>, ...args: string[]): Promise<string> {
  const out: string[] = []
  const env: NodeJS.ProcessEnv = { ...process.env, CIVIC_AGENT: undefined, CIVIC_FOR: undefined, CIVIC_PERSON: undefined, ...who }
  const code = await run(args, cwd, env, (text) => out.push(text))
  assert.equal(code, 0)
  return out.join('\n')
}

const refused = (cwd: string, who: Record<string, string>, ...args: string[]) =>
  run(args, cwd, { ...process.env, CIVIC_AGENT: undefined, CIVIC_FOR: undefined, CIVIC_PERSON: undefined, ...who }, () => {})

const records = () => Store.forCheckout(readCheckout(main)).read()
const request = (id: string) => records().records.find((record): record is WorkRequest => record.id === id)!

before(() => {
  execFileSync('mkdir', ['-p', main])
  sh(root, 'init', '-q', '-b', 'main', main)
  sh(main, 'config', 'user.email', 'taymoor@example.com')
  sh(main, 'config', 'user.name', 'Taymoor')
  writeFileSync(join(main, 'README.md'), 'app\n')
  sh(main, 'add', '.')
  sh(main, 'commit', '-q', '-m', 'app')
  sh(main, 'worktree', 'add', '-q', '-b', 'fix/label', worktree)
})

test('a write based on an older version is refused, names the change, and writes nothing', async () => {
  const annotation = (await civic(main, taymoor, 'annotate', 'The label clips.', '--target', 'target:app.form')).split(' ')[0]!
  const id = (await civic(main, taymoor, 'request', annotation, '--ask', 'Let the label wrap.')).split(' ')[0]!
  const short = id.slice('request:'.length, 'request:'.length + 8)
  assert.equal(request(id).version, 1)
  assert.match(await civic(main, taymoor, 'requests'), new RegExp(`^${short}@1 `, 'm'))

  // Taymoor reads it at version 1; meanwhile an agent claims it and reports a fix.
  await civic(worktree, agent, 'claim', `${short}@1`)
  await civic(worktree, agent, 'report-fix', short, '--note', 'Wraps now.')
  assert.equal(request(id).version, 3)
  assert.deepEqual(request(id).changed, { by: 'actor:agent.claude-code.taymoor', at: request(id).changed!.at, what: 'report-fix' })

  // Taymoor's resolve, based on what he saw at version 1, is refused and the store is unchanged.
  const before = JSON.stringify(records())
  await assert.rejects(refused(main, taymoor, 'resolve', `${short}@1`, '--note', 'Not needed.'), /is at version 3, not 1: report-fix by actor:agent\.claude-code\.taymoor at .+ Nothing was written\. .+ retry with [0-9a-f]{8}@3\./)
  assert.equal(JSON.stringify(records()), before)
  assert.match(await civic(main, taymoor, 'show', short), /version 3 \(last change: report-fix by actor:agent\.claude-code\.taymoor/)

  // Read again, resolve at the current version.
  await civic(main, taymoor, 'resolve', `${short}@3`)
  assert.equal(request(id).status, 'resolved')
  assert.equal(request(id).version, 4)
  assert.deepEqual(validateGraph(records()).filter((issue) => issue.severity === 'error'), [])
})

test('without civic.access.json everyone has every scope', async () => {
  assert.match(await civic(main, sam, 'whoami'), /Scopes: read, write, approve, resolve \(no civic\.access\.json on main, so every scope\)/)
})

test('scopes come from civic.access.json on the default branch, and agents have their person\'s', async () => {
  const annotation = (await civic(main, taymoor, 'annotate', 'The total is wrong.', '--target', 'target:app.total')).split(' ')[0]!
  const id = (await civic(main, taymoor, 'request', annotation, '--ask', 'Fix the total.')).split(' ')[0]!

  // An uncommitted policy, or one only on a worktree's branch, grants and takes nothing.
  writeFileSync(join(worktree, 'civic.access.json'), JSON.stringify({ people: { sam: [] }, others: [] }))
  sh(worktree, 'add', '.')
  sh(worktree, 'commit', '-q', '-m', 'lock everyone out')
  assert.match(await civic(worktree, sam, 'whoami'), /Scopes: read, write, approve, resolve/)

  writeFileSync(join(main, 'civic.access.json'), JSON.stringify({ people: { taymoor: ['read', 'write', 'approve', 'resolve'], sam: ['read', 'write'] }, others: ['read'] }, null, 2))
  sh(main, 'add', '.')
  sh(main, 'commit', '-q', '-m', 'access')

  assert.match(await civic(worktree, sam, 'whoami'), /Scopes: read, write \(civic\.access\.json on main\)/)
  assert.match(await civic(main, { CIVIC_PERSON: 'visitor' }, 'requests'), /Fix the total\./)
  await assert.rejects(refused(main, { CIVIC_PERSON: 'visitor' }, 'annotate', 'Me too.'), /visitor can't annotate: civic\.access\.json on the default branch doesn't give visitor the write scope\./)

  // Sam's agent works the request, but neither Sam nor the agent can resolve or accept checks.
  await civic(worktree, agentForSam, 'claim', id)
  await civic(worktree, agentForSam, 'add-check', id, 'npm test')
  await civic(worktree, agentForSam, 'report-fix', id)
  await assert.rejects(refused(main, sam, 'accept-check', id, '1'), /sam can't accept check: .+ the approve scope/)
  await assert.rejects(refused(main, sam, 'resolve', id), /sam can't resolve work requests: .+ the resolve scope/)
  await assert.rejects(refused(worktree, agentForSam, 'reopen', id, '--note', 'again'), /codex for sam can't reopen: .+ give sam the resolve scope/)

  await civic(main, taymoor, 'accept-check', id, '1')
  await civic(main, taymoor, 'resolve', id)
  assert.equal(request(id).status, 'resolved')
})

test('a malformed policy is refused with what to fix', () => {
  assert.throws(() => parseAccess('{"people":{"sam":["admin"]}}'), /people\.sam is a list of scopes from read, write, approve, resolve/)
  assert.throws(() => parseAccess('not json'), /isn't valid JSON/)
  assert.deepEqual(parseAccess('{"people":{"sam":["read"]}}'), { people: { sam: ['read'] }, others: ['read'], keys: {} })
})

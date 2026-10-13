import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { before, test } from 'node:test'
import { validateGraph, type GraphDocument, type WorkRequest } from '../../graph/src/index.ts'
import { GitRefRemote, readCheckout, run, Store, UntrustedChangeError } from '../src/index.ts'

// Roadmap step 5: two people, each with their own clone and local store, share records
// through a git ref on the repository's remote. Nothing is silently overwritten, and a sync
// that claims more than its person may is refused.

const root = mkdtempSync(join(tmpdir(), 'civic-sync-'))
const origin = join(root, 'origin.git')
const mine = join(root, 'taymoor')
const theirs = join(root, 'sam')
const taymoor = { CIVIC_PERSON: 'taymoor' }
const sam = { CIVIC_PERSON: 'sam' }
const samsAgent = { CIVIC_AGENT: 'codex', CIVIC_FOR: 'sam' }

const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

async function civic(cwd: string, who: Record<string, string>, ...args: string[]): Promise<string> {
  const out: string[] = []
  const code = await run(args, cwd, { ...process.env, CIVIC_AGENT: undefined, CIVIC_FOR: undefined, CIVIC_PERSON: undefined, ...who }, (text) => out.push(text))
  assert.equal(code, 0)
  return out.join('\n')
}

const storeOf = (checkout: string) => Store.forCommonDir(readCheckout(checkout).commonDir)
const requestIn = (checkout: string, id: string) => storeOf(checkout).read().records.find((record): record is WorkRequest => record.id === id)!

before(() => {
  sh(root, 'init', '-q', '--bare', '-b', 'main', origin)
  sh(root, 'clone', '-q', origin, mine)
  sh(mine, 'config', 'user.email', 'taymoor@example.com')
  sh(mine, 'config', 'user.name', 'Taymoor')
  writeFileSync(join(mine, 'civic.access.json'), JSON.stringify({ people: { taymoor: ['read', 'write', 'approve', 'resolve'], sam: ['read', 'write'] }, others: ['read'] }))
  sh(mine, 'add', '.')
  sh(mine, 'commit', '-q', '-m', 'access')
  sh(mine, 'push', '-q', 'origin', 'main')
  sh(root, 'clone', '-q', origin, theirs)
  sh(theirs, 'config', 'user.email', 'sam@example.com')
  sh(theirs, 'config', 'user.name', 'Sam')
})

let requestId = ''
let short = ''

test('a request asked for in one clone is worked in another and comes back fixed, with its capture', async () => {
  assert.match(await civic(mine, taymoor, 'sync'), /Nothing to share with origin refs\/civic\/records yet\./)
  writeFileSync(join(root, 'shot.png'), 'not really a png, but bytes all the same')
  const annotation = (await civic(mine, taymoor, 'annotate', 'The receipt total is wrong.', '--image', join(root, 'shot.png'))).split(' ')[0]!
  requestId = (await civic(mine, taymoor, 'request', annotation, '--ask', 'Fix the total.')).split(' ')[0]!
  short = requestId.slice('request:'.length, 'request:'.length + 8)
  assert.match(await civic(mine, taymoor, 'sync'), /In sync with origin refs\/civic\/records at [0-9a-f]{12}: 0 record\(s\) from others, \d+ shared\./)

  // Sam shares one record back: his own actor, which his later changes name.
  assert.match(await civic(theirs, sam, 'sync'), /: \d+ record\(s\) from others, 1 shared\./)
  assert.match(await civic(theirs, sam, 'requests'), /Fix the total\./)
  const capture = storeOf(mine).captureNames()
  assert.equal(capture.length, 1)
  assert.deepEqual(storeOf(theirs).captureNames(), capture, 'the frozen capture came along')

  await civic(theirs, samsAgent, 'claim', short)
  await civic(theirs, samsAgent, 'report-fix', short, '--note', 'Totals add tax once.')
  await civic(theirs, sam, 'sync')
  await civic(mine, taymoor, 'sync')
  assert.equal(requestIn(mine, requestId).status, 'fix-ready')
  assert.equal(requestIn(mine, requestId).changed?.by, 'actor:agent.codex.sam')
  assert.deepEqual(validateGraph(storeOf(mine).read()).filter((issue) => issue.severity === 'error'), [])
})

test('two people commenting at once both keep their comments', async () => {
  await civic(mine, taymoor, 'comment', short, 'Check the refund screen too.')
  await civic(theirs, sam, 'comment', short, 'Refunds use the same total.')
  await civic(theirs, sam, 'sync')
  assert.doesNotMatch(await civic(mine, taymoor, 'sync'), /Conflict/)
  await civic(theirs, sam, 'sync')
  for (const checkout of [mine, theirs]) {
    assert.deepEqual(requestIn(checkout, requestId).comments.map((comment) => comment.text), ['Check the refund screen too.', 'Refunds use the same total.'])
    assert.equal(requestIn(checkout, requestId).changed?.what, 'merge-comments')
  }
})

test('when both sides change a request otherwise, the shared one stays and yours is set aside until someone settles it', async () => {
  await civic(mine, taymoor, 'resolve', short)
  await civic(theirs, samsAgent, 'add-check', short, 'npm test')
  await civic(theirs, sam, 'sync')
  const out = await civic(mine, taymoor, 'sync')
  assert.match(out, new RegExp(`Conflict: ${requestId} changed here and on origin refs/civic/records\\. The shared version is kept; yours is set aside\\.`))
  assert.equal(requestIn(mine, requestId).status, 'fix-ready')
  assert.match(await civic(mine, taymoor, 'conflicts'), new RegExp(`${requestId}  work-request  set aside .+  yours: resolved, shared: fix-ready`))

  await civic(mine, taymoor, 'settle', short, '--keep', 'mine')
  assert.equal(await civic(mine, taymoor, 'conflicts'), 'No conflicts.')
  await civic(mine, taymoor, 'sync')
  await civic(theirs, sam, 'sync')
  assert.equal(requestIn(theirs, requestId).status, 'resolved')
  assert.equal(requestIn(theirs, requestId).changed?.what, 'keep-mine')
})

test("a replay of a recorded run, kept in one clone with its tape, reaches the other through sync (decision 0009)", async () => {
  const tape = JSON.stringify({ version: 1, project: 'laundry-app-0123456789ab', steps: [{ gesture: 'click' }] })
  const sha = createHash('sha256').update(tape).digest('hex')
  const data = join(root, 'review-data')
  mkdirSync(join(data, 'replays', 'tapes'), { recursive: true })
  writeFileSync(join(data, 'replays', 'tapes', `${sha}.json`), tape)
  const replay = { schema: 'civic.replay/0', project: 'laundry-app-0123456789ab', scenario: 'app.drying.empty', head: 'a'.repeat(40), source: 'b'.repeat(64), tape: sha, steps: 1, outcome: 'pass', replayedAt: '2026-10-13T06:00:00.000Z' }
  writeFileSync(join(data, 'replays', '0c1d2e3f-0000-4000-8000-000000000000.json'), JSON.stringify(replay))

  assert.match(await civic(theirs, sam, 'share-replays', data), /^Kept 1 replay\(s\) to share\. civic sync shares them\.$/)
  assert.match(await civic(theirs, sam, 'share-replays', data), /Kept 0 replay\(s\) to share; 1 were already kept/)
  await civic(theirs, sam, 'sync')
  await civic(mine, taymoor, 'sync')
  assert.deepEqual(JSON.parse(await civic(mine, taymoor, 'replays', '--json')), [replay])
  assert.equal(Buffer.from(storeOf(mine).readTape(sha)!).toString('utf8'), tape)
  assert.match(await civic(mine, taymoor, 'replays', '--head', 'c'.repeat(40)), /^No replays kept\.$/)
})

test('a publish based on an older shared revision is refused, so two syncs never lose each other\'s records', () => {
  const remote = new GitRefRemote(theirs)
  const shared = remote.fetch()!
  const parent = sh(theirs, 'rev-parse', `${shared.revision}^`)
  assert.equal(remote.publish({ document: shared.document, captures: new Map(), actor: 'actor:person.sam', summary: 'stale' }, parent), 'moved')
})

test('a shared change its person may not make is refused, and nothing is merged', async () => {
  const remote = new GitRefRemote(theirs)
  const shared = remote.fetch()!
  const forged = structuredClone(shared.document) as GraphDocument
  const request = forged.records.find((record): record is WorkRequest => record.id === requestId)!
  request.status = 'reopened'
  request.history.push({ status: 'reopened', by: 'actor:person.sam', at: '2026-10-12T05:00:00Z', note: 'Not done.' })
  request.version = (request.version ?? 1) + 1
  request.changed = { by: 'actor:person.sam', at: '2026-10-12T05:00:00Z', what: 'reopen' }
  assert.notEqual(remote.publish({ document: forged, captures: new Map(), actor: 'actor:person.sam', summary: 'reopen it myself' }, shared.revision), 'moved')

  const before = JSON.stringify(storeOf(mine).read())
  await assert.rejects(run(['sync'], mine, { ...process.env, CIVIC_PERSON: 'taymoor' }, () => {}), (error: Error) => {
    assert.ok(error instanceof UntrustedChangeError)
    assert.match(error.message, new RegExp(`actor:person\\.sam changed ${requestId} \\(reopen\\) without the resolve scope\\.`))
    return true
  })
  assert.equal(JSON.stringify(storeOf(mine).read()), before)
  assert.ok(existsSync(join(readCheckout(mine).commonDir, 'civic', 'records.graph.json')))
})

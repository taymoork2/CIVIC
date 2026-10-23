import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { before, test } from 'node:test'
import type { GraphDocument, WorkRequest } from '../../graph/src/index.ts'
import { GitRefRemote, parseAccess, readCheckout, readKey, run, signedPayload, signPayload, Store, UntrustedChangeError } from '../src/index.ts'

// Roadmap step 5: once civic.access.json lists keys, a sync only counts when it is signed by
// a key listed for the person it names. The name in the trailer stops being a mere claim.

const root = mkdtempSync(join(tmpdir(), 'civic-signing-'))
const origin = join(root, 'origin.git')
const mine = join(root, 'taymoor')
const theirs = join(root, 'sam')
const taymoor = { CIVIC_PERSON: 'taymoor' }
const sam = { CIVIC_PERSON: 'sam' }
const keys = { taymoor: join(root, 'keys', 'taymoor.pem'), sam: join(root, 'keys', 'sam.pem') }

const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const env = (who: Record<string, string>): NodeJS.ProcessEnv => ({ ...process.env, CIVIC_AGENT: undefined, CIVIC_FOR: undefined, CIVIC_PERSON: undefined, CIVIC_SIGNING_KEY: undefined, ...who })

async function civic(cwd: string, who: Record<string, string>, ...args: string[]): Promise<string> {
  const out: string[] = []
  assert.equal(await run(args, cwd, env(who), (text) => out.push(text)), 0)
  return out.join('\n')
}

const publicKeyFrom = (output: string) => /"(ed25519:[A-Za-z0-9+/=]+)"/.exec(output)![1]!

let requestId = ''

before(async () => {
  sh(root, 'init', '-q', '--bare', '-b', 'main', origin)
  sh(root, 'clone', '-q', origin, mine)
  sh(mine, 'config', 'user.email', 'taymoor@example.com')
  sh(mine, 'config', 'user.name', 'Taymoor')
  sh(mine, 'commit', '-q', '--allow-empty', '-m', 'start')
  sh(mine, 'push', '-q', 'origin', 'main')
  sh(root, 'clone', '-q', origin, theirs)
  sh(theirs, 'config', 'user.email', 'sam@example.com')
  sh(theirs, 'config', 'user.name', 'Sam')

  const taymoorKey = publicKeyFrom(await civic(mine, taymoor, 'keygen', '--out', keys.taymoor))
  const samKey = publicKeyFrom(await civic(theirs, sam, 'keygen', '--out', keys.sam))
  writeFileSync(join(mine, 'civic.access.json'), JSON.stringify({
    people: { taymoor: ['read', 'write', 'approve', 'resolve'], sam: ['read', 'write'] },
    others: ['read'],
    keys: { taymoor: [taymoorKey], sam: [samKey] },
  }, null, 2))
  sh(mine, 'add', '.')
  sh(mine, 'commit', '-q', '-m', 'access with keys')
  sh(mine, 'push', '-q', 'origin', 'main')
  sh(theirs, 'pull', '-q', '--ff-only')
})

test('civic keygen keeps the private key private and points the repository at it', () => {
  assert.equal(statSync(keys.taymoor).mode & 0o777, 0o600)
  assert.equal(sh(mine, 'config', '--get', 'civic.signingKey'), keys.taymoor)
})

test('signed syncs are shared and accepted', async () => {
  const annotation = (await civic(mine, taymoor, 'annotate', 'The receipt total is wrong.', '--target', 'target:app.receipt')).split(' ')[0]!
  requestId = (await civic(mine, taymoor, 'request', annotation, '--ask', 'Fix the total.')).split(' ')[0]!
  await civic(mine, taymoor, 'sync')
  const message = sh(origin, 'log', '-1', '--format=%B', 'refs/civic/records')
  assert.match(message, /^Civic-Actor: actor:person\.taymoor$/m)
  assert.match(message, /^Civic-Signature: ed25519:[A-Za-z0-9+/=]+$/m)
  assert.match(await civic(theirs, sam, 'sync'), /record\(s\) from others/)
  assert.match(await civic(theirs, sam, 'requests'), /Fix the total\./)
})

test('without a signing key, a sync is refused before anything is shared', async () => {
  sh(theirs, 'config', '--unset', 'civic.signingKey')
  try {
    await assert.rejects(run(['sync'], theirs, env(sam), () => {}), /This repository signs shared records: .+ Run civic keygen, add the key it prints under keys\.sam/)
  } finally {
    sh(theirs, 'config', 'civic.signingKey', keys.sam)
  }
})

/** Publishes a change to the shared request as Taymoor would, with whatever signature it's given. */
function forge(signature: (base: string, document: GraphDocument) => string | undefined) {
  const remote = new GitRefRemote(theirs)
  const shared = remote.fetch()!
  const document = structuredClone(shared.document) as GraphDocument
  const request = document.records.find((record): record is WorkRequest => record.id === requestId)!
  request.status = 'resolved'
  request.history.push({ status: 'resolved', by: 'actor:person.taymoor', at: '2026-10-12T06:00:00Z', note: 'Looks fine.' })
  request.version = (request.version ?? 1) + 1
  request.changed = { by: 'actor:person.taymoor', at: '2026-10-12T06:00:00Z', what: 'resolve' }
  const signed = signature(shared.revision, document)
  const published = remote.publish({ document, captures: new Map(), actor: 'actor:person.taymoor', summary: 'forged', ...(signed ? { signature: signed } : {}) }, shared.revision)
  assert.notEqual(published, 'moved')
  return { revision: (published as { revision: string }).revision, parent: shared.revision }
}

async function refusedFor(pattern: RegExp) {
  const store = Store.forCheckout(readCheckout(mine))
  const before = JSON.stringify(store.read())
  await assert.rejects(run(['sync'], mine, env(taymoor), () => {}), (error: Error) => {
    assert.ok(error instanceof UntrustedChangeError, error.message)
    assert.match(error.message, pattern)
    return true
  })
  assert.equal(JSON.stringify(store.read()), before, 'nothing was merged')
}

test('a sync that names Taymoor but is signed with Sam\'s key is refused', async () => {
  const { parent } = forge((base, document) => signPayload(readKey(keys.sam), signedPayload(base, document, 'actor:person.taymoor')))
  await refusedFor(/signature isn't from a key civic\.access\.json lists for taymoor, so it can't be shown to come from actor:person\.taymoor/)
  sh(theirs, 'push', '-q', '--force', 'origin', `${parent}:refs/civic/records`)
})

test('an unsigned sync, or a real signature moved onto other records, is refused', async () => {
  const unsigned = forge(() => undefined)
  await refusedFor(/The sync naming actor:person\.taymoor isn't signed/)
  sh(theirs, 'push', '-q', '--force', 'origin', `${unsigned.parent}:refs/civic/records`)

  // Taymoor's genuine signature from his last sync, copied onto a different snapshot.
  const genuine = /^Civic-Signature: (.+)$/m.exec(sh(mine, 'log', '-1', '--format=%B', unsigned.parent))![1]!
  const moved = forge(() => genuine)
  await refusedFor(/signature isn't from a key civic\.access\.json lists for taymoor/)
  sh(theirs, 'push', '-q', '--force', 'origin', `${moved.parent}:refs/civic/records`)
  assert.match(await civic(mine, taymoor, 'sync'), /In sync/)
})

test('keys in civic.access.json must be Ed25519 public keys', () => {
  assert.throws(() => parseAccess('{"keys":{"sam":["ssh-ed25519 AAAA"]}}'), /keys\.sam is a list of ed25519:<base64> public keys/)
})

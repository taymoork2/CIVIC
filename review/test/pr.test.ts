import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { before, test } from 'node:test'
import { validateGraph, type Annotation, type Line } from '../../graph/src/index.ts'
import { readCheckout, run, Store } from '../src/index.ts'
import { callTool } from '../src/mcp.ts'

// D36: a pull request is its own line. Annotations made on its hosted preview land on the PR
// and the revision the preview serves, and the line follows the PR until it merges.

const root = mkdtempSync(join(tmpdir(), 'civic-pr-'))
const origin = join(root, 'origin.git')
const author = join(root, 'author')
const reviewer = join(root, 'reviewer')
const person = { CIVIC_PERSON: 'taymoor' }
const preview = 'https://pr-7.preview.example.com'

const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

async function civic(...args: string[]): Promise<string> {
  const out: string[] = []
  assert.equal(await run(args, reviewer, { ...process.env, CIVIC_AGENT: undefined, CIVIC_FOR: undefined, ...person }, (text) => out.push(text)), 0)
  return out.join('\n')
}

/** Commits on the author's branch and pushes it as GitHub serves a PR head. */
function pushPr(file: string): string {
  writeFileSync(join(author, file), `${file}\n`)
  sh(author, 'add', '.')
  sh(author, 'commit', '-q', '-m', file)
  sh(author, 'push', '-q', '--force', 'origin', 'HEAD:refs/pull/7/head')
  return sh(author, 'rev-parse', 'HEAD')
}

const records = () => Store.forCommonDir(readCheckout(reviewer).commonDir).read()
const prLine = () => records().records.find((record): record is Line => record.id === 'line:github.pr.7')!

before(() => {
  sh(root, 'init', '-q', '--bare', '-b', 'main', origin)
  sh(root, 'clone', '-q', origin, author)
  sh(author, 'config', 'user.email', 'sam@example.com')
  sh(author, 'config', 'user.name', 'Sam')
  sh(author, 'commit', '-q', '--allow-empty', '-m', 'start')
  sh(author, 'push', '-q', 'origin', 'main')
  sh(author, 'checkout', '-q', '-b', 'fix/receipt')
  sh(root, 'clone', '-q', origin, reviewer)
  sh(reviewer, 'config', 'user.email', 'taymoor@example.com')
})

test('a pull request is a line, and an annotation on its preview lands on it', async () => {
  const head = pushPr('receipt.ts')
  assert.equal(await civic('pr', '7', '--preview', `${preview}/receipt`), `line:github.pr.7 open at ${head.slice(0, 12)}, served at ${preview}`)
  assert.deepEqual({ ...prLine(), source: undefined }, { id: 'line:github.pr.7', kind: 'line', title: 'Pull request #7', type: 'pr', tool: 'github', ref: '7', base: 'line:git.main', head, status: 'open', source: undefined, previews: [{ url: preview, revision: head }] })

  const id = (await civic('annotate', 'The total wraps badly.', '--url', `${preview}/receipt?order=3`, '--target', 'target:shop.receipt')).split(' ')[0]!
  const annotation = records().records.find((record): record is Annotation => record.id === id)!
  assert.deepEqual(annotation.seenOn, { line: 'line:github.pr.7', revision: head, url: `${preview}/receipt?order=3` })
  assert.match(await civic('lines'), /line:github\.pr\.7\s+pr\s+open/)
})

test('the line follows the PR as it moves, and is marked merged once its head is on main', async () => {
  const moved = pushPr('total.ts')
  await civic('pr', '7')
  assert.equal(prLine().head, moved)
  assert.deepEqual(prLine().previews, [{ url: preview, revision: moved }], 'the preview now serves the new head')

  sh(author, 'push', '-q', 'origin', 'HEAD:main')
  assert.match(await civic('pr', '7'), /^line:github\.pr\.7 merged at /)
  assert.equal(prLine().mergedAs, moved)
  assert.deepEqual(validateGraph(records()).filter((issue) => issue.severity === 'error'), [])
})

test('a PR the remote doesn\'t have is refused, and an agent can register its own PR over MCP', async () => {
  await assert.rejects(civic('pr', '99'), /Couldn't fetch pull request 99 from origin/)
  const result = await callTool('register_pr', { cwd: reviewer, number: 7 }, { ...process.env, CIVIC_AGENT: 'claude-code', CIVIC_FOR: 'taymoor' })
  assert.match((result[0] as { text: string }).text, /^line:github\.pr\.7 is merged at [0-9a-f]{40}/)
})

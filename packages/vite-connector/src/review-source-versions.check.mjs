import assert from 'node:assert/strict'
import { test } from 'node:test'
import { discoverSourceVersions, figmaFile, githubRepository, sourcePage, gitHistory, previewVersion, gitSources } from './review-source-versions.mjs'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

test('source search renders at most ten items while all matches remain reachable', () => {
  const rows = Array.from({ length: 125 }, (_, i) => ({ id: `source-${i}`, title: `Work ${String(i).padStart(3, '0')}`, active: i < 100 }))
  assert.equal(sourcePage(rows).items.length, 10)
  assert.equal(sourcePage(rows).total, 100)
  assert.equal(sourcePage(rows).hiddenInactive, 25)
  assert.equal(sourcePage(rows, { inactive: true }).total, 125)
  assert.equal(sourcePage(rows, { offset: 10 }).items[0].id, 'source-10')
  assert.equal(sourcePage(rows, { query: 'Work 099' }).items[0].id, 'source-99')
  assert.equal(sourcePage(rows, { offset: 500 }).offset, 90)
  assert.throws(() => sourcePage(rows, { offset: -1 }), /Invalid/)
  assert.throws(() => sourcePage(rows, { query: 'a'.repeat(121) }), /Invalid/)
})
test('provider links restrict hosts and never accept credentials or arbitrary API URLs', () => {
  assert.equal(githubRepository('git@github.com:owner/app.git'), 'owner/app')
  assert.equal(githubRepository('https://github.com/owner/app.git'), 'owner/app')
  assert.equal(githubRepository('https://github.com.evil.test/owner/app'), null)
  assert.deepEqual(figmaFile('https://www.figma.com/design/Ab123/Example?node-id=1-2'), { key: 'Ab123', url: 'https://www.figma.com/design/Ab123' })
  for (const value of ['http://figma.com/file/Ab123', 'https://figma.com.evil.test/design/Ab123', 'https://token@figma.com/design/Ab123', 'https://figma.com:4000/design/Ab123', 'file:///etc/passwd']) assert.throws(() => figmaFile(value))
})
const project = { key: 'app', root: '/app', manifestRoot: '/app', manifest: { sources: ['src'] } }
const commands = []
async function command(root, args) {
  commands.push(args)
  if (args.includes('--git-common-dir')) return '/app/.git'
  if (args[0] === 'rev-parse') return 'base'
  if (args[0] === 'worktree') return 'worktree /app\0HEAD base\0branch refs/heads/main\0\0worktree /dirty\0HEAD base\0branch refs/heads/draft\0\0worktree /merged\0HEAD base\0branch refs/heads/old\0\0'
  if (args[0] === 'status') return root === '/dirty' ? ' M component.tsx' : ''
  if (args[0] === 'rev-list') return '0'
  if (args[0] === 'show') return '2026-10-18T00:00:00Z'
  if (args[0] === 'for-each-ref') return ''
  if (args[0] === 'remote') return 'git@github.com:owner/app.git'
  throw Error('Unexpected Git command')
}
test('discovery includes dirty work and open PRs, hides clean merged work, and makes no Git writes', async () => {
  const result = await discoverSourceVersions([project], [], {}, { command, github: async () => JSON.stringify([{ number: 3, title: 'Component draft', headRefName: 'draft', url: 'https://evil.test', headRefOid: 'abc', updatedAt: '2026-10-18' }]) })
  assert.equal(result.items.some(row => row.path === '/dirty'), true)
  assert.equal(result.items.some(row => row.path === '/merged'), false)
  assert.equal(result.hiddenInactive, 1)
  assert.equal(result.items.find(row => row.type === 'pull-request').url, 'https://github.com/owner/app/pull/3')
  assert.equal(commands.some(args => ['checkout', 'switch', 'fetch', 'reset', 'clean', 'branch'].includes(args[0])), false)
  const failure = await discoverSourceVersions([project], [], {}, { command, github: async () => { throw Error('private stderr') } })
  assert.equal(failure.items.some(row => row.path === '/dirty'), true)
  assert.equal(JSON.stringify(failure).includes('private stderr'), false)
  assert.equal(failure.providers.find(row => row.name === 'GitHub').status, 'unavailable')
})
test('linked Figma frames and branches use fixed API origins; missing access remains explicit', async () => {
  let called = ''
  const fetcher = async url => { called = url; return { ok: true, text: async () => JSON.stringify({ name: 'App designs', version: 'v1', branches: [{ key: 'Branch1', name: 'Navigation draft' }], document: { type: 'DOCUMENT', children: [{ type: 'CANVAS', name: 'Screens', children: [{ id: '1:2', type: 'FRAME', name: 'Home' }] }] } }) } }
  const links = [{ url: 'https://figma.com/design/Ab123' }]
  const result = await discoverSourceVersions([], links, {}, { token: 'test-token', fetcher })
  assert.equal(called, 'https://api.figma.com/v1/files/Ab123?depth=3&branch_data=true')
  assert.equal(result.total, 3)
  assert.equal(result.items.some(row => row.title === 'Home' && row.url.endsWith('?node-id=1%3A2')), true)
  assert.equal(result.items.find(row => row.title === 'Home').history.parentKey, 'figma:Ab123')
  assert.equal(result.items.find(row => row.title === 'Navigation draft').history.kind, 'design')
  assert.equal(JSON.stringify(result).includes('test-token'), false)
  const missing = await discoverSourceVersions([], links, {}, { token: '', fetcher: () => { throw Error('must not fetch') } })
  assert.equal(missing.providers[0].status, 'not-connected')
})
test('worktrees beyond the first hundred remain discoverable without rendering them all', async () => {
  const commandMany = async (root, args) => {
    if (args[0] === 'worktree') return Array.from({ length: 150 }, (_, i) => `worktree /draft-${i}\0HEAD base\0branch refs/heads/draft-${i}\0\0`).join('')
    if (args[0] === 'status') return ' M component.tsx'
    return command(root, args)
  }
  const result = await discoverSourceVersions([project], [], {}, { command: commandMany, github: async () => '[]' })
  assert.equal(result.total, 150)
  assert.equal(result.items.length, 10)
  const searched = await discoverSourceVersions([project], [], { query: 'draft-149' }, { command: commandMany, github: async () => '[]' })
  assert.equal(searched.total, 1)
  assert.equal(searched.items[0].path, '/draft-149')
})

test('explicit preview discovery inspects only selected worktrees before running status commands', async () => {
  const inspected = [], calls = []
  const selected = async (root, args) => {
    calls.push(args[0])
    if (args[0] === 'worktree') return Array.from({ length: 150 }, (_, i) => `worktree /draft-${i}\0HEAD base\0branch refs/heads/draft-${i}\0\0`).join('')
    if (args[0] === 'status') inspected.push(root)
    return command(root, args)
  }
  const result = await gitSources('/app', 'src', new Set(), selected, '', { paths: ['/draft-149'] })
  assert.deepEqual(inspected, ['/draft-149'])
  assert.deepEqual(result.items.map(row => row.path), ['/draft-149'])
  assert.equal(calls.includes('for-each-ref'), false, 'Connecting selected previews does not enumerate unrelated branches')
  inspected.length = 0
  assert.deepEqual((await gitSources('/app', 'src', new Set(), selected, '', { paths: [] })).items, [])
  assert.deepEqual(inspected, [])
})

test('history compares the recorded commit with main, including divergence and a later merge', async () => {
  const root = await mkdtemp(join(tmpdir(), 'civic-history-'))
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const commit = name => git('-c', 'user.name=History Test', '-c', 'user.email=history@example.invalid', 'commit', '-m', name)
  try {
    git('init', '--initial-branch=main')
    await writeFile(join(root, 'base.txt'), 'base'); git('add', 'base.txt'); commit('base')
    const base = git('rev-parse', 'HEAD')
    git('branch', 'draft')
    await writeFile(join(root, 'main.txt'), 'main'); git('add', 'main.txt'); commit('main')
    git('switch', 'draft')
    await writeFile(join(root, 'draft.txt'), 'draft'); git('add', 'draft.txt'); commit('draft')
    const draft = git('rev-parse', 'HEAD')
    const diverged = await gitHistory(root, draft)
    assert.equal(diverged.status, 'diverged'); assert.equal(diverged.ahead, 1); assert.equal(diverged.behind, 1); assert.equal(diverged.sharedBase, base)
    assert.equal((await gitHistory(root, base)).status, 'included')
    git('switch', 'main'); git('-c', 'user.name=History Test', '-c', 'user.email=history@example.invalid', 'merge', '--no-ff', 'draft', '-m', 'merge draft')
    const included = await gitHistory(root, draft)
    assert.equal(included.status, 'included'); assert.equal(included.ahead, 0); assert.equal(included.behind, 2)
    const metadata = join(root, '.civic-metadata'); await mkdir(metadata)
    await writeFile(join(metadata, 'receipt.json'), JSON.stringify({ source: root, ui: draft, worktreeName: 'Draft', builtAt: '2026-10-18T23:00:00Z' }))
    const before = git('status', '--porcelain')
    const preview = await previewVersion({ root, manifestRoot: metadata, manifest: {} }, 'implementation')
    assert.equal(preview.version.history.revision, draft, 'Newer checkout HEAD cannot replace the captured revision')
    assert.equal(preview.version.history.capturedAt, '2026-10-18T23:00:00.000Z')
    assert.equal(git('status', '--porcelain'), before, 'History collection is read-only')
    assert.equal((await gitHistory(root, '0'.repeat(40))).status, 'unknown')
    git('branch', '-m', 'trunk')
    const missingMain = await gitHistory(root, draft)
    assert.equal(missingMain.status, 'unknown'); assert.ok(missingMain.updatedAt)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('history rejects ref injection before any Git command and namespaces unrelated repositories', async () => {
  let calls = 0
  assert.equal((await gitHistory('/app', '--all', async () => { calls++; throw Error('must not run') })).status, 'unknown')
  assert.equal(calls, 0)
  const head = 'a'.repeat(40), base = 'b'.repeat(40)
  const command = async (root, args) => args.includes('--is-shallow-repository') ? 'false' : args.includes('--git-common-dir') ? root + '/.git' : args[0] === 'remote' ? '' : args[0] === 'show' ? '2026-10-18T01:00:00Z' : args[0] === 'rev-list' ? '0\t1' : args.at(-1) === 'refs/heads/main' ? base : head
  const a = await gitHistory('/one', head, command), b = await gitHistory('/two', head, command)
  assert.notEqual(a.key, b.key); assert.equal(a.status, 'ahead')
  assert.equal((await gitHistory('/shallow', head, async (root, args) => args.includes('--is-shallow-repository') ? 'true' : command(root, args))).status, 'unknown')
})

test('a source checkout without a build receipt exposes real branch history without claiming a captured build', async () => {
  const root = await mkdtemp(join(tmpdir(), 'civic-checkout-history-'))
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '--initial-branch=main')
  await writeFile(join(root, 'screen.tsx'), 'export const Screen = 1')
  git('add', 'screen.tsx'); git('-c', 'user.name=History Test', '-c', 'user.email=history@example.invalid', 'commit', '-m', 'screen')
  const project = { root, manifestRoot: root, manifest: {} }
  const main = await previewVersion(project, 'implementation')
  assert.equal(main.version.name, 'Main branch')
  assert.equal(main.version.history.main, true)
  assert.equal(main.version.history.revision, git('rev-parse', 'HEAD'))
  assert.equal(main.version.history.capturedAt, undefined)
  assert.equal(main.version.id, null, 'A commit alone does not prove equal preview content')
  git('switch', '-c', 'fix/mobile')
  await writeFile(join(root, 'screen.tsx'), 'export const Screen = 2')
  const before = git('status', '--porcelain')
  const draft = await previewVersion(project, 'implementation')
  assert.equal(draft.version.name, 'Fix/mobile')
  assert.match(draft.sourceName, /edited/)
  assert.equal(draft.version.history.status, 'same')
  assert.equal(draft.version.history.main, false)
  assert.equal(git('status', '--porcelain'), before)
  const nested = join(root, 'nested'); await mkdir(nested)
  assert.equal((await previewVersion({ ...project, root: nested, manifestRoot: nested }, 'implementation')).version.history.revision, undefined, 'A nested reference folder cannot borrow its parent repository history')
  git('switch', '--detach')
  assert.equal((await previewVersion(project, 'implementation')).version.name, 'Detached checkout')
  assert.equal((await previewVersion(project, 'live')).version.history.revision, undefined, 'A running instance cannot borrow checkout HEAD')
  await writeFile(join(root, 'receipt.json'), '{broken')
  assert.equal((await previewVersion(project, 'implementation')).version.history.revision, undefined, 'A damaged build receipt cannot silently become checkout history')
})

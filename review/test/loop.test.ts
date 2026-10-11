import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { validateGraph, type WorkRequest } from '../../graph/src/index.ts'
import { launchBrowser, readCheckout, run, Store, type Browser } from '../src/index.ts'

// The roadmap's acceptance for the review to agent loop, end to end on a real git
// repository with a linked worktree: an annotation made in one worktree is claimed by an
// agent in another, the reported fix is re-captured on that worktree's preview with no
// model call, and the request resolves through its lane.

const root = mkdtempSync(join(tmpdir(), 'civic-loop-'))
const main = join(root, 'app')
const worktree = join(root, 'app-fix')
const person = { CIVIC_PERSON: 'taymoor' }
const agent = { CIVIC_AGENT: 'claude-code', CIVIC_FOR: 'taymoor' }
const servers: Server[] = []
let browser: Browser | undefined
let browserError = ''

const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

/** Runs the civic CLI in a checkout as someone, and returns what it printed. */
async function civic(cwd: string, who: Record<string, string>, ...args: string[]): Promise<string> {
  const out: string[] = []
  const env: NodeJS.ProcessEnv = { ...process.env, CIVIC_AGENT: undefined, CIVIC_FOR: undefined, CIVIC_PERSON: undefined, ...who }
  const code = await run(args, cwd, env, (text) => out.push(text))
  assert.equal(code, 0)
  return out.join('\n')
}

const page = (heading: string, extra = '') => `<!doctype html><html><body><main>
  <section data-civic-id="target:demo.intake.pack">
    <h2 data-testid="pack-color-label" style="width:120px;white-space:nowrap;overflow:hidden">${heading}</h2>
    ${extra}
  </section></main></body></html>`

/** Serves a checkout's site/ folder as its preview, reading files on every request. */
async function serve(dir: string): Promise<string> {
  const server = createServer((req, res) => {
    const file = join(dir, 'site', new URL(req.url ?? '/', 'http://x').pathname === '/' ? 'index.html' : new URL(req.url!, 'http://x').pathname)
    if (!existsSync(file)) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(readFileSync(file))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  const address = server.address()
  return `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
}

const store = () => Store.forCommonDir(readCheckout(main).commonDir)
const request = (id: string) => store().read().records.find((record): record is WorkRequest => record.id === id)!

before(async () => {
  execFileSync('mkdir', ['-p', join(main, 'site')])
  sh(root, 'init', '-q', '-b', 'main', main)
  sh(main, 'config', 'user.email', 'taymoor@example.com')
  sh(main, 'config', 'user.name', 'Taymoor')
  writeFileSync(join(main, 'site', 'index.html'), page('Pick a colour for this load'))
  sh(main, 'add', '.')
  sh(main, 'commit', '-q', '-m', 'site')
  sh(main, 'worktree', 'add', '-q', '-b', 'fix/pack-label', worktree)
  try {
    const path = process.env.CIVIC_BROWSER_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
    browser = await launchBrowser({ ...process.env, ...(path ? { CIVIC_BROWSER_PATH: path } : {}) })
  } catch (error) {
    browserError = (error as Error).message
  }
})

after(async () => {
  await browser?.close()
  for (const server of servers) server.close()
})

test('both worktrees share one store in the git common directory', async () => {
  const fromMain = await civic(main, person, 'whoami')
  const fromWorktree = await civic(worktree, agent, 'whoami')
  const storeLine = (text: string) => text.split('\n').find((line) => line.startsWith('Store: '))
  assert.equal(storeLine(fromMain), storeLine(fromWorktree))
  assert.match(fromMain, /actor:person\.taymoor on line:git\.main/)
  assert.match(fromWorktree, /actor:agent\.claude-code\.taymoor on line:git\.fix\.pack-label/)
  assert.ok(storeLine(fromMain)!.endsWith(join('.git', 'civic')))
})

test('an annotation in one worktree is claimed in another, re-captured on its preview and resolved in the Auto lane', async (t) => {
  if (!browser) return t.skip(`No browser for CIVIC's capture: ${browserError}`)
  const mainPreview = await serve(main)
  await civic(main, person, 'preview', mainPreview)
  const annotation = (await civic(main, person, 'annotate', 'The colour label clips.', '--url', `${mainPreview}/`, '--target', 'target:demo.intake.pack', '--test-id', 'pack-color-label')).split(' ')[0]!
  const created = await civic(main, person, 'request', annotation, '--ask', 'Let the label wrap.', '--check', 'test -f fixed.txt', '--platform', 'web')
  const id = created.split(' ')[0]!
  assert.match(created, /lane auto/)

  // The agent in the other worktree sees it, claims it, and a second agent is refused.
  assert.match(await civic(worktree, agent, 'requests'), /Let the label wrap\./)
  await assert.rejects(run(['claim', id, '--lease', 'abc'], worktree, { ...process.env, CIVIC_PERSON: undefined, ...agent }, () => {}), /--lease is a number of minutes/)
  assert.match(await civic(worktree, agent, 'claim', id), /claimed by actor:agent\.claude-code\.taymoor on line:git\.fix\.pack-label/)
  await assert.rejects(run(['claim', id], worktree, { ...process.env, CIVIC_AGENT: 'codex', CIVIC_FOR: 'taymoor' }, () => {}), /claimed by actor:agent\.claude-code\.taymoor/)

  // The fix: the label wraps. The agent commits it and reports it with its own preview.
  writeFileSync(join(worktree, 'site', 'index.html'), page('Pick a colour for this load').replace('white-space:nowrap;overflow:hidden', 'white-space:normal'))
  writeFileSync(join(worktree, 'fixed.txt'), 'yes')
  sh(worktree, 'add', '.')
  sh(worktree, 'commit', '-q', '-m', 'Wrap the label')
  const fixPreview = await serve(worktree)
  await civic(worktree, agent, 'report-fix', id, '--preview', fixPreview, '--note', 'Wrapped the label.')
  assert.equal(request(id).status, 'fix-ready')

  // CIVIC re-captures on the worktree's preview, runs the person's check there, and resolves.
  const { recapture } = await import('../src/index.ts')
  const result = await recapture({ store: store(), checkout: readCheckout(main), identity: { type: 'person', handle: 'taymoor' } }, id, { browser })
  assert.equal(result.recapture.anchors[0]!.outcome, 'found-by-id')
  assert.deepEqual(result.recapture.checks, [{ command: 'test -f fixed.txt', outcome: 'pass' }])
  const resolved = request(id)
  assert.equal(resolved.status, 'resolved')
  assert.equal(resolved.history.at(-1)!.by, 'actor:civic')
  assert.equal(resolved.fixes[0]!.revision, sh(worktree, 'rev-parse', 'HEAD'))
  assert.equal(resolved.fixes[0]!.line, 'line:git.fix.pack-label')
  assert.ok(existsSync(store().capturePath(result.recapture.anchors[0]!.capture!)), 'the after capture is stored by content')

  const evidence = store().read().records.find((record) => record.id === result.recapture.evidenceId)
  assert.equal(evidence?.kind === 'evidence' && evidence.tier, 'working-preview')
  assert.deepEqual(validateGraph(store().read()).filter((issue) => issue.severity === 'error'), [])

  // The person can still reopen what CIVIC resolved.
  await civic(main, person, 'reopen', id, '--note', 'Also check dark mode.')
  assert.equal(request(id).status, 'reopened')
})

test('the Auto lane reopens a fix whose anchor is no longer found, and never moves it to the nearest element', async (t) => {
  if (!browser) return t.skip(`No browser for CIVIC's capture: ${browserError}`)
  const annotation = (await civic(main, person, 'annotate', 'Label too small.', '--target', 'target:demo.intake.missing', '--test-id', 'pack-colour-label')).split(' ')[0]!
  const id = (await civic(main, person, 'request', annotation, '--ask', 'Bigger label.', '--check', 'true')).split(' ')[0]!
  await civic(worktree, agent, 'claim', id)
  const preview = await serve(worktree)
  await civic(worktree, agent, 'report-fix', id, '--preview', preview)
  const { recapture } = await import('../src/index.ts')
  const result = await recapture({ store: store(), checkout: readCheckout(main), identity: { type: 'person', handle: 'taymoor' } }, id, { browser })
  // The page has pack-color-label, one letter off the locator's pack-colour-label: not a match.
  assert.equal(result.recapture.anchors[0]!.outcome, 'not-found')
  assert.equal(request(id).status, 'reopened')
  assert.equal(request(id).history.at(-1)!.by, 'actor:civic')
})

test('an imported screenshot is unanchored, waits in batch review, and only a person resolves it', async (t) => {
  if (!browser) return t.skip(`No browser for CIVIC's capture: ${browserError}`)
  const png = join(root, 'shot.png')
  writeFileSync(png, Buffer.from('89504e470d0a1a0a', 'hex'))
  const imported = await civic(worktree, agent, 'annotate', 'Back from the receipt goes home.', '--image', png)
  assert.match(imported, /\(unanchored\)/)
  const annotation = imported.split(' ')[0]!
  const id = (await civic(main, person, 'request', annotation, '--ask', 'Back returns to the order.')).split(' ')[0]!
  assert.match(await civic(main, person, 'show', id), /Lane: Batch review/)

  await civic(worktree, agent, 'claim', id)
  await civic(worktree, agent, 'report-fix', id, '--preview', await serve(worktree))
  const { recapture } = await import('../src/index.ts')
  const result = await recapture({ store: store(), checkout: readCheckout(main), identity: { type: 'person', handle: 'taymoor' } }, id, { browser })
  assert.equal(result.recapture.anchors[0]!.outcome, 'unanchored')
  assert.equal(request(id).status, 'fix-ready', 'outside Auto, CIVIC waits for a person')
  assert.match(await civic(main, person, 'queue'), /Back returns to the order\./)

  await assert.rejects(run(['resolve', id], worktree, { ...process.env, ...agent }, () => {}), /agents never resolve/)
  await civic(main, person, 'resolve', id)
  assert.equal(request(id).status, 'resolved')
})

test('a change to behavior needs its owner, and an agent check counts only once a person accepts it', async () => {
  const annotation = (await civic(main, person, 'annotate', 'Offline save dead-ends.', '--edge', 'target:demo.intake.save-error>target:demo.intake.pack:Retry')).split(' ')[0]!
  const owned = (await civic(main, person, 'request', annotation, '--ask', 'Add a Retry branch.', '--change', '--owner', 'design:laundry-design')).split(' ')[0]!
  assert.match(await civic(main, person, 'show', owned), /Lane: Owner sign-off/)
  await assert.rejects(run(['resolve', owned, '--note', 'Looks fine'], main, { ...process.env, ...person }, () => {}), /not an owner/)
  await civic(main, { CIVIC_PERSON: 'laundry-design' }, 'resolve', owned, '--note', 'Not doing this yet.')

  const anchored = (await civic(main, person, 'annotate', 'Label clips.', '--target', 'target:demo.intake.pack')).split(' ')[0]!
  const id = (await civic(main, person, 'request', anchored, '--ask', 'Wrap it.')).split(' ')[0]!
  await civic(worktree, agent, 'add-check', id, 'pnpm test')
  assert.match(await civic(main, person, 'show', id), /Lane: Batch review/)
  await assert.rejects(run(['accept-check', id, '1'], worktree, { ...process.env, ...agent }, () => {}), /Only a person accepts a check/)
  await civic(main, person, 'accept-check', id, '1')
  assert.match(await civic(main, person, 'show', id), /Lane: Auto/)
})

test('repro prints the exact scenario on any preview, and the lens lists every line', async () => {
  const annotation = (await civic(main, person, 'annotate', 'Check this.', '--url', 'http://127.0.0.1:9/review?scenario=intake.pack.color&scale=2', '--target', 'target:demo.intake.pack')).split(' ')[0]!
  const id = (await civic(main, person, 'request', annotation, '--ask', 'Look.')).split(' ')[0]!
  assert.match(await civic(worktree, agent, 'repro', id, '--url', 'http://127.0.0.1:4000'), /^http:\/\/127\.0\.0\.1:4000\/review\?scenario=intake\.pack\.color&scale=2  Check this\./)
  const lines = await civic(worktree, agent, 'lines')
  assert.match(lines, /^\* line:git\.fix\.pack-label\s+worktree/m)
  assert.match(lines, /line:git\.main\s+main/)
})

test('re-capture signs in to a preview behind a local access key, without copying the key into the store', async (t) => {
  if (!browser) return t.skip(`No browser for CIVIC's capture: ${browserError}`)
  const keyFile = join(root, 'access-key')
  writeFileSync(keyFile, 'local-secret\n')
  const server = createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer local-secret') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1>Review access</h1>'); return }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(page('Signed in'))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  const address = server.address()
  const preview = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`

  const annotation = (await civic(main, person, 'annotate', 'Signed-in screen.', '--target', 'target:demo.intake.pack')).split(' ')[0]!
  const id = (await civic(main, person, 'request', annotation, '--ask', 'Check it.', '--check', 'true')).split(' ')[0]!
  await civic(worktree, agent, 'preview', preview, '--bearer-file', keyFile)
  await civic(worktree, agent, 'claim', id)
  await civic(worktree, agent, 'report-fix', id, '--preview', preview)
  const { recapture } = await import('../src/index.ts')
  const result = await recapture({ store: store(), checkout: readCheckout(main), identity: { type: 'person', handle: 'taymoor' } }, id, { browser })
  assert.equal(result.recapture.anchors[0]!.outcome, 'found-by-id')
  assert.equal(request(id).status, 'resolved')
  assert.ok(!readFileSync(store().file, 'utf8').includes('local-secret'))
})

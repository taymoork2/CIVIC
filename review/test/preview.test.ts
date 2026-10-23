import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { Annotation, Line } from '../../graph/src/index.ts'
import { run, readCheckout, Store } from '../src/index.ts'
import { LAUNCHER_MARKER, parsePreview, pickPorts, privateDir, readPreviews, removeOwnedRoot, ROOT_MARK, reservedPort, sameProcess, select, stopProcess, writePreview, type Preview, type Proc } from '../src/preview/state.ts'

// `civic preview`: the contract is Orca's `pnpm preview` (docs/self-dogfood.md).
const CIVIC = join(dirname(fileURLToPath(import.meta.url)), '../..')
const scratch = mkdtempSync(join(tmpdir(), 'civic-preview-test-'))
const servers: Server[] = []
const children: ChildProcess[] = []
after(() => { for (const server of servers) { server.closeAllConnections(); server.close() }; for (const child of children) child.kill() })

const proc = (marker = `--store /t/civic-preview/x-1/store`): Proc => ({ pid: 4242, group: true, marker, started: 'Thu Oct 22 10:00:00 2026' })
const preview = (over: Partial<Preview> = {}): Preview => ({
  id: 'main-1a2b3c4d', branch: 'main', worktree: '/w', root: '/t/civic-preview/main-1a2b3c4d', head: 'a'.repeat(40), dirty: false, canvasPort: 50001, port: 50002,
  origin: 'http://127.0.0.1:50002', keep: false, startedAt: new Date().toISOString(), launcher: { ...proc(LAUNCHER_MARKER) }, children: [proc('--store /t/civic-preview/main-1a2b3c4d/store')], ...over,
})

test('ports: the OS picks them, and none of the reserved ones is ever used', async () => {
  assert.ok([3012, 3020, 4317, 4417, 4777, 5733, 5734, 10448, 4998, 5998].every(reservedPort))
  assert.deepEqual(await pickPorts(2, async () => [3012, 4998, 50001, 5997, 50002, 50003]), [50001, 50002])
  await assert.rejects(pickPorts(2, async () => [3012, 3020, 50001]), /free port/)
})

test('a state file is parsed, never trusted', () => {
  assert.ok(parsePreview(preview()))
  assert.equal(parsePreview({ ...preview(), extra: 1 }), undefined, 'unknown fields')
  assert.equal(parsePreview(preview({ origin: 'http://127.0.0.1:50999' })), undefined, 'an origin that is not its port')
  assert.equal(parsePreview(preview({ branch: 'main\nInjected line' })), undefined, 'a branch with control characters')
  assert.equal(parsePreview(preview({ port: 3012 })), undefined, 'a reserved port')
  assert.equal(parsePreview(preview({ children: [proc('rm -rf /')] })), undefined, 'a command the launcher never starts')
  assert.equal(parsePreview(preview({ launcher: proc('--store /t/civic-preview/x/store') })), undefined, 'a launcher that is not the launcher')
  assert.equal(parsePreview(preview({ launcher: { ...proc(LAUNCHER_MARKER), pid: 1 } })), undefined, 'pid 1')
})

test('stopping signals a process only when its start time and command still match', async () => {
  const sent: Array<[number, NodeJS.Signals]> = []
  const kill = (pid: number, signal: NodeJS.Signals) => void sent.push([pid, signal])
  const alive = (started: string, command: string) => () => ({ started, command })
  const recorded = proc()
  assert.equal(await stopProcess(recorded, { look: alive('Fri Oct 23 09:00:00 2026', `node x ${recorded.marker}`), kill }), false, 'a recycled pid')
  assert.equal(await stopProcess(recorded, { look: alive(recorded.started, 'node something-else'), kill }), false, 'another command')
  assert.deepEqual(sent, [])
  let living = true
  const look = () => (living ? { started: recorded.started, command: `node canvas ${recorded.marker}` } : null)
  assert.equal(await stopProcess(recorded, { look, kill: (pid, signal) => { kill(pid, signal); living = false } }), true)
  assert.deepEqual(sent, [[-4242, 'SIGTERM']], 'its own process group')
  assert.equal(sameProcess(recorded, look), false)
})

test('a private folder refuses links and loose permissions; only a marked folder is deleted', () => {
  const dir = join(scratch, 'previews')
  privateDir(dir)
  chmodSync(dir, 0o755)
  assert.throws(() => privateDir(dir), /not a private folder/)
  symlinkSync(dir, join(scratch, 'link'))
  assert.throws(() => privateDir(join(scratch, 'link')), /not a private folder/)

  const base = join(scratch, 'owned')
  privateDir(base)
  const marked = join(base, 'a-1')
  const unmarked = join(base, 'b-2')
  const nested = join(base, 'a-1', 'data')
  for (const folder of [marked, unmarked, nested]) mkdirSync(folder, { recursive: true })
  writeFileSync(join(marked, ROOT_MARK), 'a-1')
  assert.equal(removeOwnedRoot(unmarked, base), false, 'no marker')
  assert.equal(removeOwnedRoot(nested, base), false, 'not directly inside the previews folder')
  assert.equal(removeOwnedRoot(base, base), false, 'the previews folder itself')
  assert.equal(removeOwnedRoot(scratch, base), false, 'outside it')
  assert.equal(removeOwnedRoot(marked, base), true)
  assert.ok(existsSync(unmarked) && !existsSync(marked))
  assert.deepEqual(select([preview(), preview({ id: 'x-2', branch: 'x', worktree: '/other' })], undefined, '/w').map((p) => p.branch), ['main'])
})

test('state is read only from a private folder, and only for a preview\'s own data folder', () => {
  const dir = join(scratch, 'states')
  const own = preview({ root: join(dir, 'main-1a2b3c4d') })
  writePreview(own, dir)
  assert.deepEqual(readPreviews(dir).map((p) => p.id), [own.id])
  writeFileSync(join(dir, 'other-2.json'), JSON.stringify(preview({ id: 'other-2', root: '/Users/someone/important' })))
  assert.deepEqual(readPreviews(dir).map((p) => p.id), [own.id], 'a data folder that is not its own is ignored')
  chmodSync(dir, 0o755)
  assert.deepEqual(readPreviews(dir), [], 'a folder others can enter is not believed')
  mkdirSync(join(dir, 'main-1a2b3c4d'), { recursive: true })
  writeFileSync(join(dir, 'main-1a2b3c4d', ROOT_MARK), 'x')
  assert.equal(removeOwnedRoot(join(dir, 'main-1a2b3c4d'), dir), false, 'and nothing in it is deleted')
})

// A repository shaped like CIVIC, whose code is this checkout's, so a preview runs the real launcher and canvas
// while its records go to a throwaway repository instead of the owner's.
function fixture() {
  const repo = mkdtempSync(join(scratch, 'repo-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'reviewer@example.com')
  for (const name of ['packages', 'review', 'graph']) symlinkSync(join(CIVIC, name), join(repo, name))
  git('add', '.'); git('commit', '-q', '-m', 'init')
  const env = { ...process.env, TMPDIR: scratch, CIVIC_PERSON: 'reviewer' }
  const civic = (...args: string[]) => execFileSync(process.execPath, [join(CIVIC, 'review/src/cli.ts'), ...args], { cwd: repo, env, encoding: 'utf8' }).trim()
  return { repo, git, env, civic }
}

test('refuses, before starting anything, outside a CIVIC worktree, with uncommitted changes, and for --desktop', async () => {
  const { repo, env } = fixture()
  const plain = mkdtempSync(join(scratch, 'plain-'))
  for (const args of [['init', '-q'], ['-c', 'user.email=a@example.com', '-c', 'user.name=a', 'commit', '-q', '--allow-empty', '-m', 'init']]) execFileSync('git', args, { cwd: plain })
  await assert.rejects(run(['preview'], plain, env, () => {}), /not a CIVIC worktree/)
  writeFileSync(join(repo, 'edit'), 'x')
  await assert.rejects(run(['preview'], repo, env, () => {}), /uncommitted changes.*--allow-dirty/)
  await assert.rejects(run(['preview', '--desktop'], repo, env, () => {}), /--desktop is not built yet/)
})

test('a preview starts on free ports, attaches when repeated, files comments on the worktree\'s line, and stop leaves nothing', async (t) => {
  const { repo, git, env, civic } = fixture()
  const foreign = createServer((_req, res) => res.end('foreign'))
  await new Promise<void>((resolve) => foreign.listen(0, '127.0.0.1', resolve))
  servers.push(foreign)
  const foreignUrl = `http://127.0.0.1:${(foreign.address() as { port: number }).port}`

  const launcher = spawn(process.execPath, [join(CIVIC, 'review/src/cli.ts'), 'preview', '--no-open'], { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(launcher)
  let output = ''
  launcher.stdout.on('data', (chunk) => { output += chunk })
  launcher.stderr.on('data', (chunk) => { output += chunk })
  const origin = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No preview after 100 s:\n${output}`)), 100_000)
    const poll = setInterval(() => {
      const found = /Previewing .*?: (http:\/\/127\.0\.0\.1:\d+)\/review/.exec(output)
      if (found) { clearTimeout(timer); clearInterval(poll); resolve(found[1]!) }
    }, 200)
    launcher.once('exit', () => { clearTimeout(timer); clearInterval(poll); reject(new Error(`The launcher exited:\n${output}`)) })
  })
  const head = git('rev-parse', 'HEAD')
  const page = await (await fetch(`${origin}/review`)).text()
  assert.match(page, new RegExp(`<script src="http://127\\.0\\.0\\.1:\\d+/overlay\\.js" data-civic-line="line:git\\.main" data-civic-revision="${head}"`))
  assert.ok(!reservedPort(Number(new URL(origin).port)))

  assert.match(civic('preview', 'list'), new RegExp(`main  ${origin}/review  ${head.slice(0, 7)}`))
  assert.match(civic('preview'), /A preview of main is already running/)
  assert.match(civic('preview', 'link'), new RegExp(`main: ${origin}/review`))
  assert.equal(readCheckout(repo).mainRoot, realpathSync(repo))

  let chromium
  try { ({ chromium } = await import('playwright-core')) } catch { t.diagnostic('no playwright-core: skipped the comment') }
  if (chromium) {
    let browser
    try { browser = await chromium.launch({ headless: true, ...(process.env.CIVIC_BROWSER_PATH ? { executablePath: process.env.CIVIC_BROWSER_PATH } : {}) }) } catch (error) { t.diagnostic(`no browser: ${(error as Error).message.split('\n')[0]}`) }
    if (browser) {
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
        await page.goto(`${origin}/review`)
        await page.waitForFunction(() => '__civicOverlay' in globalThis)
        await page.getByText('Notebook home').first().waitFor()
        await page.keyboard.press('Alt+Shift+KeyC')
        const box = (await page.getByText('Notebook home').first().boundingBox())!
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        await page.getByLabel('Comment').fill('The home card heading is hard to read.')
        await page.getByRole('button', { name: 'Save annotation' }).click()
        await page.getByRole('status').filter({ hasText: 'Saved' }).waitFor()
      } finally {
        await browser.close()
      }
      const records = Store.forCheckout(readCheckout(repo)).read().records
      const annotation = records.find((record): record is Annotation => record.kind === 'annotation')!
      assert.equal(annotation.seenOn.line, 'line:git.main')
      assert.equal(annotation.seenOn.revision, head)
      assert.equal(annotation.seenOn.url, `${origin}/review`)
      assert.deepEqual(records.find((record): record is Line => record.id === 'line:git.main')!.previews?.map((p) => p.url), [origin])
    }
  }

  const state = JSON.parse(readFileSync(join(scratch, 'civic-preview', readdirNames(join(scratch, 'civic-preview')).find((n) => n.endsWith('.json'))!), 'utf8')) as Preview
  assert.ok(existsSync(join(state.root, ROOT_MARK)) && existsSync(join(state.root, 'store')))
  assert.match(civic('preview', 'stop'), /Stopped main\./)
  if (launcher.exitCode === null) await once(launcher, 'exit')
  assert.ok(!existsSync(state.root), 'the preview\'s data is deleted')
  assert.equal(readdirNames(join(scratch, 'civic-preview')).length, 0)
  for (const recorded of [state.launcher, ...state.children]) assert.equal(sameProcess(recorded), false, `${recorded.marker} is gone`)
  await assert.rejects(fetch(`${origin}/review`, { signal: AbortSignal.timeout(2000) }))
  assert.equal(await (await fetch(foreignUrl)).text(), 'foreign', 'an unrelated listener was never touched')
  assert.deepEqual(Store.forCheckout(readCheckout(repo)).read().records.find((record): record is Line => record.id === 'line:git.main')!.previews ?? [], [], 'the preview is unregistered')
  assert.match(civic('preview', 'list'), /No previews running/)
})

function readdirNames(dir: string): string[] {
  try { return readdirSync(dir) } catch { return [] }
}

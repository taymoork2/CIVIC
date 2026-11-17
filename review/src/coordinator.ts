import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import type { WorkRef } from '../../graph/src/index.ts'
import { readBackendCoverage, readProjectInventory } from './backend.ts'
import { diffRanges, elements, taggedCapture, type TaggedCapture } from './elements.ts'
import { git, readCheckout } from './git.ts'
import { lineIdFor } from './loop.ts'
import { startPreview } from './preview/launcher.ts'
import { isRunning, readPreviews, type Preview } from './preview/state.ts'
import { launchBrowser } from './recapture.ts'
import { configuredStore, Store } from './store.ts'
import { unsharedPassingReplays } from './replays.ts'

export const previewStore = (cwd: string, env = process.env) => {
  const configured = configuredStore(env)
  if (configured) return configured
  const preview = readPreviews().find(row => row.worktree === readCheckout(cwd).root && isRunning(row))
  return preview ? join(preview.root, 'store') : cwd
}
export function previewOrigin(address: string) {
  let url: URL
  try { url = new URL(address) } catch { throw new Error('Preview URL must be a loopback http address with a port and no credentials.') }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) || !url.port || url.username || url.password) throw new Error('Preview URL must be a loopback http address with a port and no credentials.')
  return url.origin
}

export async function previewInventory(origin: string, local: Awaited<ReturnType<typeof readProjectInventory>>) {
  let metadata
  try {
    // Use the preview's own loopback session cookie; stored bearer tokens never go to an address given at call time.
    const headers: Record<string, string> = {}
    const page = await fetch(`${origin}/review`, { redirect: 'error', signal: AbortSignal.timeout(5000) })
    const cookie = page.headers.get('set-cookie')
    await page.body?.cancel()
    if (cookie) headers.cookie = cookie.split(';')[0]!
    const response = await fetch(`${origin}/api/review/index`, { headers, redirect: 'error', signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    metadata = await response.json()
    if (!metadata.project?.key || !metadata.connection?.applicationRoot || typeof metadata.revision?.source !== 'string' || !Array.isArray(metadata.scenarios)) throw new Error('missing inventory metadata')
  } catch { throw new Error('That address did not answer as a CIVIC preview with readable inventory.') }
  if (metadata.project.key !== local.project.key || realpathSync(metadata.connection.applicationRoot) !== realpathSync(local.project.root)) throw new Error('The preview serves a different project than this checkout.')
  return metadata as typeof local.metadata
}
export interface ScreenRef { project: string; scenario: string; journey?: string; route?: string }
export interface Shot { viewport: number; theme: 'light' | 'dark' }
type Scenario = { id: string; journey: string; route?: string }

// base comes from an agent: resolve it to a commit so it can never be read as a git option.
export const commitOf = (cwd: string, base: string) => {
  let sha = ''
  try { sha = git(cwd, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${base}^{commit}`) } catch { /* reported below */ }
  if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new Error(`${base} is not a commit in this checkout.`)
  return sha
}

export async function changedScreens(cwd: string, base: string, projectPath?: string, inventory?: Awaited<ReturnType<typeof readProjectInventory>>) {
  const sha = commitOf(cwd, base)
  const checkout = readCheckout(cwd)
  const { project, metadata } = inventory ?? await readProjectInventory(cwd, projectPath, previewStore(cwd))
  const captures = Store.forCheckout(checkout).taggedCaptures(project.key, metadata.revision.source)
  const ranges = diffRanges(git(cwd, 'diff', '--no-ext-diff', '--unified=0', `${sha}...HEAD`, '--'))
  const changedFiles = git(cwd, 'diff', '--no-ext-diff', '--name-only', `${sha}...HEAD`, '--').split('\n').filter(Boolean)
  const screens = new Map<string, ScreenRef & { because: { file: string; lines: [number, number] }[] }>()
  const limits: string[] = []
  for (const range of ranges) {
    const file = relative(project.root, resolve(checkout.root, range.file))
    const matches = elements(captures, file, [range.from, range.to])
    for (const match of matches) {
      const scenario = (metadata.scenarios as Scenario[]).find(row => row.id === match.scenario)
      if (!scenario) continue
      const screen: ScreenRef & { because: { file: string; lines: [number, number] }[] } = screens.get(scenario.id) ?? { project: project.key, scenario: scenario.id, journey: scenario.journey, because: [] }
      if (!screen.because.some(row => row.file === range.file && row.lines[0] === range.from)) screen.because.push({ file: range.file, lines: [range.from, range.to] })
      screens.set(scenario.id, screen)
    }
  }
  for (const file of changedFiles) if (!elements(captures, relative(project.root, resolve(checkout.root, file))).length && project.sources.some((source: string) => resolve(checkout.root, file).startsWith(source + sep))) limits.push(`No saved capture renders ${file}, so CIVIC cannot name its screens.`)
  if (!captures.length) limits.push('No tagged captures have been saved for this source yet. Open a review to collect them.')
  return { revision: checkout.head, base, screens: [...screens.values()], limits: [...new Set(limits)] }
}

export async function coverage(cwd: string, projectPath?: string) {
  const manifest = projectPath ?? '.'
  const { project, metadata, hostStore, sharedStore } = await readProjectInventory(cwd, manifest, previewStore(cwd))
  const replays = Store.forCheckout(readCheckout(cwd)).replays().filter(row => row.project === project.key && row.source === metadata.revision.source)
  const dataDir = sharedStore ? join(hostStore, '.review-data') : join(hostStore, '.review-data/projects', project.key)
  const unshared = unsharedPassingReplays(dataDir, project.key, metadata.revision.source, replays)
  const scenarios = metadata.scenarios as Scenario[]
  const covered = new Set(replays.filter(row => row.outcome === 'pass').map(row => row.scenario))
  return {
    project: project.key, revision: readCheckout(cwd).head, evidenceAt: replays.map(row => row.replayedAt).sort().at(-1) ?? metadata.revision.capturedAt,
    screens: { total: scenarios.length, covered: scenarios.filter(row => covered.has(row.id)).length, uncovered: scenarios.filter(row => !covered.has(row.id)).map(row => ({ project: project.key, scenario: row.id, journey: row.journey })) },
    journeys: [...new Set(scenarios.map(row => row.journey))].map(id => {
      const screens = scenarios.filter(row => row.journey === id).map(row => row.id)
      const replay = replays.filter(row => screens.includes(row.scenario)).sort((a, b) => a.replayedAt.localeCompare(b.replayedAt)).at(-1)
      return { id, screens, lastReplay: replay ? replay.outcome === 'pass' ? 'passed' : 'diverged' : 'none', ...(replay?.divergedAt ? { divergedAt: replay.divergedAt } : {}) }
    }),
    backend: await readBackendCoverage(cwd, manifest, previewStore(cwd)),
    unsharedReplays: unshared,
    hints: unshared ? [`${unshared} passing replays recorded but not shared yet; run \`civic share-replays ${dataDir}\``] : [],
  }
}

export class ReviewSessions {
  private readonly sessions = new Map<string, { cwd: string; workRef: WorkRef; preview: Pick<Preview, 'origin'>; attached: boolean; close: () => Promise<void>; done: Promise<number> }>()

  async open(cwd: string, workRef: WorkRef, env: NodeJS.ProcessEnv, screens?: ScreenRef[], shots: Shot[] = [1440, 390].flatMap(viewport => (['light', 'dark'] as const).map(theme => ({ viewport, theme }))), previewUrl?: string) {
    const origin = previewUrl === undefined ? undefined : previewOrigin(previewUrl)
    const existing = [...this.sessions.entries()].find(([, session]) => session.cwd === cwd && session.workRef.system === workRef.system && session.workRef.id === workRef.id)
    const id = existing?.[0] ?? randomUUID()
    let session = existing?.[1]
    if (session && origin && session.preview.origin !== origin) throw new Error('Close the existing review before changing its preview address.')
    if (!session && origin) {
      session = { cwd, workRef, preview: { origin }, attached: true, close: async () => {}, done: Promise.resolve(0) }
      this.sessions.set(id, session)
    }
    if (!session) {
      let ready!: (value: { preview: Preview; close: () => Promise<void> }) => void
      const started = new Promise<{ preview: Preview; close: () => Promise<void> }>(resolve => { ready = resolve })
      const done = startPreview({ cwd, env, session: { id, workRef }, print: () => {}, keep: false, noOpen: true, allowDirty: true, ready: (preview, close) => ready({ preview, close }) })
      const running = await Promise.race([started, done.then(() => { throw new Error('Preview stopped before it was ready.') })])
      session = { cwd, workRef, ...running, done, attached: false }
      this.sessions.set(id, session)
    }
    try {
      const checkout = readCheckout(cwd)
      const store = Store.forCheckout(checkout, env)
      const local = await readProjectInventory(cwd, undefined, previewStore(cwd, env))
      const { project } = local
      const metadata = session.attached ? await previewInventory(session.preview.origin, local) : local.metadata
      if (metadata.scenarios.length && !store.taggedCaptures(project.key, metadata.revision.source).length) {
        const captures: TaggedCapture[] = []
        const browser = await launchBrowser(env)
        try {
          const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
          try {
            // The session cookie this sets is scoped to the preview's origin, unlike a header on every request.
            await page.goto(`${session.preview.origin}/review`, { waitUntil: 'load', timeout: 30_000 })
            for (const scenario of metadata.scenarios as Scenario[]) {
              await page.goto(`${session.preview.origin}/review-frame.html?scenario=${encodeURIComponent(scenario.id)}`, { waitUntil: 'load', timeout: 30_000 })
              await page.waitForFunction(() => document.querySelector('[data-rehearsal-ready="true"]') !== null, undefined, { timeout: 30_000 })
              const source = await page.evaluate(() => (globalThis as typeof globalThis & { reviewPreview?: { snapshot?: { revision?: { source?: string } } } }).reviewPreview?.snapshot?.revision?.source)
              if (source !== metadata.revision.source) throw new Error('The preview source changed before capture. Reopen the review.')
              captures.push(await taggedCapture(page, scenario.id))
            }
          } finally { await page.close() }
        } finally { await browser.close() }
        const current = session.attached ? await previewInventory(session.preview.origin, local) : (await readProjectInventory(cwd, undefined, previewStore(cwd, env))).metadata
        if (current.revision.source !== metadata.revision.source) throw new Error('Source changed during capture. Reopen the review.')
        for (const capture of captures) store.putTaggedCapture(project.key, metadata.revision.source, capture)
      }
      const base = git(cwd, 'for-each-ref', '--format=%(refname)', 'refs/heads/main').trim() || 'HEAD'
      const selected = screens ?? (await changedScreens(cwd, base, undefined, { ...local, metadata })).screens
      return { id, workRef, line: lineIdFor(checkout), revision: checkout.head, link: `${session.preview.origin}/review`, screens: selected.map(screen => ({ ...screen, shots })) }
    } catch (error) { await this.close(id); throw error }
  }

  async close(id: string) {
    const session = this.sessions.get(id)
    if (!session) throw new Error('That review session does not belong to this coordinator.')
    await session.close()
    await session.done
    this.sessions.delete(id)
  }

  async closeAll() { for (const id of this.sessions.keys()) await this.close(id) }
}

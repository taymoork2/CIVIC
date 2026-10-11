import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import {
  isAnchored,
  resolveAnchor,
  type Anchor,
  type Annotation,
  type AnchorOutcome,
  type Evidence,
  type Line,
  type ObservedElement,
  type Recapture,
  type WorkRequest,
} from '../../graph/src/index.ts'
import { worktreeFor } from './git.ts'
import { ensureCivicActor } from './identity.ts'
import { checkCountsIn, find, resolveId, summarize, type Context } from './loop.ts'

// Structural types for the part of Playwright CIVIC uses, so the rest of the package
// never depends on it. It is loaded only when a capture actually runs.
interface Locator { count(): Promise<number>; nth(index: number): Locator; getAttribute(name: string): Promise<string | null> }
interface Page {
  goto(url: string, options: { waitUntil: 'load'; timeout: number }): Promise<unknown>
  locator(selector: string): Locator
  getByTestId(testId: string): Locator
  getByRole(role: string, options: { name: string; exact: true }): Locator
  screenshot(options: { type: 'png' }): Promise<Uint8Array>
}
export interface Browser {
  newPage(options: { viewport: { width: number; height: number }; extraHTTPHeaders?: Record<string, string> }): Promise<Page & { close(): Promise<void> }>
  close(): Promise<void>
}

/** Launches headless Chromium with playwright-core. `CIVIC_BROWSER_PATH` or `CIVIC_BROWSER_CHANNEL` pick a browser. */
export async function launchBrowser(env: NodeJS.ProcessEnv = process.env): Promise<Browser> {
  const { chromium } = await import('playwright-core')
  if (env.CIVIC_BROWSER_PATH || env.CIVIC_BROWSER_CHANNEL) {
    return (await chromium.launch({
      headless: true,
      ...(env.CIVIC_BROWSER_PATH ? { executablePath: env.CIVIC_BROWSER_PATH } : {}),
      ...(env.CIVIC_BROWSER_CHANNEL ? { channel: env.CIVIC_BROWSER_CHANNEL } : {}),
    })) as unknown as Browser
  }
  // Playwright's own Chromium if it is installed, otherwise the machine's Chrome, as the journey engine uses.
  try {
    return (await chromium.launch({ headless: true })) as unknown as Browser
  } catch (error) {
    try {
      return (await chromium.launch({ headless: true, channel: 'chrome' })) as unknown as Browser
    } catch {
      throw new Error(`No browser for CIVIC's capture. Set CIVIC_BROWSER_PATH to a Chromium executable or install Chrome.\n${(error as Error).message.split('\n')[0]}`)
    }
  }
}

export interface ScenarioCapture {
  url: string
  outcome: AnchorOutcome
  png?: Uint8Array
}

/** The URL that opens an annotation's exact scenario on a preview. */
export function reproductionUrl(annotation: Annotation, preview: string): string {
  const path = annotation.capture?.reproduction ?? (annotation.seenOn.url ? pathOf(annotation.seenOn.url) : '/')
  return new URL(path, new URL(preview).origin).toString()
}

/**
 * Opens one annotation's scenario on a preview, finds its anchor by ID then exact locator
 * (never the nearest element), and takes a screenshot. Deterministic: no model call.
 */
export async function captureScenario(browser: Browser, annotation: Annotation, preview: string, bearer?: string): Promise<ScenarioCapture> {
  const url = reproductionUrl(annotation, preview)
  if (!isAnchored(annotation.anchor)) return { url, outcome: 'unanchored' }
  const page = await browser.newPage({ viewport: annotation.capture?.viewport ?? { width: 1280, height: 800 }, ...(bearer ? { extraHTTPHeaders: { authorization: `Bearer ${bearer}` } } : {}) })
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 })
    const { outcome } = resolveAnchor(annotation.anchor, await observe(page, annotation.anchor!))
    return { url, outcome, png: await page.screenshot({ type: 'png' }) }
  } finally {
    await page.close()
  }
}

/** Reads only the elements an anchor could name: those carrying its IDs, its test ID, or its role and name. */
async function observe(page: Page, anchor: Anchor): Promise<ObservedElement[]> {
  const observed: ObservedElement[] = []
  const collect = async (locator: Locator, extra: Partial<ObservedElement> = {}) => {
    const count = await locator.count()
    for (let index = 0; index < count; index++) {
      const element = locator.nth(index)
      const ids = await element.getAttribute('data-civic-id')
      const testId = await element.getAttribute('data-testid')
      observed.push({ civicIds: ids ? ids.split(/\s+/).filter(Boolean) : [], ...(testId ? { testId } : {}), ...extra })
    }
  }
  for (const id of anchor.targetIds) await collect(page.locator(`[data-civic-id~="${id}"]`))
  const locator = anchor.locator
  if (locator?.testId) await collect(page.getByTestId(locator.testId))
  else if (locator?.role && locator.name) await collect(page.getByRole(locator.role, { name: locator.name, exact: true }), { role: locator.role, name: locator.name })
  return observed
}

export interface RecaptureOptions {
  /** Run the request's counted acceptance checks in the fix's worktree. Default true. */
  runChecks?: boolean
  browser?: Browser
}

export interface RecaptureResult {
  request: WorkRequest
  recapture: Recapture
  /** Checks that were not run because no person wrote or accepted them. */
  skippedChecks: string[]
  /** Why a check could not run, by command. */
  checkNotes: Record<string, string>
}

/**
 * CIVIC's half of closing the loop (D38). Re-captures every annotation of a request on the
 * reported fix's preview, runs the acceptance checks a person wrote or accepted in the fix's
 * own worktree, and records the result as working-preview evidence written by CIVIC. In the
 * Auto lane CIVIC then resolves the request if every anchor was found and every check
 * passed, or reopens it for the agent if not. In the other lanes it waits for a person.
 */
export async function recapture(context: Context, id: string, options: RecaptureOptions = {}): Promise<RecaptureResult> {
  const document = context.store.read()
  const request = find<WorkRequest>(document, resolveId(document, id, 'request'), 'work-request')
  if (request.status !== 'fix-ready') throw new Error(`${request.id} is ${request.status}; CIVIC re-captures a request once a fix is reported.`)
  const fix = request.fixes.at(-1)!
  const line = find<Line>(document, fix.line, 'line')
  const preview = fix.preview ?? line.previews?.find((candidate) => candidate.revision === fix.revision)?.url
  if (!preview) throw new Error(`The fix on ${fix.line} names no preview. Report it again with --preview <url>.`)

  const bearer = bearerFor(context, preview)
  const browser = options.browser ?? (await launchBrowser())
  const anchors: Recapture['anchors'] = []
  try {
    for (const annotationId of request.annotationIds) {
      const shot = await captureScenario(browser, find<Annotation>(document, annotationId, 'annotation'), preview, bearer)
      anchors.push({ annotationId, outcome: shot.outcome, ...(shot.png ? { capture: context.store.putCapture(shot.png, 'image/png') } : {}) })
    }
  } finally {
    if (!options.browser) await browser.close()
  }

  const counted = checkCountsIn(document)
  const skippedChecks = request.acceptance.filter((check) => !counted(check)).map((check) => check.command)
  const checkNotes: Record<string, string> = {}
  const checks: Recapture['checks'] = []
  if (options.runChecks !== false) {
    const cwd = (line.source?.path && existsSync(line.source.path) ? line.source.path : undefined) ?? worktreeFor(context.checkout.root, line.ref)
    for (const check of request.acceptance.filter(counted)) {
      if (!cwd) {
        checks.push({ command: check.command, outcome: 'fail' })
        checkNotes[check.command] = `No worktree has ${line.ref} checked out, so the check could not run on the fix.`
        continue
      }
      const env = { ...process.env }
      delete env.CIVIC_AGENT
      const run = spawnSync(check.command, { cwd, shell: true, env, stdio: 'pipe', timeout: 15 * 60_000 })
      checks.push({ command: check.command, outcome: run.status === 0 ? 'pass' : 'fail' })
      if (run.status !== 0) checkNotes[check.command] = `Exited ${run.status ?? run.signal} in ${cwd}.`
    }
  }

  const result = context.store.transact((latest) => {
    const by = ensureCivicActor(latest)
    const current = find<WorkRequest>(latest, request.id, 'work-request')
    const currentFix = current.fixes.at(-1)!
    if (current.status !== 'fix-ready' || currentFix.at !== fix.at) throw new Error(`${request.id} changed while CIVIC was capturing; run recapture again.`)
    const at = (context.now ?? (() => new Date()))().toISOString()
    const found = anchors.every((anchor) => anchor.outcome === 'found-by-id' || anchor.outcome === 'found-by-locator')
    const passed = found && checks.length > 0 && checks.every((check) => check.outcome === 'pass')
    const evidenceId = `evidence:recapture.${request.id.slice('request:'.length)}.${current.fixes.length}`
    const evidence: Evidence = {
      id: evidenceId,
      kind: 'evidence',
      title: `CIVIC re-capture of ${current.title}`,
      subjectIds: [current.id, ...current.annotationIds],
      tier: 'working-preview',
      method: 'playwright',
      outcome: found && checks.every((check) => check.outcome === 'pass') ? 'pass' : 'fail',
      capturedAt: at,
      writtenBy: by,
      source: { tool: 'playwright', importer: 'civic-recapture', revision: currentFix.revision, line: currentFix.line, path: preview },
    }
    latest.records = latest.records.filter((record) => record.id !== evidenceId)
    latest.records.push(evidence)
    const recaptured: Recapture = { at, revision: currentFix.revision, anchors, checks, evidenceId }
    currentFix.recapture = recaptured
    if (summarize(latest, current, new Date(at)).lane === 'auto') {
      current.status = passed ? 'resolved' : 'reopened'
      current.history.push({
        status: current.status,
        by,
        at,
        note: passed ? 'Auto lane: every anchor found and every acceptance check passed.' : 'Auto lane: the re-capture did not find every anchor or a check failed.',
      })
      if (!passed) delete current.claim
    }
    return { request: structuredClone(current), recapture: recaptured }
  })
  return { ...result, skippedChecks, checkNotes }
}

/** The access key a preview registered with `civic preview --bearer-file`, read fresh for each capture. */
export function bearerFor(context: Pick<Context, 'store'>, preview: string): string | undefined {
  const file = context.store.previewAuth(new URL(preview).origin)
  if (!file) return undefined
  try {
    return readFileSync(file, 'utf8').trim() || undefined
  } catch {
    return undefined
  }
}

function pathOf(url: string): string {
  const parsed = new URL(url)
  return parsed.pathname + parsed.search
}

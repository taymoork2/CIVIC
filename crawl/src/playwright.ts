import type { Action, Driver, Observation } from './explore.ts'

// The web driver for CIVIC's crawl loop, on Playwright (D34). It reads states from the
// accessibility tree Playwright exposes (`ariaSnapshot`), acts through role and accessible
// name, and lets only GET requests to the app's own origin through, so a crawl can't write
// to a backend or reach another site.

interface Locator {
  ariaSnapshot(): Promise<string>
  first(): Locator
  count(): Promise<number>
  fill(value: string): Promise<void>
  click(options?: { timeout?: number }): Promise<void>
  evaluate<R>(fn: (element: never) => R): Promise<R>
}
interface Page {
  goto(url: string, options?: { waitUntil?: 'load' | 'networkidle' }): Promise<unknown>
  url(): string
  title(): Promise<string>
  locator(selector: string): Locator
  getByRole(role: string, options: { name: string; exact: true }): Locator
  getByLabel(text: string, options: { exact: true }): Locator
  waitForLoadState(state: 'load' | 'networkidle'): Promise<void>
}
interface Route {
  request(): { url(): string; method(): string }
  continue(): Promise<void>
  abort(): Promise<void>
}
interface Context {
  newPage(): Promise<Page>
  route(pattern: string, handler: (route: Route) => Promise<void>): Promise<void>
  close(): Promise<void>
}
interface FormField {
  required?: boolean
  name?: string
  labels?: ArrayLike<{ textContent: string | null }> | null
}
export interface Browser {
  newContext(options: { viewport: { width: number; height: number } }): Promise<Context>
  close(): Promise<void>
  version(): string
}

/** Headless Chromium through playwright-core. `CIVIC_BROWSER_PATH` or `CIVIC_BROWSER_CHANNEL` pick a browser, as for re-capture. */
export async function launchBrowser(env: NodeJS.ProcessEnv = process.env): Promise<Browser> {
  const { chromium } = await import('playwright-core')
  const choose = env.CIVIC_BROWSER_PATH ? { executablePath: env.CIVIC_BROWSER_PATH } : env.CIVIC_BROWSER_CHANNEL ? { channel: env.CIVIC_BROWSER_CHANNEL } : undefined
  if (choose) return (await chromium.launch({ headless: true, ...choose })) as unknown as Browser
  try {
    return (await chromium.launch({ headless: true })) as unknown as Browser
  } catch (error) {
    try {
      return (await chromium.launch({ headless: true, channel: 'chrome' })) as unknown as Browser
    } catch {
      throw new Error(`No browser for CIVIC's crawl. Set CIVIC_BROWSER_PATH to a Chromium executable or install Chrome.\n${(error as Error).message.split('\n')[0]}`)
    }
  }
}

/** Input values never become part of a state: `- textbox "Title": draft` reads as `- textbox "Title"`. */
export function stripValues(tree: string): string {
  return tree
    .split('\n')
    .map((line) => line.replace(/^(\s*- (?:textbox|searchbox|combobox|spinbutton|slider)(?: "[^"]*")?(?: \[[^\]]*\])*):.*$/, '$1'))
    .join('\n')
}

/** Links and buttons in document order, read from the accessibility tree. */
export function actionsIn(tree: string): Action[] {
  const actions: Action[] = []
  for (const match of tree.matchAll(/^\s*- (link|button) "((?:[^"\\]|\\.)*)"/gm)) {
    const action = { role: match[1] as Action['role'], name: match[2]!.replace(/\\(.)/g, '$1') }
    if (!actions.some((known) => known.role === action.role && known.name === action.name)) actions.push(action)
  }
  return actions
}

export function webDriver(browser: Browser, seed: string): Driver {
  const origin = new URL(seed).origin
  const base = new URL('.', seed).pathname
  let context: Context | undefined
  let page: Page | undefined
  let writes = 0
  const settle = async () => {
    await page!.waitForLoadState('load')
    await page!.waitForLoadState('networkidle')
  }
  return {
    async reset() {
      await context?.close()
      writes = 0
      context = await browser.newContext({ viewport: { width: 393, height: 852 } })
      await context.route('**/*', async (route) => {
        const request = route.request()
        if (new URL(request.url()).origin === origin && request.method() === 'GET') await route.continue()
        else {
          // An aborted write is an effect the crawl chose not to let through, not a dead control.
          if (request.method() !== 'GET') writes += 1
          await route.abort()
        }
      })
      page = await context.newPage()
      await page.goto(seed, { waitUntil: 'networkidle' })
    },
    async observe(): Promise<Observation> {
      const tree = stripValues(await page!.locator('body').ariaSnapshot())
      const url = new URL(page!.url())
      const actions = actionsIn(tree)
      for (const action of actions.filter((candidate) => candidate.role === 'button')) {
        // Runs in the page; typed structurally so the package needs no DOM types.
        const requires = await page!.getByRole('button', { name: action.name, exact: true }).first().evaluate((element: { form?: { elements: ArrayLike<FormField> } | null }) =>
          Array.from(element.form?.elements ?? []).filter((field) => field.required).map((field) => field.labels?.[0]?.textContent?.trim() || field.name || ''),
        )
        if (requires.length > 0) action.requires = requires
      }
      const location = url.origin === origin && url.pathname.startsWith(base) ? url.pathname.slice(base.length) : url.href
      return { location: location || 'index', title: await page!.title(), tree, actions, writes }
    },
    async act(action, inputs) {
      writes = 0
      for (const [label, value] of Object.entries(inputs)) {
        const field = page!.getByLabel(label, { exact: true })
        if ((await field.count()) > 0) await field.first().fill(value)
      }
      await page!.getByRole(action.role, { name: action.name, exact: true }).first().click({ timeout: 5000 })
      await settle()
    },
  }
}

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
  inputValue(): Promise<string>
  click(options?: { timeout?: number; clickCount?: number }): Promise<void>
  evaluate<R>(fn: (element: never) => R): Promise<R>
}
interface Page {
  goto(url: string, options?: { waitUntil?: 'load' | 'networkidle' }): Promise<unknown>
  url(): string
  title(): Promise<string>
  locator(selector: string): Locator
  getByRole(role: string, options: { name: string; exact: true }): Locator
  getByLabel(text: string, options: { exact: true }): Locator
  getByText(text: string): Locator
  evaluate(expression: string): Promise<unknown>
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

/**
 * Links, buttons, tabs, menu items and text fields in document order, read from the accessibility
 * tree. The tab that is already selected is not an action. A menu's items are in the tree only
 * once its button has opened it, so they are found in the state that click leads to.
 */
export function actionsIn(tree: string): Action[] {
  const actions: Action[] = []
  for (const match of tree.matchAll(/^\s*- (link|button|tab|menuitem|textbox) "((?:[^"\\]|\\.)*)"((?: \[[^\]]*\])*)/gm)) {
    if (match[1] === 'tab' && /\[selected\]/.test(match[3]!)) continue
    const action = { role: match[1] as Action['role'], name: match[2]!.replace(/\\(.)/g, '$1') }
    if (!actions.some((known) => known.role === action.role && known.name === action.name)) actions.push(action)
  }
  return actions
}

export interface WebDriverOptions {
  /** Passages of text to select, as a person drags across them, wherever the page shows them. */
  select?: string[]
}

export function webDriver(browser: Browser, seed: string, options: WebDriverOptions = {}): Driver {
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
      for (const passage of options.select ?? []) {
        const found = page!.getByText(passage).first()
        // A passage that is a link or button's own label is clicked, not selected, and a field's text is its value.
        if ((await found.count()) > 0 && !(await found.evaluate((element: { closest(selector: string): unknown }) => Boolean(element.closest('a, button, input, textarea, select, [role=button], [role=link], [role=tab], [role=menuitem]'))))) actions.push({ role: 'text', name: passage })
      }
      const location = url.origin === origin && url.pathname.startsWith(base) ? url.pathname.slice(base.length) : url.href
      return { location: location || 'index', title: await page!.title(), tree, actions, writes }
    },
    async act(action, inputs) {
      writes = 0
      for (const [label, value] of Object.entries(inputs)) {
        const field = page!.getByLabel(label, { exact: true })
        // A field already holding its value is left alone: filling it again would move focus and drop a text selection.
        if ((await field.count()) > 0 && (await field.first().inputValue().catch(() => undefined)) !== value) await field.first().fill(value)
      }
      if (action.role === 'text') {
        await page!.getByText(action.name).first().click({ clickCount: 3, timeout: 5000 })
        // The selection change is announced a moment later, and an app's toolbar follows it.
        await page!.evaluate('new Promise((done) => requestAnimationFrame(() => setTimeout(done, 50)))')
      } else if (action.role !== 'textbox') await page!.getByRole(action.role, { name: action.name, exact: true }).first().click({ timeout: 5000 })
      await settle()
    },
  }
}

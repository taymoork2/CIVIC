import { createHash } from 'node:crypto'

// CIVIC's crawl loop (D34, decision 0006): breadth-first exploration of an app's actionable
// elements through a platform driver, with states grouped by a hash of their accessibility
// hierarchy. Crawljax's state-flow graph is the design reference, not a dependency. The loop
// knows no platform: Playwright drives web today, and Appium can drive native through the same
// interface. Deterministic for a deterministic app, and no model calls (D30).

export const CRAWL_SCHEMA = 'civic.crawl/0'

/** Something a person can act on, named the way assistive technology names it. */
export interface Action {
  /**
   * `tab` and `menuitem` are clicked like buttons. A `textbox` is typed into with its allowlisted
   * value and left unsubmitted. `text` selects the passage of that name, as a person drags
   * across it, to show what the app offers on a selection (decision 0018).
   */
  role: 'link' | 'button' | 'tab' | 'menuitem' | 'textbox' | 'text'
  name: string
  /** For a button that submits a form: the form's required fields, by accessible name. */
  requires?: string[]
}

/** What the driver sees after it lands on a state. */
export interface Observation {
  /** Where the state lives, such as a URL path. Shown and used for IDs, never for grouping. */
  location: string
  title: string
  /** The accessibility hierarchy with input values left out. States with the same tree are one state. */
  tree: string
  /** Actionable elements in document order. */
  actions: Action[]
  /** Writes the app tried since the last action and the driver stopped, such as a POST on the web. */
  writes?: number
}

export interface Driver {
  /** Opens a fresh session at the seed, with no state carried over. */
  reset(): Promise<void>
  observe(): Promise<Observation>
  /** Fills the allowlisted inputs, performs the action, and waits for the app to settle. */
  act(action: Action, inputs: Record<string, string>): Promise<void>
}

export interface CrawlState {
  id: string
  location: string
  title: string
  hash: string
  depth: number
  /** The actions from the seed that reach this state, so it can be reached again. */
  path: Action[]
}

export interface CrawlTransition {
  from: string
  to: string
  action: Action
}

export interface Skipped {
  from: string
  action: Action
  reason: string
}

export interface CrawlResult {
  schema: typeof CRAWL_SCHEMA
  seed: string
  platform: string
  driver: string
  /** The app revision the crawl ran against, as the caller names it. */
  revision: string
  states: CrawlState[]
  transitions: CrawlTransition[]
  /** Actions not taken because they could destroy or send something. */
  blocked: Skipped[]
  /** Actions taken that changed nothing: same state, no write attempted. A dead or stale control, unless declared a no-op. */
  noEffect: Skipped[]
  /** Actions taken that couldn't complete, such as a form with a field the allowlist has no value for. */
  unreached: Skipped[]
  /** True when a limit stopped the crawl before every action was tried. */
  truncated: boolean
}

export interface CrawlOptions {
  seed: string
  platform: string
  driver: string
  revision: string
  /** Values for named inputs. A required field not listed here is never filled, and its form is not submitted. */
  inputs?: Record<string, string>
  maxStates?: number
  maxDepth?: number
  /** Extra action names to block, as regular expressions. */
  block?: string[]
  /** Action names declared to change nothing on purpose, as regular expressions, added to {@link NO_EFFECT_OK}. */
  noop?: string[]
}

/** Names that could destroy, pay, send or end a session. Matched on the accessible name, case-insensitive. */
export const DESTRUCTIVE = ['delete', 'remove', 'discard', 'erase', 'destroy', 'pay', 'purchase', 'buy', 'checkout', 'place order', 'send', 'submit payment', 'sign out', 'log out', 'logout', 'unsubscribe', 'cancel subscription', 'reset']

/** Actions that leave the screen as it was by design: they act on the clipboard, not the app. */
export const NO_EFFECT_OK = ['copy']

export const stateHash = (tree: string) => createHash('sha256').update(tree).digest('hex').slice(0, 16)

export async function crawl(driver: Driver, options: CrawlOptions): Promise<CrawlResult> {
  const inputs = options.inputs ?? {}
  const maxStates = options.maxStates ?? 50
  const maxDepth = options.maxDepth ?? 8
  const blockers = [...DESTRUCTIVE.map((word) => new RegExp(`\\b${word}\\b`, 'i')), ...(options.block ?? []).map((pattern) => new RegExp(pattern, 'i'))]
  const harmless = [...NO_EFFECT_OK, ...(options.noop ?? [])].map((pattern) => new RegExp(`\\b${pattern}\\b`, 'i'))
  const states: CrawlState[] = []
  const byHash = new Map<string, CrawlState>()
  const transitions: CrawlTransition[] = []
  const blocked: Skipped[] = []
  const unreached: Skipped[] = []
  const noEffect: Skipped[] = []
  const ids = new Set<string>()
  let truncated = false

  const reach = async (path: Action[]) => {
    await driver.reset()
    for (const step of path) await driver.act(step, inputs)
    return driver.observe()
  }
  const admit = (seen: Observation, path: Action[]): CrawlState => {
    const hash = stateHash(seen.tree)
    const known = byHash.get(hash)
    if (known) return known
    const state: CrawlState = { id: uniqueId(seen, hash, ids), location: seen.location, title: seen.title, hash, depth: path.length, path }
    states.push(state)
    byHash.set(hash, state)
    return state
  }

  const queue: CrawlState[] = [admit(await reach([]), [])]
  while (queue.length > 0) {
    const state = queue.shift()!
    const seen = await reach(state.path)
    for (const found of seen.actions) {
      const action: Action = { role: found.role, name: found.name }
      // A field with no allowlisted value is not something to type into; it is not an unreached action.
      if (found.role === 'textbox' && !(found.name in inputs)) continue
      if (blockers.some((pattern) => pattern.test(action.name))) {
        blocked.push({ from: state.id, action, reason: 'destructive action' })
        continue
      }
      const missing = (found.requires ?? []).filter((name) => !(name in inputs))
      if (missing.length > 0) {
        unreached.push({ from: state.id, action, reason: `no allowlisted value for ${missing.join(', ')}` })
        continue
      }
      await reach(state.path)
      await driver.act(action, inputs)
      const landed = await driver.observe()
      const hash = stateHash(landed.tree)
      // Typed text is left out of a state, and most passages offer nothing when selected, so neither is a dead control.
      if (hash === state.hash && !landed.writes && action.role !== 'textbox' && action.role !== 'text' && !harmless.some((pattern) => pattern.test(action.name))) noEffect.push({ from: state.id, action, reason: 'the screen did not change' })
      if (!byHash.has(hash) && (states.length >= maxStates || state.depth + 1 > maxDepth)) {
        truncated = true
        unreached.push({ from: state.id, action, reason: states.length >= maxStates ? `state limit ${maxStates}` : `depth limit ${maxDepth}` })
        continue
      }
      const isNew = !byHash.has(hash)
      const target = admit(landed, [...state.path, action])
      if (isNew) queue.push(target)
      if (!transitions.some((edge) => edge.from === state.id && edge.to === target.id && sameAction(edge.action, action))) transitions.push({ from: state.id, to: target.id, action })
    }
  }
  return { schema: CRAWL_SCHEMA, seed: options.seed, platform: options.platform, driver: options.driver, revision: options.revision, states, transitions, blocked, noEffect, unreached, truncated }
}

const sameAction = (a: Action, b: Action) => a.role === b.role && a.name === b.name

/** A readable, stable ID: the location, then the title where locations repeat, then the hash. */
function uniqueId(seen: Observation, hash: string, ids: Set<string>): string {
  const slug = (text: string) => text.toLowerCase().replace(/\.html?$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const base = slug(seen.location) || 'root'
  for (const candidate of [base, `${base}.${slug(seen.title) || 'untitled'}`, `${base}.${hash.slice(0, 8)}`]) {
    if (!ids.has(candidate)) {
      ids.add(candidate)
      return candidate
    }
  }
  throw new Error(`Two states share the hash ${hash}.`)
}

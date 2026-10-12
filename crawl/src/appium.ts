import type { Action, Driver, Observation } from './explore.ts'

// The native driver for CIVIC's crawl loop, on Appium (D34). It speaks the W3C WebDriver
// protocol to an Appium server over HTTP, so it needs no client library. It reads each state
// from the page source Appium returns (UiAutomator2 for Android, XCUITest for iOS), reduces it
// to roles and accessible names the way the web driver reads the accessibility tree, and acts
// on an element by its place in that source.

export type NativePlatform = 'android' | 'ios'

export interface SourceNode {
  tag: string
  attrs: Record<string, string>
  children: SourceNode[]
}

/** One element as the crawl sees it: a role, a name, and where it is in the page source. */
interface Seen {
  role: string
  name: string
  checked: boolean
  action?: Action['role']
  xpath: string
  depth: number
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, entity: string) =>
    entity[0] === '#' ? String.fromCodePoint(entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))) : (ENTITIES[entity] ?? whole),
  )

/** Parses Appium's page source: elements and attributes only, which is all a native source carries. */
export function parseSource(xml: string): SourceNode {
  const root: SourceNode = { tag: '#document', attrs: {}, children: [] }
  const stack = [root]
  for (const match of xml.matchAll(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([\w.:-]+)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g)) {
    const [, closing, tag, body, selfClosing] = match
    if (!tag) continue
    if (closing) {
      if (stack.length > 1 && stack.at(-1)!.tag === tag) stack.pop()
      continue
    }
    const attrs: Record<string, string> = {}
    for (const [, key, double, single] of (body ?? '').matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[key!] = decode(double ?? single ?? '')
    const node: SourceNode = { tag, attrs, children: [] }
    stack.at(-1)!.children.push(node)
    if (!selfClosing) stack.push(node)
  }
  const top = root.children[0]
  if (!top) throw new Error('The page source has no elements.')
  return top
}

const ANDROID_ROLES: [RegExp, string][] = [
  [/(EditText|AutoCompleteTextView|SearchView)$/, 'textbox'],
  [/(CheckBox|CheckedTextView)$/, 'checkbox'],
  [/(Switch|SwitchCompat|SwitchMaterial|ToggleButton)$/, 'switch'],
  [/RadioButton$/, 'radio'],
  [/(Button|ImageButton|FloatingActionButton)$/, 'button'],
  [/(SeekBar|RatingBar|Slider)$/, 'slider'],
  [/Spinner$/, 'combobox'],
  [/TextView$/, 'text'],
  [/ImageView$/, 'image'],
]

const IOS_ROLES: Record<string, string> = {
  Button: 'button',
  Link: 'link',
  Cell: 'cell',
  TextField: 'textbox',
  SecureTextField: 'textbox',
  SearchField: 'textbox',
  TextView: 'textbox',
  StaticText: 'text',
  Image: 'image',
  Switch: 'switch',
  Slider: 'slider',
  NavigationBar: 'navigation',
  TabBar: 'tablist',
  Alert: 'alert',
}

const truthy = (value: string | undefined) => value === 'true' || value === '1'

/** The text a person would hear for a node with no name of its own: its descendants' text, in order. */
const innerText = (node: SourceNode, platform: NativePlatform): string =>
  node.children
    .map((child) => (platform === 'android' ? child.attrs['content-desc'] || child.attrs.text : child.attrs.label || child.attrs.name) || innerText(child, platform))
    .filter(Boolean)
    .join(' ')

/** Reduces a page source to what a person can perceive and act on. Input values are never kept. */
export function readSource(root: SourceNode, platform: NativePlatform): Seen[] {
  const seen: Seen[] = []
  const walk = (node: SourceNode, xpath: string, depth: number) => {
    const visible = platform === 'android' ? node.attrs.displayed !== 'false' : node.attrs.visible !== 'false'
    if (!visible) return
    const kind = platform === 'android' ? (ANDROID_ROLES.find(([pattern]) => pattern.test(node.attrs.class ?? node.tag))?.[1] ?? 'group') : (IOS_ROLES[(node.attrs.type ?? node.tag).replace(/^XCUIElementType/, '')] ?? 'group')
    const enabled = node.attrs.enabled !== 'false'
    let name: string
    let action: Action['role'] | undefined
    if (platform === 'android') {
      // An input's text attribute is what was typed, so it's never a name.
      name = (kind === 'textbox' ? node.attrs['content-desc'] || node.attrs.hint : node.attrs['content-desc'] || node.attrs.text) ?? ''
      if (truthy(node.attrs.clickable) && enabled && kind !== 'textbox') {
        name ||= innerText(node, platform)
        action = 'button'
      }
    } else {
      name = (kind === 'textbox' ? node.attrs.label || node.attrs.placeholderValue || node.attrs.name : node.attrs.label || node.attrs.name) ?? ''
      if ((kind === 'button' || kind === 'link' || kind === 'cell') && enabled) {
        name ||= innerText(node, platform)
        action = kind === 'link' ? 'link' : 'button'
      }
    }
    const kept = name !== '' || kind !== 'group'
    if (kept) {
      const checked = platform === 'android' ? truthy(node.attrs.checked) : kind === 'switch' && truthy(node.attrs.value)
      seen.push({ role: kind, name: name.trim(), checked, ...(action && name.trim() ? { action } : {}), xpath, depth })
    }
    const counts = new Map<string, number>()
    for (const child of node.children) {
      const index = (counts.get(child.tag) ?? 0) + 1
      counts.set(child.tag, index)
      walk(child, `${xpath}/${child.tag}[${index}]`, kept ? depth + 1 : depth)
    }
  }
  walk(root, `/${root.tag}`, 0)
  return seen
}

/** The state's tree, in the shape of the web driver's: one line per perceivable element. */
export const treeOf = (seen: Seen[]) => seen.map((item) => `${'  '.repeat(item.depth)}- ${item.role}${item.name ? ` ${JSON.stringify(item.name)}` : ''}${item.checked ? ' [checked]' : ''}`).join('\n')

export function actionsOf(seen: Seen[]): Action[] {
  const actions: Action[] = []
  for (const item of seen) if (item.action && !actions.some((known) => known.role === item.action && known.name === item.name)) actions.push({ role: item.action, name: item.name })
  return actions
}

export interface AppiumOptions {
  /** The Appium server, such as `http://127.0.0.1:4723`. */
  server: string
  platform: NativePlatform
  /** The capabilities for each new session: the device, the automation name and the app. */
  capabilities: Record<string, unknown>
  /** The Android package the crawl stays in. A state in another app is recorded but not explored. */
  appPackage?: string
  /** How long to wait for the source to stop changing after an action. */
  settle?: { interval: number; tries: number }
}

/**
 * Every reset ends the session and starts a new one, so the app starts fresh each time, as
 * a new browser context does on the web. For that reason `appium:noReset` must not be set.
 */
export function appiumDriver(options: AppiumOptions): Driver & { close(): Promise<void> } {
  if (options.capabilities['appium:noReset'] === true) throw new Error('The crawl starts every try from a fresh app, so it cannot run with appium:noReset.')
  const server = options.server.replace(/\/$/, '')
  const settle = options.settle ?? { interval: 300, tries: 20 }
  const appPackage = options.appPackage ?? (options.capabilities['appium:appPackage'] as string | undefined)
  let session: string | undefined

  const call = async <T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${server}${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const payload = (await response.json().catch(() => ({}))) as { value?: T & { error?: string; message?: string } }
    if (!response.ok || (payload.value && typeof payload.value === 'object' && 'error' in payload.value)) {
      throw new Error(`Appium ${method} ${path}: ${payload.value?.error ?? response.status} ${payload.value?.message?.split('\n')[0] ?? ''}`.trim())
    }
    return payload.value as T
  }
  const at = (path: string) => `/session/${session}${path}`
  const read = async () => readSource(parseSource(await call<string>('GET', at('/source'))), options.platform)
  const find = async (xpath: string) => {
    const element = await call<Record<string, string>>('POST', at('/element'), { using: 'xpath', value: xpath })
    return element['element-6066-11e4-a52e-4a4ad4fa1653'] ?? element.ELEMENT
  }
  const outside = (root: SourceNode) => {
    if (options.platform !== 'android' || !appPackage) return undefined
    const packages = new Set(root.children.map((child) => child.attrs.package).filter(Boolean))
    return packages.size > 0 && !packages.has(appPackage) ? [...packages].join(', ') : undefined
  }

  return {
    async reset() {
      if (session) await call('DELETE', at(''))
      const created = await call<{ sessionId: string }>('POST', '/session', { capabilities: { alwaysMatch: options.capabilities, firstMatch: [{}] } })
      session = created.sessionId
      await settleSource()
    },
    async observe(): Promise<Observation> {
      const root = parseSource(await call<string>('GET', at('/source')))
      const elsewhere = outside(root)
      // The crawl leaves another app alone: it records reaching it and goes no further.
      if (elsewhere) return { location: `outside ${elsewhere}`, title: elsewhere, tree: `- outside ${JSON.stringify(elsewhere)}`, actions: [] }
      const seen = readSource(root, options.platform)
      const heading = options.platform === 'ios' ? seen.find((item) => item.role === 'navigation' && item.name) : undefined
      const title = (heading ?? seen.find((item) => item.role === 'text' && item.name))?.name ?? ''
      let location = heading?.name ?? ''
      if (options.platform === 'android') {
        location = await call<string>('GET', at('/appium/device/current_activity')).then((activity) => (activity.split('.').pop() ?? activity).replace(/(.)Activity$/, '$1')).catch(() => '')
      }
      return { location: location || title || 'screen', title, tree: treeOf(seen), actions: actionsOf(seen) }
    },
    async act(action, inputs) {
      const seen = await read()
      for (const [label, value] of Object.entries(inputs)) {
        const field = seen.find((item) => item.role === 'textbox' && item.name === label)
        if (!field) continue
        const id = await find(field.xpath)
        await call('POST', at(`/element/${id}/clear`), {})
        await call('POST', at(`/element/${id}/value`), { text: value })
      }
      const target = seen.find((item) => item.action === action.role && item.name === action.name)
      if (!target) throw new Error(`No ${action.role} named ${JSON.stringify(action.name)} on this screen.`)
      await call('POST', at(`/element/${await find(target.xpath)}/click`), {})
      await settleSource()
    },
    /** Ends the last session, so the device is free for the next run. */
    async close() {
      if (session) await call('DELETE', at(''))
      session = undefined
    },
  }

  /** Waits until two reads of the source in a row show the same tree. */
  async function settleSource() {
    let last = ''
    for (let attempt = 0; attempt < settle.tries; attempt += 1) {
      const tree = treeOf(await read())
      if (tree === last) return
      last = tree
      await new Promise((done) => setTimeout(done, settle.interval))
    }
  }
}

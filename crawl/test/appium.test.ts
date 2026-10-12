import assert from 'node:assert/strict'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { appiumDriver, crawl, parseSource, readSource, treeOf } from '../src/index.ts'

/**
 * A stand-in Appium server speaking the W3C WebDriver routes the driver uses. Each screen is
 * a page source; an element's `go` attribute is where clicking it leads, and its `needs`
 * attribute names a field that must hold text first. Typed text shows up in the source, as on
 * a device.
 */
async function fakeAppium(screens: Record<string, string>, start = 'home') {
  let at = start
  let typed: Record<string, string> = {}
  let sessions = 0
  let open: string | undefined
  const clicks: string[] = []
  const elements = new Map<string, string>()
  const source = () => screens[at]!.replace(/\{(\w+)\}/g, (_, key: string) => typed[key] ?? '')
  const resolve = (xpath: string) => {
    let node = { tag: '#document', attrs: {}, children: [parseSource(source())] } as ReturnType<typeof parseSource>
    for (const [, tag, index] of xpath.matchAll(/\/([\w.:-]+)(?:\[(\d+)\])?/g)) {
      const next = node.children.filter((child) => child.tag === tag)[Number(index ?? 1) - 1]
      if (!next) return undefined
      node = next
    }
    return node
  }
  const body = async (request: IncomingMessage) => {
    let text = ''
    for await (const chunk of request) text += chunk
    return text ? JSON.parse(text) : {}
  }
  const server = createServer(async (request, response) => {
    const reply = (status: number, value: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ value }))
    }
    const path = request.url!
    const input = await body(request)
    if (request.method === 'POST' && path === '/session') {
      sessions += 1
      open = `s${sessions}`
      at = start
      typed = {}
      return reply(200, { sessionId: open, capabilities: input.capabilities.alwaysMatch })
    }
    const match = path.match(/^\/session\/([^/]+)(\/.*)?$/)
    if (!match || match[1] !== open) return reply(404, { error: 'invalid session id', message: 'No such session' })
    const route = match[2] ?? ''
    if (request.method === 'DELETE' && route === '') {
      open = undefined
      return reply(200, null)
    }
    if (route === '/source') return reply(200, source())
    if (route === '/appium/device/current_activity') return reply(200, `.ui.${at[0]!.toUpperCase()}${at.slice(1)}Activity`)
    if (route === '/element') {
      if (!resolve(input.value)) return reply(404, { error: 'no such element', message: input.value })
      const id = `e${elements.size + 1}`
      elements.set(id, input.value)
      return reply(200, { 'element-6066-11e4-a52e-4a4ad4fa1653': id })
    }
    const action = route.match(/^\/element\/(\w+)\/(click|value|clear)$/)
    const node = action && resolve(elements.get(action[1]!) ?? '')
    if (!node) return reply(404, { error: 'stale element reference', message: route })
    const field = node.attrs['resource-id'] ?? node.attrs.name ?? ''
    if (action![2] === 'clear') typed[field.split('/').pop()!] = ''
    if (action![2] === 'value') typed[field.split('/').pop()!] = input.text
    if (action![2] === 'click') {
      clicks.push(node.attrs['content-desc'] || node.attrs.text || node.attrs.label || node.attrs.name || '')
      const needs = node.attrs.needs
      if (node.attrs.go && (!needs || typed[needs])) at = node.attrs.go
    }
    return reply(200, null)
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    clicks,
    sessions: () => sessions,
    open: () => open,
    close: () => new Promise<void>((done) => server.close(() => done())),
  }
}

const android = (activity: string, body: string, pkg = 'com.example.notes') =>
  `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy index="0" rotation="0"><android.widget.FrameLayout package="${pkg}" class="android.widget.FrameLayout" displayed="true" bounds="[0,0][1080,2400]"><android.widget.LinearLayout class="android.widget.LinearLayout" package="${pkg}" displayed="true"><android.widget.TextView class="android.widget.TextView" text="${activity}" package="${pkg}" displayed="true" clickable="false" enabled="true"/>${body}</android.widget.LinearLayout></android.widget.FrameLayout></hierarchy>`
const settle = { interval: 1, tries: 5 }
const options = { seed: 'com.example.notes', platform: 'android', driver: 'appium uiautomator2', revision: 'r1' }

test('reads a page source into roles and names, and never keeps what was typed', () => {
  const root = parseSource(
    android('Compose', '<android.widget.EditText class="android.widget.EditText" resource-id="com.example.notes:id/title" hint="Title" text="my secret draft" clickable="true" enabled="true" displayed="true"/><android.view.ViewGroup class="android.view.ViewGroup" clickable="true" enabled="true" displayed="true"><android.widget.TextView class="android.widget.TextView" text="Groceries &amp; more" displayed="true"/></android.view.ViewGroup><android.widget.Switch class="android.widget.Switch" text="Pin" checked="true" clickable="true" enabled="true" displayed="true"/><android.widget.Button class="android.widget.Button" text="Hidden" clickable="true" displayed="false"/>'),
  )
  const tree = treeOf(readSource(root, 'android'))
  assert.equal(tree.includes('secret'), false)
  assert.deepEqual(tree.split('\n'), ['- text "Compose"', '- textbox "Title"', '- group "Groceries & more"', '  - text "Groceries & more"', '- switch "Pin" [checked]'])
})

test('crawls a native Android app through Appium, blocking destructive actions and staying in the app', async () => {
  const fake = await fakeAppium({
    home: android('Notes', '<android.widget.Button class="android.widget.Button" text="New note" clickable="true" enabled="true" displayed="true" go="compose"/><android.widget.ImageButton class="android.widget.ImageButton" content-desc="Delete all notes" clickable="true" enabled="true" displayed="true" go="gone"/><android.widget.Button class="android.widget.Button" text="Help" clickable="true" enabled="true" displayed="true" go="browser"/>'),
    compose: android('Compose', '<android.widget.EditText class="android.widget.EditText" resource-id="com.example.notes:id/title" hint="Title" text="{title}" clickable="true" enabled="true" displayed="true"/><android.widget.Button class="android.widget.Button" text="Save note" clickable="true" enabled="true" displayed="true" go="saved" needs="title"/>'),
    saved: android('Saved', '<android.widget.Button class="android.widget.Button" text="Back to notes" clickable="true" enabled="true" displayed="true" go="home"/>'),
    gone: android('Empty', ''),
    browser: android('Help center', '<android.widget.Button class="android.widget.Button" text="Sign in" clickable="true" enabled="true" displayed="true" go="home"/>', 'com.android.chrome'),
  })
  try {
    const driver = appiumDriver({ server: fake.url, platform: 'android', capabilities: { platformName: 'Android', 'appium:automationName': 'UiAutomator2', 'appium:appPackage': 'com.example.notes' }, settle })
    const result = await crawl(driver, { ...options, inputs: { Title: 'Crawl note' } })
    await driver.close()
    assert.deepEqual(result.states.map((state) => [state.id, state.title]), [
      ['home', 'Notes'],
      ['compose', 'Compose'],
      ['outside-com-android-chrome', 'com.android.chrome'],
      ['saved', 'Saved'],
    ])
    assert.deepEqual(result.transitions.map((edge) => `${edge.from} ${edge.action.name} ${edge.to}`), [
      'home New note compose',
      'home Help outside-com-android-chrome',
      'compose Save note saved',
      'saved Back to notes home',
    ])
    assert.deepEqual(result.blocked.map((skip) => skip.action.name), ['Delete all notes'])
    assert.equal(fake.clicks.includes('Delete all notes'), false)
    assert.equal(fake.clicks.includes('Sign in'), false, 'nothing in another app is touched')
    assert.equal(fake.open(), undefined, 'the last session is ended')
  } finally {
    await fake.close()
  }
})

test('crawls a native iOS app, naming states by their navigation bar', async () => {
  const ios = (title: string, body: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><AppiumAUT><XCUIElementTypeApplication type="XCUIElementTypeApplication" name="Notes" label="Notes" enabled="true" visible="true"><XCUIElementTypeWindow type="XCUIElementTypeWindow" enabled="true" visible="true"><XCUIElementTypeNavigationBar type="XCUIElementTypeNavigationBar" name="${title}" enabled="true" visible="true"/>${body}</XCUIElementTypeWindow></XCUIElementTypeApplication></AppiumAUT>`
  const fake = await fakeAppium({
    home: ios('Notes', '<XCUIElementTypeCell type="XCUIElementTypeCell" enabled="true" visible="true" go="detail"><XCUIElementTypeStaticText type="XCUIElementTypeStaticText" value="Groceries" name="Groceries" label="Groceries" enabled="true" visible="true"/></XCUIElementTypeCell><XCUIElementTypeButton type="XCUIElementTypeButton" name="Settings" label="Settings" enabled="true" visible="true" go="settings"/>'),
    detail: ios('Groceries', '<XCUIElementTypeButton type="XCUIElementTypeButton" name="Notes" label="Notes" enabled="true" visible="true" go="home"/><XCUIElementTypeTextView type="XCUIElementTypeTextView" name="Body" value="milk, eggs" enabled="true" visible="true"/>'),
    settings: ios('Settings', '<XCUIElementTypeSwitch type="XCUIElementTypeSwitch" name="iCloud sync" label="iCloud sync" value="1" enabled="false" visible="true"/><XCUIElementTypeButton type="XCUIElementTypeButton" name="Sign Out" label="Sign Out" enabled="true" visible="true" go="home"/>'),
  })
  try {
    const driver = appiumDriver({ server: fake.url, platform: 'ios', capabilities: { platformName: 'iOS', 'appium:automationName': 'XCUITest', 'appium:bundleId': 'com.example.notes' }, settle })
    const result = await crawl(driver, { ...options, platform: 'ios', seed: 'com.example.notes' })
    await driver.close()
    assert.deepEqual(result.states.map((state) => state.id), ['notes', 'groceries', 'settings'])
    assert.ok(result.transitions.some((edge) => edge.from === 'notes' && edge.action.name === 'Groceries' && edge.to === 'groceries'))
    assert.deepEqual(result.blocked.map((skip) => skip.action.name), ['Sign Out'])
    assert.equal(fake.clicks.includes('Sign Out'), false)
  } finally {
    await fake.close()
  }
})

test('refuses capabilities that would carry app state from one try into the next', () => {
  assert.throws(() => appiumDriver({ server: 'http://127.0.0.1:4723', platform: 'android', capabilities: { 'appium:noReset': true } }), /noReset/)
})

// Against a real Appium server, when one is running: CIVIC_APPIUM_URL with CIVIC_APPIUM_CAPS
// (a JSON file of capabilities) and CIVIC_APPIUM_PLATFORM. Skipped everywhere else.
test('crawls through a real Appium server', { skip: !process.env.CIVIC_APPIUM_URL && 'set CIVIC_APPIUM_URL to run against a real Appium server' }, async () => {
  const { readFileSync } = await import('node:fs')
  const driver = appiumDriver({
    server: process.env.CIVIC_APPIUM_URL!,
    platform: (process.env.CIVIC_APPIUM_PLATFORM ?? 'android') as 'android' | 'ios',
    capabilities: JSON.parse(readFileSync(process.env.CIVIC_APPIUM_CAPS!, 'utf8')),
  })
  try {
    const result = await crawl(driver, { ...options, platform: process.env.CIVIC_APPIUM_PLATFORM ?? 'android', maxStates: 5 })
    assert.ok(result.states.length >= 1)
  } finally {
    await driver.close()
  }
})

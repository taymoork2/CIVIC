import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { actionsIn, crawl, launchBrowser, serveFolder, stripValues, webDriver, type Action, type Driver, type Observation } from '../src/index.ts'

/** A tiny app as a table: each screen's tree and where each action leads. */
function fakeApp(screens: Record<string, { actions: (Action & { to?: string })[]; tree?: string }>): Driver & { visits: string[] } {
  let at = 'home'
  const visits: string[] = []
  return {
    visits,
    async reset() {
      at = 'home'
    },
    async observe(): Promise<Observation> {
      const screen = screens[at]!
      return { location: `${at}.html`, title: at, tree: screen.tree ?? `heading ${at}`, actions: screen.actions.map(({ to: _to, ...action }) => action) }
    },
    async act(action) {
      const found = screens[at]!.actions.find((candidate) => candidate.role === action.role && candidate.name === action.name)
      if (!found?.to) throw new Error(`No ${action.name} on ${at}`)
      visits.push(`${at}>${found.to}`)
      at = found.to
    },
  }
}

const noEffectOf = (result: Awaited<ReturnType<typeof crawl>>) => result.noEffect.map((skip) => `${skip.from} ${skip.action.name}`)

const options = { seed: 'home.html', platform: 'web', driver: 'fake', revision: 'r1' }

test('explores breadth first, groups states by tree and records each transition once', async () => {
  const app = fakeApp({
    home: { actions: [{ role: 'link', name: 'Write', to: 'draft' }, { role: 'link', name: 'Archive', to: 'archive' }] },
    draft: { actions: [{ role: 'link', name: 'Back home', to: 'home' }] },
    archive: { actions: [{ role: 'link', name: 'Back home', to: 'home' }, { role: 'link', name: 'Home again', to: 'home' }] },
  })
  const result = await crawl(app, options)
  assert.deepEqual(result.states.map((state) => [state.id, state.depth]), [['home', 0], ['draft', 1], ['archive', 1]])
  assert.deepEqual(result.transitions.map((edge) => `${edge.from} ${edge.action.name} ${edge.to}`), [
    'home Write draft',
    'home Archive archive',
    'draft Back home home',
    'archive Back home home',
    'archive Home again home',
  ])
  assert.equal(result.truncated, false)
  assert.deepEqual(await crawl(fakeApp({ home: { actions: [] } }), options).then((again) => again.states.length), 1)
})

test('blocks destructive actions and never takes them', async () => {
  const app = fakeApp({
    home: { actions: [{ role: 'button', name: 'Delete note', to: 'gone' }, { role: 'link', name: 'Sign out', to: 'gone' }, { role: 'button', name: 'Wipe', to: 'gone' }] },
    gone: { actions: [] },
  })
  const result = await crawl(app, { ...options, block: ['^wipe$'] })
  assert.deepEqual(result.blocked.map((skip) => skip.action.name), ['Delete note', 'Sign out', 'Wipe'])
  assert.deepEqual(app.visits, [])
  assert.equal(result.states.length, 1)
})

test('submits a form only when every required field has an allowlisted value', async () => {
  const screens = {
    home: { actions: [{ role: 'button' as const, name: 'Save', requires: ['Title'], to: 'saved' }] },
    saved: { actions: [] },
  }
  const without = await crawl(fakeApp(screens), options)
  assert.deepEqual(without.unreached.map((skip) => skip.reason), ['no allowlisted value for Title'])
  assert.equal(without.states.length, 1)
  const withValue = await crawl(fakeApp(screens), { ...options, inputs: { Title: 'Crawl note' } })
  assert.deepEqual(withValue.states.map((state) => state.id), ['home', 'saved'])
  assert.deepEqual(withValue.transitions[0]?.action, { role: 'button', name: 'Save' })
})

test('a state limit stops the crawl and says so', async () => {
  const app = fakeApp({
    home: { actions: [{ role: 'link', name: 'A', to: 'a' }, { role: 'link', name: 'B', to: 'b' }] },
    a: { actions: [] },
    b: { actions: [] },
  })
  const result = await crawl(app, { ...options, maxStates: 2 })
  assert.equal(result.truncated, true)
  assert.deepEqual(result.unreached.map((skip) => [skip.action.name, skip.reason]), [['B', 'state limit 2']])
})

test('two screens at one location with different trees are two states with distinct IDs', async () => {
  const app = fakeApp({
    home: { actions: [{ role: 'button', name: 'Expand', to: 'open' }] },
    open: { actions: [], tree: 'heading home\nlist' },
  })
  // Same location for both: the fake reports `<screen>.html`, so make it collide.
  const colliding: Driver = { ...app, observe: async () => ({ ...(await app.observe()), location: 'home.html', title: 'Home' }) }
  const result = await crawl(colliding, options)
  assert.deepEqual(result.states.map((state) => state.id), ['home', 'home.home'])
})

test('reads actions and strips input values from an accessibility snapshot', () => {
  const tree = '- main:\n  - heading "Compose" [level=1]\n  - textbox "Title": my secret draft\n  - button "Save note"\n  - link "Back home":\n    - /url: index.html\n  - link "Say \\"hi\\""'
  assert.equal(stripValues(tree).includes('secret'), false)
  assert.ok(stripValues(tree).includes('- textbox "Title"'))
  assert.deepEqual(actionsIn(tree), [{ role: 'textbox', name: 'Title' }, { role: 'button', name: 'Save note' }, { role: 'link', name: 'Back home' }, { role: 'link', name: 'Say "hi"' }])
  const wide = '- tablist:\n  - tab "Overview" [selected]\n  - tab "Activity"\n- menu:\n  - menuitem "Rename"\n  - menuitem "Delete note"'
  assert.deepEqual(actionsIn(wide), [{ role: 'tab', name: 'Activity' }, { role: 'menuitem', name: 'Rename' }, { role: 'menuitem', name: 'Delete note' }])
})

test('crawls a real static app in a browser, without writing anything', async () => {
  const site = mkdtempSync(join(tmpdir(), 'civic-crawl-'))
  const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`
  writeFileSync(join(site, 'index.html'), page('Notes', '<a href="draft.html">Write note</a><button type="button" onclick="fetch(\'/api\', { method: \'POST\' })">Delete all</button>'))
  writeFileSync(join(site, 'draft.html'), page('Compose', '<form action="saved.html"><label for="t">Title</label><input id="t" name="t" required><button>Save note</button></form><a href="index.html">Back home</a>'))
  writeFileSync(join(site, 'saved.html'), page('Saved', '<a href="index.html">Back home</a>'))
  const server = await serveFolder(site)
  const browser = await launchBrowser()
  try {
    const seed = `${server.url}index.html`
    const blind = await crawl(webDriver(browser, seed), { ...options, seed: 'index.html' })
    assert.deepEqual(blind.states.map((state) => state.id), ['index', 'draft'])
    assert.deepEqual(blind.unreached.map((skip) => [skip.from, skip.action.name, skip.reason]), [['draft', 'Save note', 'no allowlisted value for Title']])
    assert.deepEqual(blind.blocked.map((skip) => skip.action.name), ['Delete all'])
    const result = await crawl(webDriver(browser, seed), { ...options, seed: 'index.html', inputs: { Title: 'Crawl note' } })
    assert.deepEqual(result.states.map((state) => [state.id, state.title]), [['index', 'Notes'], ['draft', 'Compose'], ['saved', 'Saved']])
    assert.ok(result.transitions.some((edge) => edge.from === 'draft' && edge.to === 'saved' && edge.action.name === 'Save note'))
    assert.deepEqual(readdirSync(site).sort(), ['draft.html', 'index.html', 'saved.html'])
    assert.equal(readFileSync(join(site, 'index.html'), 'utf8').includes('Delete all'), true)
  } finally {
    await browser.close()
    await server.close()
    rmSync(site, { recursive: true, force: true })
  }
})

test('an action that leaves the screen as it was is reported, unless it is declared a no-op or the app tried to write', async () => {
  const app = fakeApp({
    home: { actions: [{ role: 'button', name: 'Dead button', to: 'home' }, { role: 'button', name: 'Copy link', to: 'home' }, { role: 'button', name: 'Pin note', to: 'home' }, { role: 'link', name: 'Next', to: 'next' }] },
    next: { actions: [{ role: 'link', name: 'Back', to: 'home' }] },
  })
  const result = await crawl(app, { ...options, noop: ['^pin'] })
  // "Copy link" is a default no-op and "Pin note" is declared one; the dead button is the finding.
  assert.deepEqual(noEffectOf(result), ['home Dead button'])
  assert.equal(result.noEffect[0]!.reason, 'the screen did not change')
  assert.deepEqual(noEffectOf(await crawl(fakeApp({ home: { actions: [{ role: 'button', name: 'Dead button', to: 'home' }] } }), { ...options, noop: ['dead button'] })), [])
  // A write the driver stopped counts as an effect.
  const writing: Driver = { ...app, observe: async () => ({ ...(await app.observe()), writes: 1 }) }
  assert.deepEqual(noEffectOf(await crawl(writing, options)), [])
})

test('in a real browser, a dead button is reported and a button whose write was stopped is not', async () => {
  const site = mkdtempSync(join(tmpdir(), 'civic-crawl-'))
  writeFileSync(join(site, 'index.html'), '<!doctype html><html lang="en"><head><title>Notes</title></head><body><main><h1>Notes</h1><button type="button">Dead</button><button type="button" onclick="fetch(\'/api\', { method: \'POST\' })">Save note</button><button type="button" onclick="document.querySelector(\'h1\').textContent=\'Changed\'">Rename</button></main></body></html>')
  const server = await serveFolder(site)
  const browser = await launchBrowser()
  try {
    const result = await crawl(webDriver(browser, `${server.url}index.html`), { ...options, seed: 'index.html' })
    // "Save note" tried to write, and "Rename" changed the screen, where "Dead" and a second "Rename" do nothing.
    assert.deepEqual(noEffectOf(result), ['index Dead', 'index.notes Dead', 'index.notes Rename'])
    assert.equal(result.states.length, 2)
  } finally {
    await browser.close()
    await server.close()
    rmSync(site, { recursive: true, force: true })
  }
})

test('tabs and menu items are explored, a field is typed into only with an allowlisted value, and a menu item named like a destructive action is blocked', async () => {
  const screens = {
    home: { actions: [{ role: 'tab' as const, name: 'Activity', to: 'activity' }, { role: 'textbox' as const, name: 'Search', to: 'found' }, { role: 'textbox' as const, name: 'Card number', to: 'found' }] },
    activity: { actions: [{ role: 'menuitem' as const, name: 'Rename', to: 'renamed' }, { role: 'menuitem' as const, name: 'Delete note', to: 'gone' }] },
    found: { actions: [] },
    renamed: { actions: [] },
    gone: { actions: [] },
  }
  const result = await crawl(fakeApp(screens), { ...options, inputs: { Search: 'sync' } })
  assert.deepEqual(result.states.map((state) => state.id), ['home', 'activity', 'found', 'renamed'])
  assert.deepEqual(result.transitions.map((edge) => `${edge.action.role} ${edge.action.name}`), ['tab Activity', 'textbox Search', 'menuitem Rename'])
  assert.deepEqual(result.blocked.map((skip) => skip.action.name), ['Delete note'])
  assert.deepEqual(result.unreached, [], 'a field with no value is left alone, not reported as unreached')
  // Typing, and selecting a passage, that change nothing visible are not dead controls.
  const quiet = fakeApp({ home: { actions: [{ role: 'textbox', name: 'Search', to: 'home' }, { role: 'text', name: 'a passage', to: 'home' }] } })
  assert.deepEqual((await crawl(quiet, { ...options, inputs: { Search: 'x' } })).noEffect, [])
})

test('in a real browser, a tab, a menu, a typed search and a text selection each reach a state a link-and-button crawl never sees', async () => {
  const site = mkdtempSync(join(tmpdir(), 'civic-crawl-'))
  writeFileSync(join(site, 'index.html'), `<!doctype html><html lang="en"><head><title>Notes</title></head><body><main>
    <h1>Notes</h1>
    <div role="tablist"><button role="tab" aria-selected="true" id="t1">Notes</button><button role="tab" aria-selected="false" id="t2" onclick="document.getElementById('panel').textContent='Activity feed'">Activity</button></div>
    <p id="panel">Note list</p>
    <button aria-haspopup="menu" aria-expanded="false" id="m" onclick="this.setAttribute('aria-expanded','true');document.getElementById('menu').hidden=false">Options</button>
    <div role="menu" id="menu" hidden><button role="menuitem" onclick="document.getElementById('panel').textContent='Renamed'">Rename</button><button role="menuitem" onclick="document.getElementById('panel').textContent='Gone'">Delete note</button></div>
    <label for="q">Search</label><input id="q" oninput="document.getElementById('hits').textContent = this.value ? 'Results for ' + this.value : ''"><p id="hits"></p>
    <p id="quote">Remember to sync the notes</p><div id="bar" hidden><button type="button" onclick="document.getElementById('panel').textContent='Quoted'">Add to note</button></div>
    <script>document.addEventListener('selectionchange', () => { document.getElementById('bar').hidden = !String(getSelection()).includes('sync') })</script>
  </main></body></html>`)
  const server = await serveFolder(site)
  const browser = await launchBrowser()
  try {
    const seed = `${server.url}index.html`
    const wide = await crawl(webDriver(browser, seed, { select: ['sync the notes'] }), { ...options, seed: 'index.html', inputs: { Search: 'sync' }, maxDepth: 2 })
    const names = wide.transitions.map((edge) => `${edge.action.role} ${edge.action.name}`)
    for (const reached of ['tab Activity', 'button Options', 'menuitem Rename', 'textbox Search', 'text sync the notes', 'button Add to note']) assert.ok(names.includes(reached), `${reached} in ${names.join(', ')}`)
    assert.deepEqual([...new Set(wide.blocked.map((skip) => skip.action.name))], ['Delete note'])
    assert.ok(!names.includes('menuitem Delete note'))
  } finally {
    await browser.close()
    await server.close()
    rmSync(site, { recursive: true, force: true })
  }
})

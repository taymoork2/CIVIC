import { expect, test } from 'vitest'
import type { MapScreen } from './app-map'
import { findControl, replay, replayPath } from './replay'

const screen = (id: string, edges: MapScreen['edges']): MapScreen => ({ id, label: id, scenario: id, partial: false, edges })
const screens = [
  screen('home', [{ action: 'New note', destination: 'edit' }]),
  screen('edit', [{ action: 'Save', destination: 'saved' }, { action: 'Review first', destination: 'review' }, { action: 'Cancel', destination: 'home' }]),
  screen('review', [{ action: 'Back to draft', destination: 'edit' }]),
  screen('saved', [{ action: 'Back home', destination: 'home' }]),
  screen('orphan', []),
]

test('replays the shortest declared path and nothing when none reaches the screen', () => {
  expect(replayPath(screens, 'home', 'saved')).toEqual([{ from: 'home', action: 'New note', to: 'edit' }, { from: 'edit', action: 'Save', to: 'saved' }])
  expect(replayPath(screens, 'home', 'home')).toEqual([])
  expect(replayPath(screens, 'home', 'orphan')).toBeNull()
  expect(replayPath(screens, 'home', 'missing')).toBeNull()
})

/** A stand-in for a page: just the parts a replay reads, so no DOM library is needed. */
type Control = { tagName: string; textContent: string; disabled?: boolean; label?: string; getAttribute(name: string): string | null; click(): void }
const control = (tagName: string, textContent: string, extra: Partial<Control> = {}, onClick = () => {}): Control => ({ tagName, textContent, getAttribute: (name) => (name === 'aria-label' ? extra.label ?? null : null), click: onClick, ...extra })
const page = (controls: () => Control[]) => ({ querySelectorAll: () => controls() }) as unknown as Document

/** A tiny app: each screen shows buttons, and `wired` says where each one really goes. */
function app(wired: Record<string, Record<string, string>>) {
  let at = 'home'
  const doc = page(() => Object.keys(wired[at] ?? {}).map((name) => control('BUTTON', name, {}, () => { at = wired[at]![name]! })))
  return { document: () => doc, screen: () => at }
}
const fast = { timeout: 20, interval: 1 }

test('a replay clicks each declared action and lands where the path says', async () => {
  const result = await replay(app({ home: { 'New note': 'edit' }, edit: { Save: 'saved' }, saved: {} }), replayPath(screens, 'home', 'saved')!, (id) => id, fast)
  expect(result).toMatchObject({ done: 2 })
  expect(result.miss).toBeUndefined()
})

test('a replay stops visibly on a missing control or a wrong landing, and claims nothing past it', async () => {
  const path = replayPath(screens, 'home', 'saved')!
  expect(await replay(app({ home: { 'New note': 'edit' }, edit: { Publish: 'saved' } }), path, (id) => id, fast)).toMatchObject({ done: 1, miss: 'Replay stopped at edit: no control named “Save”.' })
  expect(await replay(app({ home: { 'New note': 'edit' }, edit: { Save: 'review' }, review: {} }), path, (id) => id, fast)).toMatchObject({ done: 1, miss: 'Replay stopped at edit: “Save” led to review, not saved.' })
  expect(await replay(app({ home: { 'New note': 'edit' }, edit: { Save: 'edit' } }), path, (id) => id, fast)).toMatchObject({ done: 1, miss: 'Replay stopped at edit: “Save” stayed here, not saved.' })
})

test('controls are found by their exact accessible name, and disabled ones are skipped', () => {
  const doc = page(() => [control('BUTTON', '💾', { label: 'Save note' }), control('BUTTON', 'Save', { disabled: true }), control('A', ' Back \n  home ')])
  expect(findControl(doc, 'Save note')?.tagName).toBe('BUTTON')
  expect(findControl(doc, 'Save')).toBeNull()
  expect(findControl(doc, 'Back home')?.tagName).toBe('A')
})

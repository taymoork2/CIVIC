import { renderToStaticMarkup } from '@/test/markup'
import { expect, test } from 'vitest'

import { Sheet, closeWatcherConstructor, dismissalFor, scrollToTop, warnBeforeUnload, watchSystemBack } from '@/kit/sheet'
import { assertPlainCopy } from '@/kit/test-copy'

test('a sheet is a dialog named by its title, with a labelled header close and actions after the body', () => {
  const markup = renderToStaticMarkup(
    <Sheet title="Soccer jersey" subtitle="Sam · Dark" onClose={() => undefined} footer={<button type="button">It's dirty</button>}>
      <p>Worn 2× since washed</p>
    </Sheet>,
  )
  const labelledBy = markup.match(/<div role="dialog" aria-modal="true" aria-labelledby="([^"]+)" class="sheet">/)?.[1]
  expect(labelledBy).toBeDefined()
  expect(markup).toContain(`<h2 id="${labelledBy}" tabindex="-1" class="sheet-title">Soccer jersey</h2>`)
  expect(markup).toContain('<p class="sheet-sub">Sam · Dark</p>')
  // The close icon is always available in the header; task actions remain below the body.
  expect(markup.indexOf('Worn 2×')).toBeLessThan(markup.indexOf('<footer'))
  expect(markup.indexOf('aria-label="Close"')).toBeLessThan(markup.indexOf('</header>'))
  expect(markup).not.toContain('>Close</button>')
  expect(markup).not.toContain('sheet-back')
  assertPlainCopy(markup)
})

test('a multi-step sheet puts Back top left, apart from Close in the footer', () => {
  const markup = renderToStaticMarkup(<Sheet title="How dirty?" onClose={() => undefined} onBack={() => undefined} closeLabel="Cancel">body</Sheet>)
  expect(markup).toMatch(/<header[^>]*><button type="button" class="sheet-back" aria-label="Back">/)
  expect(markup.indexOf('sheet-back')).toBeLessThan(markup.indexOf('sheet-title'))
  expect(markup).toContain('<button type="button" class="button secondary sheet-close">Cancel</button>')
})

test('a sheet can carry a kicker and its object\'s icon above the title', () => {
  const markup = renderToStaticMarkup(<Sheet title="Bath towel" kicker="from Washer 3" media={<svg />} onClose={() => undefined}>body</Sheet>)
  expect(markup).toContain('class="sheet-media"')
  expect(markup).toContain('<p class="sheet-kicker">from Washer 3</p>')
  expect(markup.indexOf('sheet-kicker')).toBeLessThan(markup.indexOf('<h2'))
})

test('record editing has a named header icon beside Back and freezes during saving', () => {
  const markup = renderToStaticMarkup(<Sheet title="Detergent" onClose={() => undefined} onBack={() => undefined} onEdit={() => undefined} editLabel="Edit details" busy>body</Sheet>)
  expect(markup).toContain('class="sheet-back sheet-edit"')
  expect(markup).toContain('inset-inline-start:calc(var(--space-3) + 2.75rem + 4px)')
  expect(markup).toContain('aria-label="Edit details" title="Edit details" disabled=""')
  expect(markup.indexOf('sheet-edit')).toBeLessThan(markup.indexOf('</header>'))
})

test('a staged form shows accessible progress dots in its header', () => {
  const markup = renderToStaticMarkup(<Sheet title="Garment details" progress={{ step: 3, total: 13 }} onClose={() => undefined}>body</Sheet>)
  expect(markup).toContain('role="progressbar" aria-label="Form progress" aria-valuemin="1" aria-valuemax="13" aria-valuenow="3" aria-valuetext="Step 3 of 13"')
  expect(markup.indexOf('role="progressbar"')).toBeLessThan(markup.indexOf('</header>'))
  expect(markup.match(/<span aria-hidden="true"/g)).toHaveLength(13)
})

test('an edit form keeps Cancel before Save in its compact action row', () => {
  const markup = renderToStaticMarkup(<Sheet title="Soccer jersey" onClose={() => undefined} closeLabel="Cancel" compactActions footer={<button type="button" className="button large">Save changes</button>}>form</Sheet>)
  expect(markup).toContain('class="sheet has-compact-actions"')
  expect(markup.indexOf('sheet-close')).toBeLessThan(markup.indexOf('Save changes'))
  expect(markup).not.toContain('sheet-foot-row')
  const saving = renderToStaticMarkup(<Sheet title="Soccer jersey" onClose={() => undefined} closeLabel="Cancel" compactActions busy />)
  expect(saving).toContain('class="button secondary sheet-close" disabled=""')
})

test('a form sheet has one labelled close icon in its header and only submit actions below', () => {
  const markup = renderToStaticMarkup(<Sheet title="Add clothes" onClose={() => undefined} closeAtTop footer={<button type="submit">Add to closet</button>}>form</Sheet>)
  expect(markup).toContain('aria-label="Close"')
  expect(markup.indexOf('aria-label="Close"')).toBeLessThan(markup.indexOf('</header>'))
  expect(markup).not.toContain('sheet-foot-row')
})

test('a new step scrolls the sheet body back to the top', () => {
  const body = { scrollTop: 480 }
  scrollToTop(body)
  expect(body.scrollTop).toBe(0)
  expect(() => scrollToTop(null)).not.toThrow()
})

test('closing a sheet with an unsaved draft asks before discarding it; a clean sheet just closes', () => {
  expect(dismissalFor(true)).toBe('confirm-discard')
  expect(dismissalFor(false)).toBe('close')
  // The question only appears after a dismissal attempt, never on open.
  const markup = renderToStaticMarkup(<Sheet title="Tide" onClose={() => undefined} dirty>form</Sheet>)
  expect(markup).not.toContain('Discard your changes?')
  expect(markup).toContain('sheet-close')
})

class FakeWatcher {
  static live: FakeWatcher[] = []
  oncancel: ((event: Event) => void) | null = null
  onclose: (() => void) | null = null
  constructor() { FakeWatcher.live.push(this) }
  destroy() { FakeWatcher.live = FakeWatcher.live.filter((entry) => entry !== this) }
  /** One Back press: a refusable cancel when there was a tap since the last one, then close unless refused. */
  back(activated: boolean) {
    if (activated) {
      const event = new Event('cancel', { cancelable: true })
      this.oncancel?.(event)
      if (event.defaultPrevented) return
    }
    this.destroy()
    this.onclose?.()
  }
}
const top = () => FakeWatcher.live.at(-1)!

test('system Back closes a clean sheet once and leaves no watcher behind', () => {
  FakeWatcher.live = []
  let closes = 0
  const stop = watchSystemBack(FakeWatcher, () => { closes += 1; return 'closed' })
  top().back(true)
  expect(closes).toBe(1)
  // The closed sheet unmounts, which disarms its watcher without a second close.
  stop()
  expect(FakeWatcher.live).toHaveLength(0)
  expect(closes).toBe(1)
  // With no tap first the browser skips the refusable step: still exactly one close.
  const again = watchSystemBack(FakeWatcher, () => { closes += 1; return 'closed' })
  top().back(false)
  expect(closes).toBe(2)
  again()
})

test('system Back on an unsaved draft asks, and Back keeps working while it asks', () => {
  FakeWatcher.live = []
  let asks = 0
  const stop = watchSystemBack(FakeWatcher, () => { asks += 1; return 'asked' })
  // The browser lets the page refuse: the same watcher stays armed.
  const first = top()
  first.back(true)
  expect(asks).toBe(1)
  expect(top()).toBe(first)
  // No tap since the last Back: the browser closes the watcher anyway, so a fresh one is armed.
  first.back(false)
  expect(asks).toBe(2)
  expect(FakeWatcher.live).toHaveLength(1)
  expect(top()).not.toBe(first)
  stop()
  expect(FakeWatcher.live).toHaveLength(0)
})

test('one Back reaches only the newest of two open sheets', () => {
  FakeWatcher.live = []
  const closed: string[] = []
  const stopLower = watchSystemBack(FakeWatcher, () => { closed.push('lower'); return 'closed' })
  const stopUpper = watchSystemBack(FakeWatcher, () => { closed.push('upper'); return 'closed' })
  top().back(true)
  expect(closed).toEqual(['upper'])
  stopUpper()
  top().back(true)
  expect(closed).toEqual(['upper', 'lower'])
  stopLower()
})

test('without a close watcher there is nothing to arm', () => {
  expect(closeWatcherConstructor({})).toBeNull()
  expect(closeWatcherConstructor({ CloseWatcher: FakeWatcher })).toBe(FakeWatcher)
})

test('leaving the page asks only while a draft is unsaved, without claiming it is kept', () => {
  const listeners = new Set<EventListener>()
  const target = {
    addEventListener: (type: string, listener: EventListener) => { expect(type).toBe('beforeunload'); listeners.add(listener) },
    removeEventListener: (type: string, listener: EventListener) => { expect(type).toBe('beforeunload'); listeners.delete(listener) },
  } as unknown as Window
  // A clean sheet registers nothing.
  warnBeforeUnload(target, false)
  expect(listeners.size).toBe(0)
  const stop = warnBeforeUnload(target, true)
  expect(listeners.size).toBe(1)
  const event = { defaultPrevented: false, returnValue: 'unset', preventDefault() { this.defaultPrevented = true } }
  for (const listener of listeners) listener(event as unknown as Event)
  // The browser's own prompt: no custom words, so nothing says the draft was saved.
  expect(event.defaultPrevented).toBe(true)
  expect(event.returnValue).toBe('')
  stop()
  expect(listeners.size).toBe(0)
})

test('a sheet can take its heading id from the content that it names', () => {
  const markup = renderToStaticMarkup(<Sheet title="What are you adding?" titleId="add-title" onClose={() => undefined}><div role="group" aria-labelledby="add-title" /></Sheet>)
  expect(markup).toContain('aria-labelledby="add-title" class="sheet"')
  expect(markup).toContain('<h2 id="add-title"')
})

test('a recovery prompt names the close action without suggesting it discards the draft', () => {
  const markup = renderToStaticMarkup(<Sheet title="Continue this product?" onClose={() => undefined} closeIconLabel="Close, keep draft for later" closeAtTop />)
  expect(markup).toContain('aria-label="Close, keep draft for later"')
})

import { expect, test } from 'vitest'

import { LoadSummary, garmentLabel, loadSummaryActionClassName, washOrigins } from '@/laundry/load-summary'
import { renderToStaticMarkup } from '@/test/markup'
import { LoadSummaryView } from '@/laundry/session-view'
import { assertPlainCopy, readableText } from '@/kit/test-copy'

const tee = (extra: { color?: string; guest?: boolean } = {}) => ({ name: 'T-shirt', color: 'White', colorGroup: 'light', ...extra })

test('matching pieces count together; a guest piece or another color keeps its own entry', () => {
  const html = renderToStaticMarkup(<LoadSummary stage="washing" origins={['Washer 3']} pieces={[tee(), tee(), tee({ guest: true }), tee({ color: 'Black' })]} />)
  const text = readableText(html)
  expect(html.match(/<li>/g)).toHaveLength(3)
  expect(text).toContain('T-shirt, White ×2')
  expect(text).toContain('T-shirt, White (Guest item)')
  expect(text).toContain('T-shirt, Black')
  expect(text).toContain('4 pieces')
  expect(html).toContain('aria-label="This load"')
  assertPlainCopy(html)
})

test('a dryer run that combines several washes names every wash origin once', () => {
  expect(washOrigins(['Washer 3', 'Washer 5', 'Washer 3', null, ''])).toEqual(['Washer 3', 'Washer 5'])
  const two = readableText(renderToStaticMarkup(<LoadSummary stage="check_due" origins={['Washer 3', 'Washer 5']} pieces={[tee()]} />))
  expect(two).toContain('From Washer 3 and Washer 5')
  const three = readableText(renderToStaticMarkup(<LoadSummary stage="check_due" origins={['Washer 3', 'Washer 5', 'Washer 7']} pieces={[tee()]} />))
  expect(three).toContain('From Washer 3, Washer 5, and Washer 7')
})

test('the stage reads as text, a due check never reads as dry, and at most one action shows', () => {
  const due = renderToStaticMarkup(<LoadSummary stage="check_due" origins={['Washer 3']} pieces={[tee()]} />)
  expect(readableText(due)).toContain('Check dryness')
  expect(due).not.toMatch(/<a |<button/)
  const next = renderToStaticMarkup(<LoadSummary stage="queued_to_dry" origins={['Washer 3']} pieces={[tee()]}
    action={<a className={loadSummaryActionClassName} href="/drying">See drying plan</a>} />)
  expect(readableText(next)).toContain('Waiting to dry')
  expect(next.match(/<a /g)).toHaveLength(1)
  expect(next).toContain('href="/drying"')
  for (const [stage, words] of [['preparing', 'Getting ready'], ['wash_done', 'Washed'], ['to_put_away', 'To put away'], ['put_away', 'Put away']] as const) {
    expect(readableText(renderToStaticMarkup(<LoadSummary stage={stage} origins={[]} pieces={[]} />))).toContain(words)
  }
})

test('a garment saved with the older Grey reads Gray in the load summary label', () => {
  expect(garmentLabel({ name: 'Grey T-shirt', color: 'Grey' })).toBe('Grey T-shirt, Gray')
  // A name that already says its color stands alone; one that does not gets the color after it.
  expect(garmentLabel({ name: 'Black tee', color: 'Black' })).toBe('Black tee')
  expect(garmentLabel({ name: 'Work shirt', color: 'Navy' })).toBe('Work shirt, Navy')
  expect(garmentLabel({ name: 'Off-white blouse', color: 'White' })).toBe('Off-white blouse')
})

test('a step that fails after the load completes (Hang them, Wait for the dryer) shows its error on the summary', () => {
  const props = { detail: { status: 'completed' as const, machineName: 'Washer 14', cycle: 'normal', completedAt: 0, usage: [], doorLocks: false, textiles: [] }, record: undefined, now: 0, system: 'metric' as const, back: null, footer: null, pieceLink: () => null }
  const failed = renderToStaticMarkup(<LoadSummaryView {...props} error="The rack is full." />)
  expect(failed).toContain('role="alert"')
  expect(readableText(failed)).toContain('The rack is full.')
  expect(renderToStaticMarkup(<LoadSummaryView {...props} />)).not.toContain('role="alert"')
})

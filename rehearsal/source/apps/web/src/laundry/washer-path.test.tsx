import { expect, test } from 'vitest'
import { renderToStaticMarkup } from '@/test/markup'
import { WasherPathScreen, type WasherPathView } from '@/laundry/washer-path'

const noop = () => {}
const blocked: WasherPathView = {
  number: 1, loadTitle: 'Whites load', itemsLine: 'White tee ×2', shared: true,
  washer: { label: 'Washer 14', fact: 'Front-loading · HE' }, refusal: null,
  recipe: [], changes: [], confirmed: false, ready: false,
  requirements: 'Mia (fragrance-free)',
  products: [{ supplyId: 'detergent', name: 'Detergent', fact: 'Liquid', detergent: true, ranOut: false }],
  detergent: null,
  problems: [{ source: { kind: 'product', id: 'detergent' }, name: 'Detergent', issues: [{
    reasonId: 'restriction', kind: 'conflict', blocking: true, title: 'Fragrance is not confirmed',
    actions: [{ label: 'Leave product out', action: { kind: 'leave-out-product', supplyId: 'detergent' } }],
  }] }],
}

const markup = (view: WasherPathView, pending = false) => renderToStaticMarkup(
  <WasherPathScreen view={view} pending={pending} options={[]} onPick={noop} onConfirm={noop} onContinue={noop} onBack={noop} onRunAction={noop} />,
)

test('washer confirmation is available before load issues are resolved, without offering Chemistry', () => {
  const before = markup(blocked)
  expect(before).toContain('Confirm recipe for Washer 14')
  expect(before).not.toContain('See what goes in')
  expect(before).toContain('Mia (fragrance-free)')
  expect(before).toContain('Leave product out')
  const after = markup({ ...blocked, confirmed: true })
  expect(after).toContain('Review issues')
  expect(after).toContain('1 issue to resolve')
  expect(after).not.toContain('See what goes in')
})

test('a ready confirmed load offers Chemistry while a refused washer does not', () => {
  expect(markup({ ...blocked, confirmed: true, ready: true, problems: [] })).toContain('See what goes in')
  const refused = markup({ ...blocked, confirmed: true, refusal: 'This washer lacks the recorded compartment.' })
  expect(refused).toContain('Pick another washer')
  expect(refused).not.toContain('See what goes in')
})

test('named blocking issues prevent Chemistry even when a washer-level ready flag is true', () => {
  expect(markup({ ...blocked, ready: true, confirmed: true })).not.toContain('See what goes in')
  const unavailable = markup({ ...blocked, problems: [], confirmed: true })
  expect(unavailable).toContain('Review this load before washing')
  expect(unavailable).not.toContain('1 issue to resolve')
})

test('pending updates disable issue actions as well as the main confirmation', () => {
  const html = markup(blocked, true)
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
  const guarded = buttons.filter((button) => /Leave product out|Confirm recipe/.test(button[2]!))
  expect(guarded).toHaveLength(2)
  expect(guarded.every((button) => /\bdisabled(?:=|\s|$)/.test(button[1]!))).toBe(true)
})

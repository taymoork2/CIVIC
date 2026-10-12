import { expect, test } from 'vitest'
import { renderToStaticMarkup } from '@/test/markup'
import { LoadScreen } from '@/laundry/load-screen'
import type { SourceGroup, SourceIssue } from '@/products/source-issues'

const held: SourceIssue = { reasonId: 'h', kind: 'conflict', blocking: true, held: true, title: 'Wool waits for a safe product', actions: [{ label: 'Add a safe product', action: { kind: 'add-product' } }] }
const open: SourceIssue = { reasonId: 'o', kind: 'confirm', blocking: true, title: 'Check the tag', actions: [{ label: 'Check the tag', action: { kind: 'inspect-stain', textileId: 'tee' } }] }
const group = (id: string, issue: SourceIssue): SourceGroup => ({ source: { kind: 'garment', id }, name: id, issues: [issue] })
const render = (problems: SourceGroup[], pieces: number) => renderToStaticMarkup(
  <LoadScreen
    view={{ number: 1, items: Array.from({ length: pieces }, (_, index) => ({ colorGroup: 'dark', id: `p${index}` })), dry: null, stains: [], cautions: [], blockers: [], why: null } as never}
    review={{ garments: [], leftOut: [], products: { detergent: null, pretreat: [], softener: null, other: [] }, requirements: null } as never}
    start="blocked" pending={false} loadCount={1} allowMove={false} problems={problems}
    washer={{ title: 'Washer', fact: '' }} otherClassNote={null}
    next={{ label: 'x', remaining: problems.length, issue: null, onClick: () => undefined }}
    onResolve={undefined} onAtRoom={() => undefined} openLink={null} onRunAction={() => undefined} onMove={() => undefined} onNotThisTime={() => undefined}
    onQuantity={() => undefined} onPutBack={() => undefined} onPickDetergent={() => undefined} onToggleSoftener={() => undefined} onBack={() => undefined} />,
)

test('a held-only load shows no "to resolve" count and no room link', () => {
  const text = render([group('wool', held)], 1)
  expect(text).not.toMatch(/to resolve/i)
  expect(text).not.toContain('At the room?')
})

test('a held piece beside an open question counts only the open one and keeps the room link while a piece can be washed', () => {
  const text = render([group('wool', held), group('tee', open)], 2)
  expect(text).toContain('1 of 1 to resolve')
  expect(text).toContain('At the room?')
})

test('the room link goes when every piece in the load is held', () => {
  const text = render([group('wool', held), group('silk', held), group('tee', open)], 2)
  expect(text).toContain('1 of 1 to resolve')
  expect(text).not.toContain('At the room?')
})

import { expect, test } from 'vitest'

import type { PlanQuestion } from '@/laundry/laundry-pass'
import { blockingCount, nextCheck, sourceGroups, type BlockedItem, type SourceNames } from '@/products/source-issues'

type Reasons = Parameters<typeof sourceGroups>[1]
const reason = (id: string, code: string, details: Record<string, unknown> = {}) => ({ id, code, details, severity: 'info' }) as unknown as Reasons[number]
const names: SourceNames = {
  garment: (id) => ({ shirt: 'White shirt', towel: 'Bath towel' } as Record<string, string>)[id] ?? null,
  product: (id) => (id === 'tide' ? 'Tide' : null),
  washer: () => 'Washer',
}
const item = (overrides: Partial<BlockedItem>) => ({ reasonId: 'r', source: { kind: 'garment', id: 'shirt' }, kind: 'confirm', blocking: true, ...overrides }) as BlockedItem
const tagQuestion = { kind: 'care_unknown', key: { kind: 'care_unknown', subjectId: 'towel', context: {} }, subjectIds: ['towel'], context: {} } as unknown as PlanQuestion

test('only a supported pretreatment suggestion offers a named choice, alongside stain inspection', () => {
  const groups = sourceGroups([item({ supplyIds: ['tide'] })], [reason('r', 'needs_confirmation', { cause: 'pretreatment_choice_needed' })], [], 'load-1', names)
  expect(groups[0]!.issues[0]!.actions.map((entry) => entry.action)).toEqual([
    { kind: 'choose-pretreatment', textileId: 'shirt', supplyId: 'tide' },
    { kind: 'inspect-stain', textileId: 'shirt' },
    { kind: 'leave-out-garment', textileId: 'shirt' },
  ])
  for (const cause of ['unknown_stain_report', 'stain_care_conflict', 'unsupported_stain_chemistry']) {
    const actions = sourceGroups([item({ supplyIds: ['tide'] })], [reason('r', 'needs_confirmation', { cause })], [], 'load-1', names)[0]!.issues[0]!.actions
    expect(actions.some((entry) => entry.action.kind === 'choose-pretreatment')).toBe(false)
    expect(actions[0]?.action.kind).toBe('inspect-stain')
  }
})

test('oxygen bleach with a do-not-bleach shirt reads as one product–garment conflict that does not block the load', () => {
  const groups = sourceGroups(
    [item({ reasonId: 'bleach', source: { kind: 'product', id: 'tide' }, kind: 'conflict', blocking: false, textileIds: ['shirt'] })],
    [reason('bleach', 'product_left_out', { cause: 'tag_forbids_bleach' })],
    [], 'load-1', names,
  )
  expect(groups).toHaveLength(1)
  expect(groups[0]!.name).toBe('Tide')
  expect(groups[0]!.issues[0]).toMatchObject({ kind: 'conflict', blocking: false, title: "Tide can't be used with White shirt", detail: 'Left out of this wash because the tag says do not bleach.', actions: [] })
  expect(blockingCount(groups)).toBe(0)
  expect(nextCheck(groups)).toBeNull()
})

test('a blocking product restriction offers another product or leaving the garment out, never an override', () => {
  const groups = sourceGroups(
    [item({ reasonId: 'restrict', source: { kind: 'product', id: 'tide' }, kind: 'conflict', blocking: true, textileIds: ['shirt'] })],
    [reason('restrict', 'product_restriction', { cause: 'garment_product_conflict' })],
    [], 'load-1', names,
  )
  const actions = groups[0]!.issues[0]!.actions
  expect(actions.map((entry) => entry.label)).toEqual(['Use another product', 'Leave White shirt out'])
  expect(actions.map((entry) => entry.action)).toEqual([{ kind: 'leave-out-product', supplyId: 'tide' }, { kind: 'leave-out-garment', textileId: 'shirt' }])
  expect(nextCheck(groups)?.label).toBe('Use another product')
})

test('a garment waiting on its tag sits under that garment, and the tag question is the next check', () => {
  const groups = sourceGroups(
    [
      item({ reasonId: 'care', source: { kind: 'garment', id: 'towel' } }),
      item({ reasonId: 'care-again', source: { kind: 'garment', id: 'towel' } }),
    ],
    [reason('care', 'needs_confirmation', { cause: 'unknown_care' }), reason('care-again', 'needs_confirmation', { cause: 'unknown_care' })],
    [tagQuestion], 'load-1', names,
  )
  expect(groups.map((group) => [group.source, group.name])).toEqual([[{ kind: 'garment', id: 'towel' }, 'Bath towel']])
  // The same problem twice reads once.
  expect(groups[0]!.issues).toHaveLength(1)
  expect(groups[0]!.issues[0]!.actions.map((entry) => entry.label)).toEqual(['Answer from the tag', 'Leave out'])
  expect(nextCheck(groups)?.action).toEqual({ kind: 'question', question: tagQuestion })
  expect(blockingCount(groups)).toBe(1)
})

test('an unnamed source still gets a readable row name', () => {
  const groups = sourceGroups([item({ source: { kind: 'garment', id: 'gone' } })], [], [], null, names)
  expect(groups[0]!.name).toBe('A garment')
  expect(groups[0]!.issues[0]!.title).toBe('Needs a closer look')
})

test('a product restriction can leave all affected pieces out of this wash, deduplicating their IDs', () => {
  const groups = sourceGroups(
    [item({ reasonId: 'restrict', source: { kind: 'product', id: 'tide' }, kind: 'conflict', blocking: true, textileIds: ['shirt', 'towel', 'shirt'] })],
    [reason('restrict', 'product_restriction', { cause: 'garment_product_conflict' })],
    [], 'load-1', names,
  )
  expect(groups[0]!.issues[0]!.actions).toContainEqual({
    label: 'Leave these 2 pieces out', action: { kind: 'leave-out-garments', textileIds: ['shirt', 'towel'] },
  })
  const informational = sourceGroups(
    [item({ source: { kind: 'product', id: 'tide' }, blocking: false, textileIds: ['shirt', 'towel'] })],
    [], [], 'load-1', names,
  )
  expect(informational[0]!.issues[0]!.actions).toEqual([])
})

test('a wool piece held for its detergent shows one plain line and options, not a to-resolve block', () => {
  for (const [cause, line] of [['protein_fiber_enzyme', 'Waits for a wool-safe detergent. Tide has enzymes that harm wool.'], ['protein_fiber_enzyme_unknown', "Waits for a wool-safe detergent. We couldn't confirm that Tide has no enzymes."]] as const) {
    const held = sourceGroups([item({ kind: 'conflict', supplyIds: ['tide'] })], [reason('r', 'product_restriction', { cause })], [], null, { ...names, handWashOk: () => true, icon: () => ({ kind: 'sweater', colorGroup: 'dark' }) })
    expect(held[0]!.icon).toEqual({ kind: 'sweater', colorGroup: 'dark' })
    expect(held[0]!.issues[0]).toMatchObject({ held: true, title: line })
    expect(held[0]!.issues[0]!.actions.map((entry) => entry.action)).toEqual([{ kind: 'add-product' }, ...(cause === 'protein_fiber_enzyme_unknown' ? [{ kind: 'find-pack', supplyId: 'tide' }] : []), { kind: 'leave-out-garment', textileId: 'shirt' }])
  }
  const noHandWash = sourceGroups([item({ kind: 'conflict', supplyIds: ['tide'] })], [reason('r', 'product_restriction', { cause: 'protein_fiber_enzyme' })], [], null, { ...names, handWashOk: () => false })
  expect(noHandWash[0]!.issues[0]!.actions.map((entry) => entry.action)).toEqual([{ kind: 'add-product' }])
})

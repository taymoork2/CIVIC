import { expect, test } from 'vitest'

import { laundrySearch } from '@/laundry/laundry-search'

test('Laundry keeps an open plan and a first-run hamper, and drops anything else', () => {
  expect(laundrySearch({})).toEqual({})
  expect(laundrySearch({ plan: 'p1', add: 'hamper' })).toEqual({ plan: 'p1', add: 'hamper' })
  // An older `planId` link (the old /planner and /wash addresses) opens the same plan.
  expect(laundrySearch({ planId: 'p2' })).toEqual({ plan: 'p2' })
  expect(laundrySearch({ plan: 'p1', planId: 'p2' })).toEqual({ plan: 'p1' })
  expect(laundrySearch({ plan: 3, add: 'closet', other: 'x' })).toEqual({})
  expect(laundrySearch({ item: 'textile_123' })).toEqual({ item: 'textile_123' })
  expect(laundrySearch({ item: '../bad' })).toEqual({})
})

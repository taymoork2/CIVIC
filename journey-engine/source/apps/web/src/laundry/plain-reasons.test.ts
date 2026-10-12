import { expect, test } from 'vitest'

import { exclusionWords, fallbackWords, loadCautionWords, pinRefusalWords } from '@/laundry/plain-reasons'
import { assertPlainCopy } from '@/kit/test-copy'

test('why a garment is left out, from its code, cause and method', () => {
  const veto = (method: string) => exclusionWords({ code: 'care_prohibition', details: { cause: 'care_label_prohibition', method } }).text
  expect(veto('dry_clean_only')).toBe('Dry clean only')
  expect(veto('hand_wash')).toBe('Hand wash only')
  expect(veto('do_not_wash')).toBe("The tag says don't machine wash")
  expect(veto('restriction')).toBe("The tag says don't machine wash")
  expect(exclusionWords({ code: 'care_prohibition', details: { cause: 'pre_owned_fragile', method: 'hand_wash' } }).text).toBe('Thin or damaged: hand wash it, or take it to a cleaner')
  const needs = (cause: string, product?: string) => exclusionWords({ code: 'needs_confirmation', details: { cause } }, { product }).text
  expect(needs('unknown_care')).toBe("We don't know how to wash it yet")
  expect(exclusionWords({ code: 'needs_confirmation', details: { cause: 'unmatched_label_requirement', instructions: ['No spin', 'Extra cool rinse'] } }).text)
    .toBe('A required label setting still needs a matching wash process: No spin; Extra cool rinse')
  expect(needs('unsupported_machine_cycle')).toBe("The washer doesn't have the cycle it needs")
  expect(needs('unsupported_machine_placement')).toBe("The washer doesn't have the slot a product needs")
  expect(needs('locked_door_mid_cycle', 'Tide')).toBe("Tide goes in mid-cycle, and this washer's door locks")
  expect(needs('invalid_dose', 'Tide')).toBe("The saved amount for Tide doesn't match its cap. Change it in Household.")
  expect(needs('chemical_combination_conflict')).toBe("Two products can't go in together")
  expect(exclusionWords({ code: 'capacity_limit', details: { cause: 'textile_exceeds_all_machine_capacity' } }).text).toBe('Too big for the washer')
  expect(exclusionWords({ code: 'care_compatibility', details: { cause: 'no_gentle_cycle' } }).text).toBe("Needs a delicate cycle this washer doesn't have")
  expect(exclusionWords({ code: 'product_restriction', details: { cause: 'garment_product_conflict' } }).text).toBe("A product in this load can't be used on it")
  expect(exclusionWords({ code: 'needs_confirmation', details: { cause: 'insufficient_machine_evidence' } })).toEqual({ text: 'Add your washer first', action: { kind: 'add_washer', label: 'Add a washer' } })
  expect(exclusionWords({ code: 'needs_confirmation', details: { cause: 'insufficient_product_evidence' } })).toEqual({ text: 'Add a detergent first', action: { kind: 'add_product', label: 'Add a product' } })
})

test('an unknown key falls back to plain words and never shows a code', () => {
  for (const reason of [
    { code: 'something_new', details: { cause: 'brand_new_cause' } },
    { code: 'needs_confirmation', details: { cause: 'brand_new_cause' } },
    { code: 'care_prohibition', details: { method: 'brand_new_method' } },
    { code: 'capacity_limit', details: null },
    { code: 'needs_confirmation' },
  ]) {
    const { text, action } = exclusionWords(reason)
    expect(text).toBe(fallbackWords)
    expect(action).toBeUndefined()
    expect(text).not.toMatch(/_/)
  }
  expect(pinRefusalWords({ code: 'pin_refused', details: { cause: 'brand_new_cause' } }, 'Towel')).toBe(fallbackWords)
  expect(fallbackWords).toBe('Needs a closer look')
})

test('a refused move says why in plain words', () => {
  const refused = (details: Record<string, unknown>) => pinRefusalWords({ code: 'pin_refused', details }, 'wool sweater')
  expect(refused({ cause: 'care_cycle', group: 1, loadCycle: 'normal', loadTemperatureC: 40 })).toBe("The wool sweater can't go in a warm, normal load")
  expect(refused({ cause: 'care_cycle', group: 1, loadCycle: 'normal', loadTemperatureC: null })).toBe("The wool sweater can't go in a normal load")
  expect(refused({ cause: 'capacity', group: 2 })).toBe("Load 2 is full. The wool sweater won't fit.")
  expect(refused({ cause: 'hand_wash' })).toBe('The wool sweater is hand wash only.')
  expect(refused({ cause: 'dry_clean_only' })).toBe('The wool sweater is dry clean only.')
  expect(refused({ cause: 'do_not_wash' })).toBe("The tag on the wool sweater says don't wash it.")
  expect(refused({ cause: 'care_unknown' })).toBe("We don't know how to wash the wool sweater yet.")
  expect(refused({ cause: 'restriction' })).toBe("Its label says it can't go in this load")
})

test('a bleach triangle forbidding a product names the garments it forbids it for', () => {
  const garments: Record<string, string> = { tee1: 'Black tee', tee2: 'White tee', tee3: 'Grey tee', tee4: 'Navy tee', tee5: 'Red tee' }
  const names = {
    garment: (id: string) => (garments[id] === undefined ? null : { name: garments[id]!, colorGroup: null }),
    product: (id: string) => (id === 'oxi' ? 'Oxi' : id === 'bleach' ? 'Bleach' : null),
  }
  const forbidden = (supplyId: string, details: Record<string, unknown>) =>
    loadCautionWords({ code: 'product_left_out', details: { cause: 'tag_forbids_bleach', ...details }, supplyId }, names)

  expect(forbidden('oxi', { bleach: 'oxygen', noBleachIds: ['tee1'], nonChlorineIds: [] })).toEqual({ text: 'No Oxi this load: Black tee’s tag says do not bleach.' })
  expect(forbidden('bleach', { bleach: 'chlorine', noBleachIds: [], nonChlorineIds: ['tee2'] })).toEqual({ text: 'No Bleach this load: White tee’s tag allows only non-chlorine bleach.' })
  // A chlorine product can be forbidden by both kinds of tag at once; each gets its own clause.
  expect(forbidden('bleach', { bleach: 'chlorine', noBleachIds: ['tee1'], nonChlorineIds: ['tee2'] }))
    .toEqual({ text: 'No Bleach this load: Black tee’s tag says do not bleach; White tee’s tag allows only non-chlorine bleach.' })
  // Several garments: up to two named, then "and 3 more".
  expect(forbidden('oxi', { bleach: 'oxygen', noBleachIds: ['tee1', 'tee2', 'tee3', 'tee4', 'tee5'], nonChlorineIds: [] }))
    .toEqual({ text: 'No Oxi this load: Black tee, White tee and 3 more’s tags say do not bleach.' })
  // A garment id this device doesn't know is skipped; nothing left names says the same as any other left-out product.
  expect(forbidden('oxi', { bleach: 'oxygen', noBleachIds: ['unknown-id'], nonChlorineIds: [] })).toEqual({ text: 'Oxi is left out this time.' })
})

test('a tag checked and found to say nothing explains itself as a caution, not an exclusion', () => {
  const noNames = { garment: () => null, product: () => null }
  expect(loadCautionWords({ code: 'preference_applied', details: { cause: 'care_fail_safe' } }, noNames))
    .toEqual({ text: 'Washed cold on a gentle cycle and hung to dry: the tag doesn’t say.' })
  expect(loadCautionWords({ code: 'preference_applied', details: { cause: 'something_new' } }, noNames)).toBeNull()
})

test('the plain words themselves pass the plain-copy check', () => {
  const texts = [
    ...['dry_clean_only', 'hand_wash', 'do_not_wash'].map((method) => exclusionWords({ code: 'care_prohibition', details: { method } }).text),
    ...['unknown_care', 'unsupported_machine_cycle', 'unsupported_machine_placement', 'locked_door_mid_cycle', 'invalid_dose', 'insufficient_machine_evidence', 'insufficient_product_evidence']
      .map((cause) => exclusionWords({ code: 'needs_confirmation', details: { cause } }, { product: 'Tide' }).text),
    ...['care_cycle', 'capacity', 'hand_wash', 'dry_clean_only', 'do_not_wash', 'care_unknown', 'restriction']
      .map((cause) => pinRefusalWords({ code: 'pin_refused', details: { cause, group: 1, loadCycle: 'normal', loadTemperatureC: 30 } }, 'towel')),
    loadCautionWords({ code: 'preference_applied', details: { cause: 'care_fail_safe' } }, { garment: () => null, product: () => null })!.text,
  ]
  assertPlainCopy(`<p>${texts.join('</p><p>')}</p>`)
})

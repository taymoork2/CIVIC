import { renderToStaticMarkup } from '@/test/markup'
import { expect, test, vi } from 'vitest'

import {
  AddClothesSheet, EditClothesSheet, NamedColourGrid, editDirty, addAnother, addedToast, createArgs, landedWords, pickType, sameAgain, savedToast, draftComplete, draftFromGarment, editArgs, emptyAddDraft, derivedName, garmentName, identityArg, intakeKinds,
  draftWithMaterial, sizeExample, type AddCalls, type AddDraft, type AddMode,
} from '@/closet/add-clothes'
import { emptyTag } from '@/laundry/tag-step'
import { assertPlainCopy } from '@/kit/test-copy'
import type { Textile } from '@/household/inventory-types'

const sam = { wearerId: 'sam' }
const machine = { ...emptyTag, method: 'machine', bleach: 'unknown', dryer: 'unknown' } as const
const draft = (overrides: Partial<AddDraft> = {}): AddDraft => ({ ...emptyAddDraft, whose: sam, kind: 'pants', colour: 'dark', tag: machine, stain: 'none', ...overrides })
const closet: AddMode = { kind: 'add', target: 'closet' }
const hamper: AddMode = { kind: 'add', target: 'hamper' }

test('one assortment save keeps color quantities and dye observations separate and requires shared care confirmation', () => {
  const pack = draft({ kind: 'underwear', colorName: 'Black', count: 2, dyeRun: 'fast', additionalColors: [{ colour: 'dark', colorName: 'Navy', count: 1, dyeRun: 'unknown' }], material: 'polyester', fabricDetails: { fibers: [{ fiber: 'polyester', details: ['Microfiber'] }] } })
  expect(draftComplete(closet, pack)).toBe(false)
  expect(createArgs('h1', 'closet', pack)).toBeNull()
  const checked = { ...pack, sameCareInstructions: true }
  expect(createArgs('h1', 'closet', checked)).toMatchObject({ quantity: 3, material: 'polyester', fabricDetails: pack.fabricDetails, colors: [{ color: 'Black', quantity: 2, dyeRun: 'fast' }, { color: 'Navy', quantity: 1, dyeRun: 'unknown' }] })
  expect(landedWords(checked, 'closet')).toContain('3 pieces')
  expect(sameAgain(checked).additionalColors).toBeUndefined()
  expect(sameAgain(checked).dyeRun).toBe('unknown')
  for (const count of [0, 1.5, NaN, 20]) expect(createArgs('h1', 'closet', { ...checked, additionalColors: [{ ...pack.additionalColors![0]!, count }] })).toBeNull()
  expect(render(checked, closet, 'final')).toContain('These pieces have the same care instructions')
})

test('fabric details edit independently, disappear with a removed fiber and preserve care answers', () => {
  const before = draft({ material: 'cotton' })
  const after = { ...before, fabricDetails: { fibers: [{ fiber: 'cotton', details: ['Supima'] }], construction: ['Jersey'] } }
  expect(editArgs(['t1'], before, after)).toMatchObject({ updates: [], tag: null, material: { material: 'cotton', fabricDetails: after.fabricDetails } })
  expect(draftWithMaterial(after, '80% cotton, 20% elastane').fabricDetails).toEqual(after.fabricDetails)
  expect(draftWithMaterial(after, 'wool').fabricDetails).toEqual({ construction: ['Jersey'] })
  expect(editArgs(['t1'], after, { ...after, fabricDetails: undefined }).material).toMatchObject({ fabricDetails: {} })
})

test('changing a blend clears its care answers without inventing permission for wool', () => {
  const cotton = draft({ material: 'cotton', preOwned: { fragile: false, smell: null, heatTreat: true } })
  expect(draftWithMaterial(cotton, 'wool')).toMatchObject({ material: 'wool', tag: emptyTag, preOwned: { heatTreat: false } })
  const blend = draft({ material: '80% cotton / 20% polyester' })
  expect(draftWithMaterial(blend, '70% cotton / 30% polyester').tag).toEqual(blend.tag)
})

test('sizes follow the label without restricting garment-specific formats', () => {
  expect(sizeExample('underwear', 'Bra')).toContain('34DD')
  expect(sizeExample('workout', 'Sports bra')).toContain('34DD')
  expect(sizeExample('pants', null)).toContain('32 × 30')
  expect(sizeExample('suit', 'Blazer')).toContain('40R')
  expect(sizeExample('baby_bodysuit', null)).toContain('months')
  expect(sizeExample('sheets', null)).toContain('Queen')
  expect(sizeExample('towel', null)).toContain('70 × 140 cm')
  expect(sizeExample('other', null)).toContain('dimensions')
  expect(sizeExample('shirt', null)).toContain('M')
  for (const size of ['', '34DD', '32 × 30', '40R', 'EU 50']) {
    const value = draft({ identity: { ...emptyAddDraft.identity, size } })
    expect(identityArg(value.identity)?.size ?? '').toBe(size)
  }
})

test('intake requires an explicit stain answer and never saves stained clothes as Ready', () => {
  expect(draftComplete(closet, draft({ stain: null }))).toBe(false)
  expect(createArgs('h1', 'closet', draft({ stain: null }))).toBeNull()
  expect(createArgs('h1', 'closet', draft({ stain: 'none' }))).toMatchObject({ status: 'clean' })
  expect(createArgs('h1', 'closet', draft({ stain: 'none' }))).not.toHaveProperty('stain')
  for (const stain of ['food', 'grease', 'ink', 'other'] as const) {
    // A stain also needs its age before it saves.
    expect(draftComplete(closet, draft({ stain }))).toBe(false)
    expect(createArgs('h1', 'closet', draft({ stain }))).toBeNull()
    expect(createArgs('h1', 'closet', draft({ stain, stainAge: 'new' }))).toMatchObject({ status: 'dirty', soilLevel: 'normal', stain, stainAge: 'new' })
  }
})

test('an old, set-in stain is saved as a known mark and keeps the chosen destination', () => {
  const old = draft({ stain: 'food', stainAge: 'set_in' })
  expect(draftComplete(closet, old)).toBe(true)
  const args = createArgs('h1', 'closet', old)
  expect(args).toMatchObject({ status: 'clean', stain: 'food', stainAge: 'set_in' })
  expect(args).not.toHaveProperty('soilLevel')
  expect(createArgs('h1', 'hamper', old)).toMatchObject({ status: 'dirty', stain: 'food', stainAge: 'set_in' })
  // The age is asked only after a stain, and says plainly that old stains often stay.
  expect(render(draft({ stain: 'none' }), closet, 'stain')).not.toContain('Is it new, or old and set in?')
  const asked = render(draft({ stain: 'ink' }), closet, 'stain')
  expect(asked).toContain('Is it new, or old and set in?')
  expect(asked).toContain('>Old, set in</button>')
  expect(asked).not.toContain('role="status">Old stains often')
  expect(render(old, closet, 'stain')).toContain('Old stains often don’t come out. It’s saved as a known mark and won’t hold up washing.')
  const markup = render(old, closet, 'final')
  expect(markup).toContain('With a known mark. It won’t hold up washing.')
  expect(markup).toMatch(/aria-checked="true"[^>]*>Ready to wear</)
  expect(markup).not.toContain('How dirty?')
  assertPlainCopy(markup)
})

test('dye-run observations remain distinct from legacy wash history', () => {
  expect(emptyAddDraft.dyeRun).toBe('unknown')
  expect(addAnother(draft({ dyeRun: 'fast' }), 'closet').dyeRun).toBe('unknown')
  for (const dyeRun of [null, 'unknown'] as const) expect(render(draft({ dyeRun }), closet, 'dye')).toMatch(/role="radio"[^>]*aria-checked="true"(?:(?!<\/button>).)*Not sure/)
  expect(createArgs('h1', 'closet', draft({ dyeRun: 'new' }))).toMatchObject({ dyeRun: 'new', firstWash: true })
  expect(createArgs('h1', 'closet', draft({ dyeRun: 'fast' }))).toMatchObject({ dyeRun: 'fast', firstWash: false })
  for (const dyeRun of ['bleeds', 'unknown'] as const) {
    const args = createArgs('h1', 'closet', draft({ dyeRun }))
    expect(args).toMatchObject({ dyeRun })
    expect(args).not.toHaveProperty('firstWash')
  }
  // Missing dye observations record uncertainty without inventing wash history.
  expect(createArgs('h1', 'closet', draft({ dyeRun: null }))).toHaveProperty('dyeRun', 'unknown')
  expect(createArgs('h1', 'closet', draft({ dyeRun: null }))).not.toHaveProperty('firstWash')
  const before = draft({ dyeRun: 'bleeds' })
  expect(editArgs(['t1'], before, { ...before, name: 'Blue jeans' }).updates[0]).not.toHaveProperty('dyeRun')
  expect(editArgs(['t1'], before, { ...before, dyeRun: 'fast' }).updates[0]).toMatchObject({ dyeRun: 'fast', firstWash: false })
  expect(editArgs(['t1'], before, { ...before, dyeRun: 'new' }).updates[0]).toMatchObject({ dyeRun: 'new', firstWash: true })
})

test('review omits empty optional label facts but retains the action to add them', () => {
  const empty = render(draft(), closet, 'final')
  expect(empty).not.toContain('Iron heat not recorded')
  expect(empty).not.toContain('More on the label')
  expect(empty).toContain('Ironing, steam &amp; label photo')
  expect(empty).toContain('Optional · copy from your care label')
  for (const [tag, words] of [
    [{ ...machine, iron: 'low' }, 'Iron, low heat'],
    [{ ...machine, iron: 'allowed' }, 'Ironing allowed'],
    [{ ...machine, steamPermission: 'not_allowed' }, 'Do not steam'],
  ] as const) {
    const recorded = render(draft({ tag }), closet, 'final')
    expect(recorded).toContain(words)
    expect(recorded).not.toContain('Iron heat not recorded')
    expect(recorded).not.toContain('Optional · copy from your care label')
  }
})

test('fabric is saved when chosen, left out when not, and an edit of only the fabric still saves it', () => {
  expect(createArgs('h1', 'closet', draft({ material: 'wool' }))).toMatchObject({ material: 'wool' })
  expect(createArgs('h1', 'closet', draft())).not.toHaveProperty('material')
  const before = draft({ material: 'cotton' })
  // Fabric alone is written by itself, so the recorded care is kept as it is.
  expect(editArgs(['t1'], before, { ...before, material: 'silk' })).toMatchObject({ tag: null, material: { textileIds: ['t1'], material: 'silk' } })
  expect(editArgs(['t1'], before, { ...before, material: null }).material).toEqual({ textileIds: ['t1'], material: null })
  expect(editArgs(['t1'], before, { ...before, name: 'Blue jeans' })).toMatchObject({ tag: null, material: null })
  // A garment whose care cannot be shown as tag answers (no label, or an unusual cycle) still gets its fabric.
  const unlabelled = draft({ material: null, tag: emptyTag })
  expect(editArgs(['t1'], unlabelled, { ...unlabelled, material: 'wool' }).material).toEqual({ textileIds: ['t1'], material: 'wool' })
  // With the tag changed too, the fabric goes with the tag answers.
  const retagged = editArgs(['t1'], before, { ...before, material: 'silk', tag: { ...before.tag, iron: 'no' } })
  expect([retagged.tag?.material, retagged.material]).toEqual(['silk', null])
})

test('an untouched name is derived from color and type; a typed name is kept', () => {
  expect(derivedName(draft())).toBe('Dark pants')
  expect(derivedName(draft({ kind: 't_shirt', colour: 'medium', colorName: 'Gray' }))).toBe('Gray T-shirt')
  // Older garments recorded "Grey"; en-US text reads "Gray".
  expect(derivedName(draft({ kind: 't_shirt', colour: 'medium', colorName: 'Grey' }))).toBe('Gray T-shirt')
  expect(derivedName(draft({ whose: 'shared', kind: 'towel', colour: 'white', colorName: 'White' }))).toBe('White towel')
  // "Not sure" adds no color word.
  expect(derivedName(draft({ kind: 'socks', colour: 'unknown', colorName: '' }))).toBe('Socks')
  expect(derivedName(draft({ kind: 'other' }))).toBe('')
  expect(garmentName(draft({ name: '  Leo’s school pants ' }))).toBe('Leo’s school pants')
  expect(garmentName(draft({ name: '  ' }))).toBe('Dark pants')
  expect(createArgs('h1', 'hamper', draft({ kind: 't_shirt', colour: 'medium', colorName: 'Gray' }))).toMatchObject({ name: 'Gray T-shirt' })
  // "Other" has no name to give, so the sheet cannot save until one is typed.
  expect(draftComplete(closet, draft({ kind: 'other' }))).toBe(false)
  expect(draftComplete(closet, draft({ kind: 'other', name: 'Tote bag' }))).toBe(true)
})

test('an article picked by search names an untouched garment by its color and the article', () => {
  const hoodie = draft({ kind: 'sweater', article: 'Hoodie', colour: 'medium', colorName: 'Gray' })
  expect(derivedName(hoodie)).toBe('Gray hoodie')
  expect(derivedName({ ...hoodie, colour: 'unknown', colorName: '' })).toBe('Hoodie')
  expect(createArgs('h1', 'hamper', hoodie)).toMatchObject({ name: 'Gray hoodie', kind: 'sweater' })
  // A typed name always wins.
  expect(garmentName({ ...hoodie, name: 'Gym hoodie' })).toBe('Gym hoodie')
  expect(landedWords(hoodie, 'hamper')).toBe('1 gray hoodie added to the hamper')
  expect(landedWords({ ...hoodie, count: 3 }, 'hamper')).toBe('3 gray hoodies added to the hamper')
  expect(landedWords(draft({ kind: 'dress', article: 'Dress', colour: 'saturated', colorName: 'Blue', count: 2 }), 'hamper')).toBe('2 blue dresses added to the hamper')
  expect(landedWords(draft({ kind: 'underwear', article: 'Underwear', colour: 'white', colorName: 'White', count: 2 }), 'hamper')).toBe('2 white underwear added to the hamper')
  expect(landedWords(draft({ kind: 'pants', article: 'Jeans', colour: 'dark', colorName: 'Navy', count: 2 }), 'hamper')).toBe('2 navy jeans added to the hamper')
  // Same again keeps the article; Add another clears it.
  expect(sameAgain(hoodie).article).toBe('Hoodie')
  expect(addAnother(hoodie, 'hamper').article ?? null).toBeNull()
})

test('Add clothes saves them ready, with the tag answers and the swatch’s colour', () => {
  expect(createArgs('h1', 'closet', draft())).toEqual({
    householdId: 'h1',
    name: 'Dark pants',
    quantity: 1,
    kind: 'pants',
    wearerId: 'sam',
    colorGroup: 'dark',
    color: 'Dark',
    dyeRun: 'unknown',
    status: 'clean',
    tag: { washMethod: 'machine', cycle: 'normal' },
  })
  // Shared clothes have no wearer; Bright is stored as the saturated colour group.
  const shared = createArgs('h1', 'closet', draft({ whose: 'shared', kind: 'towel', colour: 'saturated', count: 4 }))
  expect(shared).toMatchObject({ name: 'Bright towel', quantity: 4, colorGroup: 'saturated', color: 'Bright' })
  expect(shared).not.toHaveProperty('wearerId')
  expect(shared).not.toHaveProperty('soilLevel')
  expect(createArgs('h1', 'closet', draft({ colorName: 'Navy' }))).toMatchObject({ colorGroup: 'dark', color: 'Navy' })
})

test('Add to hamper saves them needing a wash, with how dirty', () => {
  expect(createArgs('h1', 'hamper', draft())).toMatchObject({ status: 'dirty', soilLevel: 'normal' })
  expect(createArgs('h1', 'hamper', draft({ soil: 'heavy' }))).toMatchObject({ status: 'dirty', soilLevel: 'heavy' })
})

test('intake records new and colorfast through the dye-run answer, separately from closet or hamper status', () => {
  for (const target of ['closet', 'hamper'] as const) {
    expect(createArgs('h1', target, draft({ dyeRun: 'new' }))).toHaveProperty('firstWash', true)
    expect(createArgs('h1', target, draft({ dyeRun: 'fast' }))).toHaveProperty('firstWash', false)
    expect(createArgs('h1', target, draft({ dyeRun: null }))).not.toHaveProperty('firstWash')
  }
  const colour = render(draft(), closet, 'dye')
  expect(colour).toContain('Washed without dye running')
  expect(colour).toContain('New, not washed yet')
  expect(colour).toContain('role="radiogroup"')
  // Unanswered shows no choice pressed, not "Not sure".
  expect(colour).not.toMatch(/aria-checked="true"[^>]*>(New, not washed yet|Dye has run before|Washed without dye running|Not sure)</)
})

test('occasions are stored only when changed; the identity only when typed', () => {
  expect(createArgs('h1', 'closet', draft())).not.toHaveProperty('occasions')
  expect(createArgs('h1', 'closet', draft({ kind: 'pajamas' }))).not.toHaveProperty('tags')
  expect(createArgs('h1', 'closet', draft({ tags: ['Sleep', 'Weekend'] }))).toMatchObject({ tags: ['Sleep', 'Weekend'] })
  expect(createArgs('h1', 'closet', draft({ occasions: ['lounge'] }))).toMatchObject({ occasions: ['lounge'] })
  // Clearing every chip stores "none", not the kind's default.
  expect(createArgs('h1', 'closet', draft({ occasions: [] }))).toMatchObject({ occasions: [] })
  const identity = { brand: ' Levi’s ', size: '32', styleNumber: '', rnNumber: ' ', barcode: '0123' }
  expect(identityArg(identity)).toEqual({ brand: 'Levi’s', size: '32', barcode: '0123' })
  expect(identityArg(emptyAddDraft.identity)).toBeUndefined()
  expect(createArgs('h1', 'closet', draft({ identity }))).toMatchObject({ identity: { brand: 'Levi’s', size: '32', barcode: '0123' } })
})

test('nothing is saved until every answer is in', () => {
  expect(createArgs('h1', 'closet', draft({ whose: null }))).toBeNull()
  expect(createArgs('h1', 'closet', draft({ colour: null }))).toBeNull()
  expect(createArgs('h1', 'closet', draft({ tag: emptyTag }))).toBeNull()
})

test('toasts: Saved, or what went in the hamper', () => {
  expect(addedToast('closet', 3, 'Sam’s pants')).toBe('Saved.')
  expect(addedToast('hamper', 1, 'Sam’s pants')).toBe('Sam’s pants is waiting to wash in Laundry.')
  expect(addedToast('hamper', 4, 'Towel')).toBe('4 laundry items are waiting to wash in Laundry.')
})

test('the saved panel names what landed and where: "6 gray tees added to the hamper"', () => {
  const tees = draft({ kind: 't_shirt', colour: 'medium', colorName: 'Gray', count: 6 })
  expect(landedWords(tees, 'hamper')).toBe('6 gray tees added to the hamper')
  expect(landedWords({ ...tees, count: 1 }, 'closet')).toBe('1 gray tee added to Ready to wear')
  // Older "Grey" reads "gray"; "Not sure" adds no color word; a typed name is used as typed.
  expect(landedWords({ ...tees, colorName: 'Grey' }, 'hamper')).toBe('6 gray tees added to the hamper')
  expect(landedWords(draft({ kind: 'socks', colour: 'unknown', colorName: '', count: 4 }), 'hamper')).toBe('4 socks added to the hamper')
  expect(landedWords(draft({ kind: 'other', name: ' scarves ', count: 2 }), 'closet')).toBe('2 scarves added to Ready to wear')
  assertPlainCopy(landedWords(tees, 'hamper'))
})

test('Add another keeps only whose and where it goes; care starts blank', () => {
  const saved = draft({ kind: 't_shirt', colour: 'black', colorName: 'Black', count: 6, name: 'Gym tee', dyeRun: 'new', stain: 'food', stainAge: 'set_in', soil: 'heavy', tags: ['Sport'] })
  expect(addAnother(saved, 'hamper')).toEqual({ ...emptyAddDraft, whose: sam, soil: 'light' })
  expect(addAnother(saved, 'closet')).toEqual({ ...emptyAddDraft, whose: sam, soil: 'normal' })
  expect(addAnother(saved, 'hamper').tag).toEqual(emptyTag)
})

test('Same again, another color keeps kind, count, whose, the typed name and the care answers, and asks the color again', () => {
  const identity = { brand: 'Uniqlo', size: 'M', styleNumber: '', rnNumber: '', barcode: '0123' }
  const saved = draft({ kind: 't_shirt', colour: 'black', colorName: 'Black', count: 6, name: 'Gym tee', dyeRun: 'new', stain: 'food', stainAge: 'set_in', soil: 'heavy', tags: ['Sport'], identity })
  const again = sameAgain(saved)
  expect(again).toMatchObject({ whose: sam, kind: 't_shirt', count: 6, name: 'Gym tee', tag: machine, soil: 'heavy', tags: ['Sport'] })
  expect(again).toMatchObject({ colour: null, colorName: '', dyeRun: 'unknown', stain: null, stainAge: null, identity: emptyAddDraft.identity })
  // Once a color and stain answer are in, it saves without retyping anything else.
  expect(createArgs('h1', 'hamper', { ...again, colour: 'white', colorName: 'White', stain: 'none' })).toMatchObject({ name: 'Gym tee', quantity: 6, kind: 't_shirt', colorGroup: 'white', tag: { washMethod: 'machine' } })
})

test('Same again drops a typed name that names the old color; a name without it stays', () => {
  const white = draft({ kind: 't_shirt', article: 'Tee', colour: 'white', colorName: 'White', count: 3, name: 'White tee' })
  const again = sameAgain(white)
  expect(again.name).toBeNull()
  expect(again.article).toBe('Tee')
  expect(derivedName({ ...again, colour: 'black', colorName: 'Black' })).toBe('Black tee')
  expect(sameAgain(draft({ kind: 't_shirt', colour: 'medium', colorName: 'Grey', name: 'gray Uniqlo tee' })).name, 'Grey and Gray are one word').toBeNull()
  expect(sameAgain(draft({ kind: 't_shirt', colour: 'white', colorName: 'White', name: 'Uniqlo Supima' })).name).toBe('Uniqlo Supima')
  expect(sameAgain(draft({ kind: 't_shirt', colour: 'black', colorName: 'Black', name: 'Blackwatch flannel' })).name, 'only the whole word').toBe('Blackwatch flannel')
})

test('a name from "Add … as Other" is dropped when another type is picked; a name typed in the Name field stays', () => {
  const other = pickType(emptyAddDraft, { kind: 'other', article: null, typed: 'kilt' })
  expect(other).toMatchObject({ kind: 'other', name: 'kilt', nameFromSearch: true })
  const tee = pickType(other, { kind: 't_shirt', article: null })
  expect(tee).toMatchObject({ kind: 't_shirt', name: null })
  expect(derivedName({ ...tee, colour: 'medium', colorName: 'Gray' })).toBe('Gray T-shirt')
  const hoodie = pickType(other, { kind: 'sweater', article: 'Hoodie' })
  expect(hoodie).toMatchObject({ article: 'Hoodie', name: null })
  const typed = pickType({ ...other, name: 'Dad’s kilt', nameFromSearch: false }, { kind: 't_shirt', article: null })
  expect(typed.name).toBe('Dad’s kilt')
  expect(pickType(draft({ name: 'Gym tee' }), { kind: 'shorts', article: null }).name).toBe('Gym tee')
})

test('Done shows one toast: a single save keeps its words, more name the totals', () => {
  const one = { target: 'hamper' as const, textileIds: ['t1'], name: 'Sam’s pants', photoFailed: false, tally: { closet: 0, hamper: 1, groups: 1 } }
  expect(savedToast(one, 'closet')).toBe('Sam’s pants is waiting to wash in Laundry.')
  expect(savedToast({ ...one, tally: undefined, target: undefined }, 'closet')).toBe('Saved.')
  expect(savedToast({ ...one, photoFailed: true }, 'closet')).toBe('Sam’s pants is waiting to wash in Laundry. The tag photo didn’t upload.')
  const many = { ...one, textileIds: ['t1', 't2', 't3', 't4', 't5', 't6', 't7'], tally: { closet: 0, hamper: 7, groups: 2 } }
  expect(savedToast(many, 'hamper')).toBe('7 laundry items are waiting to wash in Laundry.')
  expect(savedToast({ ...many, tally: { closet: 1, hamper: 6, groups: 2 } }, 'hamper')).toBe('1 item saved as ready to wear. 6 laundry items are waiting to wash in Laundry.')
  expect(savedToast({ ...many, tally: { closet: 3, hamper: 0, groups: 2 } }, 'closet')).toBe('3 items saved as ready to wear.')
})

const garment = (overrides: Partial<Textile> = {}) => ({
  textileId: 't1' as Textile['textileId'],
  name: 'Sam’s pants',
  kind: 'pants',
  wearerId: 'sam' as Textile['wearerId'],
  colorGroup: 'dark',
  occasions: null,
  identity: null,
  care: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, dryMethod: 'tumble_dry', dryHeat: 'low', ironSteam: null, material: null, restrictions: [], dryMethodInferred: false, status: 'confirmed', provenance: { source: 'tag_taps', confidence: 'observed' } },
  ...overrides,
}) as unknown as Textile

test('Edit starts from the garment and writes only what changed', () => {
  const before = draftFromGarment(garment())
  expect(before).toMatchObject({ whose: sam, kind: 'pants', colour: 'dark', name: 'Sam’s pants', occasions: null, tag: { method: 'machine', dots: 1, bars: 0, bleach: 'unknown', dryer: 'low', iron: 'unknown' } })
  expect(editArgs(['t1', 't2'], before, before)).toEqual({ updates: [], tag: null, material: null })

  const shared = editArgs(['t1', 't2'], before, { ...before, whose: 'shared', colour: 'black' })
  expect(shared.updates).toEqual([
    { textileId: 't1', wearerId: null, colorGroup: 'black', color: 'Black' },
    { textileId: 't2', wearerId: null, colorGroup: 'black', color: 'Black' },
  ])
  expect(shared.tag).toBeNull()
  expect(editArgs(['t1'], before, { ...before, colorName: 'Navy' }).updates).toEqual([{ textileId: 't1', colorGroup: 'dark', color: 'Navy' }])

  const retagged = editArgs(['t1'], before, { ...before, tag: { ...before.tag, iron: 'no' }, occasions: ['work'], identity: { ...before.identity, size: 'M' } })
  expect(retagged.updates).toEqual([{ textileId: 't1', occasions: ['work'], identity: { size: 'M' } }])
  expect(retagged.tag).toEqual({ textileIds: ['t1'], washMethod: 'machine', maxTemperatureC: 30, cycle: 'normal', dryMethod: 'tumble_dry', dryHeat: 'low', ironSteam: 'not_allowed' })

  // An older "very light" reads as the Light swatch; a colour group the swatches don't have must be picked.
  expect(draftFromGarment(garment({ colorGroup: 'very_light' })).colour).toBe('light')
  expect(draftFromGarment(garment({ colorGroup: null, wearerId: null })).colour).toBeNull()
  expect(draftFromGarment(garment({ wearerId: null })).whose).toBe('shared')
})

const unused = async () => { throw new Error('unused') }
const calls: AddCalls = { createTextiles: unused, addMatchingTextiles: unused, trashTextiles: unused, createWearer: unused, updateTextile: unused, answerTagQuestions: unused, setMaterial: unused, clearCare: unused, uploadPhoto: unused }
const wearers = [{ wearerId: 'sam', name: 'Sam' }, { wearerId: 'leo', name: 'Leo' }]

test('a stored "Grey" shows as Gray in Edit and is written back only when the color changes', () => {
  const before = draftFromGarment(garment({ colorGroup: 'medium', color: 'Grey' }))
  expect(before.colorName).toBe('Gray')
  expect(editArgs(['t1'], before, before).updates).toEqual([])
  expect(editArgs(['t1'], before, { ...before, colour: 'light' }).updates).toEqual([{ textileId: 't1', colorGroup: 'light', color: 'Gray' }])
  expect(renderToStaticMarkup(<EditClothesSheet editing={[garment({ colorGroup: 'medium', color: 'Grey' })]} wearers={wearers} calls={calls} renderPhotos={() => null} onClose={() => undefined} onSaved={() => undefined} />)).toMatch(/value="Gray"/)
})

test('Edit is dirty only with unsaved answers, so closing asks before discarding them', () => {
  const before = draftFromGarment(garment())
  const pieces = { quantity: 2, pieces: 2, removeCareCount: 0 }
  expect(editDirty(before, before, pieces)).toBe(false)
  expect(editDirty(before, { ...before, kind: 'shorts' }, pieces)).toBe(true)
  expect(editDirty(before, before, { ...pieces, quantity: 3 })).toBe(true)
  expect(editDirty(before, before, { ...pieces, removeCareCount: 1 })).toBe(true)
  // Checking the label alone weighs only the label answers.
  expect(editDirty(before, { ...before, kind: 'shorts' }, { ...pieces, careOnly: true })).toBe(false)
  expect(editDirty(before, { ...before, tag: { ...before.tag, iron: 'no' } }, { ...pieces, careOnly: true })).toBe(true)
})

test('Edit shows the expanded intake tiles as a visible Item type section, with the current type pressed', () => {
  const edit = (focusField?: 'kind') => renderToStaticMarkup(<EditClothesSheet editing={[garment()]} wearers={wearers} calls={calls} renderPhotos={() => null} focusField={focusField} onClose={() => undefined} onSaved={() => undefined} />)
  const markup = edit()
  expect(markup).toContain('>Item type</legend>')
  expect(markup).not.toMatch(/<select[^>]*-kind"/)
  expect(markup).not.toMatch(/<option value="pants"/)
  const tiles = markup.slice(markup.indexOf('-kind-title"'), markup.indexOf('-colour"'))
  const pressed = [...tiles.matchAll(/<button[^>]*aria-pressed="true"[^>]*>([\s\S]*?)<\/button>/g)].map((match) => match[1]!.replace(/<[^>]+>/g, ''))
  expect(pressed).toEqual(['Pants'])
  expect(tiles).toContain('>T-shirt</span>')
  // A baby bodysuit stays offered when it is this garment's type, even with no baby in the household.
  expect(renderToStaticMarkup(<EditClothesSheet editing={[garment({ kind: 'baby_bodysuit' })]} wearers={wearers} calls={calls} renderPhotos={() => null} onClose={() => undefined} onSaved={() => undefined} />)).toContain('>Bodysuit</span>')
})

test('a tapped garment fact shows only its controls and keeps the general editor available', () => {
  const edit = (focusField?: import('./add-clothes').EditField) => renderToStaticMarkup(<EditClothesSheet editing={[garment()]} wearers={wearers} calls={calls} renderPhotos={() => null} focusField={focusField} onClose={() => undefined} onSaved={() => undefined} />)
  const color = edit('color')
  expect(color).toContain('Specific color (optional)')
  expect(color).not.toContain('Manufacturer reference')
  expect(color).not.toContain('How many')
  expect(color).not.toContain('>Fabric<')
  expect(color).not.toContain('>Tags<')
  const fabric = edit('material')
  expect(fabric).toContain('Cotton')
  expect(fabric).not.toContain('Specific color (optional)')
  for (const field of ['brand', 'size'] as const) {
    expect(edit(field)).toContain('Brand and size</h2>')
    expect(edit(field)).not.toContain('Specific color (optional)')
  }
  expect(edit('quantity')).not.toContain('Cotton')
  expect(edit()).toContain('Manufacturer reference (optional)')
})

test('Details leaves care in Care, and extra label answers do not repeat wash questions', () => {
  const edit = (careOnly?: 'all' | 'more', care = garment().care) => renderToStaticMarkup(<EditClothesSheet editing={[garment({ care })]} wearers={wearers} calls={calls} careOnly={careOnly} renderPhotos={() => <p>Label photo</p>} onClose={() => undefined} onSaved={() => undefined} />)
  const details = edit()
  const primary = details.split('role="tabpanel"')[1]!
  expect(primary).not.toContain('Label photo')
  expect(primary).not.toContain('Washtub on the tag')
  expect(details).toMatch(/hidden=""[\s\S]*Washtub on the tag/)
  expect(details).toContain('Manufacturer reference (optional)')
  const more = edit('more')
  expect(more).toContain('More on the label</h2>')
  expect(more).toContain('Steam instruction on the label')
  expect(more).toContain('Label photo')
  expect(more).not.toContain('Washtub on the tag')
  expect(more).not.toContain('Dryer square')
  // An incomplete label still opens its unanswered questions, rather than an unsavable extras form.
  expect(edit('more', null)).toContain('Check the care label</h2>')
  expect(edit('all')).toContain('Washtub on the tag')
})
const render = (initial: AddDraft = draft(), mode: Extract<AddMode, { kind: 'add' }> = { kind: 'add', target: 'closet' }, initialStep: Parameters<typeof AddClothesSheet>[0]['initialStep'] = 'type') => renderToStaticMarkup(
  <AddClothesSheet householdId="h1" mode={mode} wearers={wearers} calls={calls} initial={initial} initialStep={initialStep} onClose={() => undefined} onSaved={() => undefined} />,
)

test('Add clothes starts at the type step, where a tile advances, with an accessible header close', () => {
  const markup = render(emptyAddDraft)
  expect(markup).toContain('What is it?</h2>')
  expect(markup).not.toContain('New garment ·')
  expect(markup).toContain('aria-valuetext="Step 1 of 12"')
  expect(markup).toContain('<form id=')
  // Nothing is picked yet, so there is no Next to wait on: tapping a tile is the step's action.
  expect(markup).not.toContain('>Next: whose</button>')
  expect(markup).toContain('aria-label="Close"')
  expect(markup.indexOf('aria-label="Close"')).toBeLessThan(markup.indexOf('<form'))
  expect(markup).not.toContain('sheet-foot-row')
  expect(markup).not.toContain('>Save item</button>')
  expect(markup).not.toContain('>Ready to wear</button>')
  assertPlainCopy(markup)
})

test('coming back to a picked type offers one Next to whose it is', () => {
  const markup = render({ ...emptyAddDraft, kind: 't_shirt' })
  const formId = markup.match(/<form id="([^"]+)"/)?.[1]
  expect(formId).toBeDefined()
  expect((markup.match(/<button\b[^>]*>/g) ?? []).filter(tag => tag.includes('type="submit"') && tag.includes(`form="${formId}"`))).toHaveLength(1)
  expect(markup).toContain('>Next: whose</button>')
})

test('the first intake asks what needs washing with one close action and no redundant Later', () => {
  const markup = renderToStaticMarkup(<AddClothesSheet householdId="h1" mode={hamper} wearers={wearers} calls={calls} initial={emptyAddDraft} firstRun onClose={() => undefined} onSaved={() => undefined} />)
  expect(markup).toContain('What needs washing?</h2>')
  expect(markup).not.toContain('>Later</button>')
  expect(markup).toContain('aria-label="Close"')
  expect(render(emptyAddDraft)).not.toContain('>Later</button>')
  // Later steps keep their own titles.
  expect(renderToStaticMarkup(<AddClothesSheet householdId="h1" mode={hamper} wearers={wearers} calls={calls} initial={draft()} initialStep="color" firstRun onClose={() => undefined} onSaved={() => undefined} />)).toContain('Color</h2>')
})

test('the final stain question gates saving and quantity remains bounded', () => {
  const unanswered = render(draft({ stain: null }), closet, 'stain')
  expect(unanswered).toContain('Any stains?</h2>')
  expect(unanswered).toMatch(/<button\b[^>]*type="submit"[^>]*disabled=""[^>]*>Next: review<\/button>/)
  const incomplete = render(draft({ stain: null }), closet, 'final')
  expect(incomplete).toContain('aria-valuetext="Step 12 of 12"')
  expect(incomplete).toContain('Review item</h2>')
  expect(incomplete).toMatch(/<button\b[^>]*type="submit"[^>]*disabled=""[^>]*>Save item<\/button>/)
  for (const count of [0, -1, 21, 1.5, NaN]) {
    expect(draftComplete(closet, draft({ count }))).toBe(false)
    expect(createArgs('h1', 'closet', draft({ count }))).toBeNull()
  }
  const markup = render(draft(), hamper, 'final')
  expect(markup).toContain('>Save item</button>')
  expect(markup).toContain('Review care label')
  const stains = render(draft(), hamper, 'stain')
  expect(stains).toContain('No stains')
  expect(stains).toContain('Food or drink')
})

test('the colour step names its swatches and explains only the chosen colour', () => {
  const colour = renderToStaticMarkup(<NamedColourGrid value="" group={null} onPick={() => undefined} />)
  expect(colour).toContain('Pick the color that covers most of it.')
  expect(colour.indexOf('colour-hint')).toBeLessThan(colour.indexOf('role="radiogroup"'))
  const picks = [['White', 'white', 'White and off-white.'], ['Navy', 'dark', 'Navy, a dark blue.'], ['Black', 'black', 'Black and faded black.']] as const
  for (const [name, group, examples] of picks) {
    const selected = renderToStaticMarkup(<NamedColourGrid value={name} group={group} onPick={() => undefined} />)
    expect(selected).toContain(`role="status">${examples}</p>`)
    expect(selected.match(/aria-checked="true"/g)).toHaveLength(1)
  }
  // "Mixed" and "Not sure" sort as unknown, so no examples line claims a group for them.
  expect(renderToStaticMarkup(<NamedColourGrid value="Mixed" group="unknown" onPick={() => undefined} />)).not.toContain('role="status"')
  expect(colour.match(/role="radio"/g)).toHaveLength(12)
  expect(colour).not.toContain('role="status"')
})

test('red shows Medium for its Bright sorting group and shades describe the selected hue', () => {
  const red = render(draft({ colorName: 'Red', colour: 'saturated' }), closet, 'color')
  expect(red).toMatch(/aria-checked="true"[^>]*>(?:(?!<\/button>).)*>Medium<\/span>/)
  const lightRed = renderToStaticMarkup(<NamedColourGrid value="Red" group="light" onPick={() => undefined} />)
  expect(lightRed).toContain('Light red, such as coral.')
  expect(lightRed).not.toContain('Pastels, light gray, heather, beige')
  const darkBlue = renderToStaticMarkup(<NamedColourGrid value="Blue" group="dark" onPick={() => undefined} />)
  expect(darkBlue).toContain('Dark blue, such as indigo.')
  expect(darkBlue).not.toContain('burgundy')
})

test('the type step browses specific articles in visible groups, with a bodysuit only for a baby', () => {
  const markup = render(emptyAddDraft)
  const tiles = markup.match(/<button\b[^>]*aria-pressed="(?:true|false)"[^>]*>/g) ?? []
  expect(tiles.length).toBeGreaterThan(50)
  expect(markup).not.toContain('garment-hook')
  expect(markup).not.toContain('Bodysuit')
  for (const word of ['T-shirt', 'Pants', 'Jacket', 'Towel', 'Sheets', 'Other']) expect(markup).toContain(`<span>${word}</span>`)
  for (const label of ['Tops', 'Bottoms', 'Dresses &amp; skirts', 'Jackets &amp; suits', 'Underwear &amp; sleepwear', 'Workout', 'Household textiles', 'Other items']) expect(markup).toContain(`>${label}</p>`)
  for (const name of ['Button-up shirt', 'Dress shirt', 'Long-sleeve tee', 'Henley', 'Hoodie', 'Jeans', 'Boxer briefs', 'Hand towel', 'Pillowcase', 'Duvet cover']) expect(markup).toContain(`<span>${name}</span>`)
  expect(markup).toContain('Fabric and label answers determine care.')
  const henley = render(draft({ kind: 't_shirt', article: 'Henley' }))
  expect(henley.match(/aria-pressed="true"/g)).toHaveLength(1)
  expect(henley).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>).)*<span>Henley<\/span>/)
  const baby = renderToStaticMarkup(<AddClothesSheet householdId="h1" mode={closet as Extract<AddMode, { kind: 'add' }>} wearers={[...wearers, { wearerId: 'ada', name: 'Ada', kind: 'baby' }]} calls={calls} onClose={() => undefined} onSaved={() => undefined} />)
  expect(baby).toContain('<span>Bodysuit</span>')
  expect(intakeKinds([{ kind: 'adult' }])).not.toContain('baby_bodysuit')
  expect(intakeKinds([{ kind: 'adult' }, { kind: 'baby' }])).toContain('baby_bodysuit')
  // A chosen type stays pressed when the person comes back to this step.
  expect(render(draft({ kind: 'pants' }))).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>).)*<span>Pants<\/span>/)
})

test('the steps run type, whose, garment details, fabric, color, origin, dye, care label, stains, then review', () => {
  const steps = ['type', 'whose', 'details', 'fabric', 'color', 'origin', 'dye', 'care', 'stain', 'final'] as const
  const titles = steps.map((step) => render(draft(), closet, step).match(/>([^<>]+)<\/h2>/)?.[1])
  expect(titles).toEqual(['What is it?', 'Whose is it?', 'Item details', 'What’s it made of?', 'Color', 'Where is it from?', 'Could the dye run?', 'How does it wash?', 'Any stains?', 'Review item'])
  expect(render(draft(), closet, 'care')).toContain('aria-valuetext="Step 8 of 12"')
  expect(render(draft({ preOwned: { smell: null, fragile: false, heatTreat: false } }), closet, 'care')).toContain('aria-valuetext="Step 7 of 11"')
  expect(render(draft({ tag: { ...machine, method: 'dry_clean_only' } }), closet, 'final')).toContain('aria-valuetext="Step 10 of 10"')
  expect(render(draft({ tag: { ...machine, method: 'dry_clean_only' } }), closet, 'final')).toContain('data-symbol="dry_clean_p"')
  // People stay separate; the details step names the garment and its optional identity.
  const whose = render(draft(), closet, 'whose')
  expect(whose).toContain('aria-label="Whose is it?"')
  expect(whose).not.toContain('Quantity')
  const details = render(draft(), closet, 'details')
  for (const word of ['Name', 'Quantity', 'Brand', 'Size', 'Filter or add a tag', 'Manufacturer reference (optional)']) expect(details).toContain(word)
  expect(details.indexOf('>Brand</label>')).toBeLessThan(details.indexOf('Manufacturer reference (optional)'))
  expect(details.indexOf('>Size</label>')).toBeLessThan(details.indexOf('Manufacturer reference (optional)'))
  expect(details.indexOf('Filter or add a tag')).toBeLessThan(details.indexOf('Manufacturer reference (optional)'))
  expect(details).toContain('type="number"')
  expect(details).not.toContain('Whose is it?')
  expect(details).not.toContain('role="radiogroup"')
  // No type chips on details: the type was picked by its picture.
  expect(details).not.toContain('Jeans or pants')
  expect(details).toContain('>Next: fabric</button>')
  expect(render(draft(), closet, 'fabric')).toContain('>Next: color</button>')
  expect(render(draft(), closet, 'fabric')).toContain('Cotton')
  expect(render(draft(), closet, 'color')).toContain('>Next: where from</button>')
  expect(render(draft(), closet, 'color')).not.toContain('Washed without dye running')
  expect(render(draft(), closet, 'origin')).toContain('>Next: dye</button>')
  expect(render(draft(), closet, 'dye')).toContain('>Next: care label</button>')
  // Pre-owned has no dye step: its origin step goes straight to the care label.
  expect(render(draft({ preOwned: { smell: null, fragile: false, heatTreat: false } }), closet, 'origin')).toContain('>Next: care label</button>')
  expect(render(draft(), closet, 'stain')).toContain('>Next: review</button>')
})

test('the save step shows where it goes, how dirty for the hamper, and the derived name', () => {
  const hamperMarkup = render(draft({ soil: 'light' }), hamper, 'final')
  expect(hamperMarkup).toContain('How dirty?')
  expect(hamperMarkup).toMatch(/aria-checked="true"[^>]*>A little</)
  expect(hamperMarkup).toContain('Dark pants · Needs washing')
  const closetMarkup = render(draft({ count: 3 }), closet, 'final')
  expect(closetMarkup).not.toContain('How dirty?')
  expect(closetMarkup).toContain('Dark pants · 3 pieces · Ready to wear')
  expect(closetMarkup).toMatch(/aria-checked="true"[^>]*>Ready to wear</)
  expect(render(draft({ name: 'Work jeans' }), closet, 'final')).toContain('Work jeans · Ready to wear')
  // A stain sends it to the hamper, so how dirty is asked.
  expect(render(draft({ stain: 'food', stainAge: 'new' }), closet, 'final')).toContain('How dirty?')
})

test('the type tiles are named by the sheet heading itself, not a hidden copy of it', () => {
  const markup = render(draft({ kind: null }))
  const heading = markup.match(/<h2 id="([^"]+)"[^>]*>([^<]+)<\/h2>/)
  expect(heading).not.toBeNull()
  expect(markup).toContain(`aria-labelledby="${heading![1]}"`)
  expect(markup.split(`>${heading![2]}<`)).toHaveLength(2)
  expect(markup).not.toContain('visually-hidden')
})

test('the type step searches clothing above the tiles; a query shows matching articles instead of the grid', () => {
  const empty = render(emptyAddDraft)
  expect(empty).toContain('>Search items</label>')
  expect(empty).toMatch(/<input[^>]*type="search"[^>]*placeholder="e.g. hoodie, towel or sheets"/)
  expect(empty).toContain('icon-choice-grid')
  expect(empty).toContain('>Sweater</span>')
  const searched = renderToStaticMarkup(<AddClothesSheet householdId="h1" mode={closet as Extract<AddMode, { kind: 'add' }>} wearers={wearers} calls={calls} initial={emptyAddDraft} initialQuery="hood" onClose={() => undefined} onSaved={() => undefined} />)
  expect(searched).not.toContain('icon-choice-grid')
  expect(searched).toContain('aria-label="Hoodie, Sweater"')
  expect(searched).toContain('aria-live="polite"')
  expect(searched).toContain('1 match<')
  const none = renderToStaticMarkup(<AddClothesSheet householdId="h1" mode={closet as Extract<AddMode, { kind: 'add' }>} wearers={wearers} calls={calls} initial={emptyAddDraft} initialQuery="tote bag" onClose={() => undefined} onSaved={() => undefined} />)
  expect(none).toContain('Add “tote bag” as Other')
  expect(none).toContain('No matches<')
  assertPlainCopy(searched)
})

test('the details hint names the example the picked article would get', () => {
  expect(render(draft({ kind: 'sweater', article: 'Hoodie', colour: null, colorName: '' }), closet as Extract<AddMode, { kind: 'add' }>, 'details')).toContain('like “Gray hoodie”')
  expect(render(draft({ kind: 't_shirt', colour: null, colorName: '' }), closet as Extract<AddMode, { kind: 'add' }>, 'details')).toContain('like “Gray T-shirt”')
})

test('household textiles use item names, dimensions and relevant tags without discarding custom tags', () => {
  const towel = render(draft({ kind: 'towel', tags: ['Favorite towel'] }), closet, 'details')
  for (const word of ['Item details', 'e.g. White towel', '70 × 140 cm', 'Bathroom', 'Beach', 'Favorite towel']) expect(towel).toContain(word)
  for (const word of ['White cotton tee', '>Dressy</button>', '>Work</button>', 'e.g. M']) expect(towel).not.toContain(word)
  const sheets = render(draft({ kind: 'sheets' }), closet, 'details')
  for (const word of ['e.g. White sheets', 'Queen', 'Bedroom', 'Guest']) expect(sheets).toContain(word)
})

test('unanswered intake care displays unknown by default without manufacturing care facts', () => {
  const value = draft({ kind: 'dress', material: 'silk', tag: emptyTag })
  const markup = render(value, closet, 'care')
  expect(markup).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Tag doesn’t say/)
  expect(markup).toContain('data-symbol="dry_clean_p"')
  expect(markup).not.toMatch(/type="submit"[^>]*disabled=""/)
  expect(createArgs('h1', 'closet', value)?.tag).toBeUndefined()
  const extras = render(value, closet, 'label')
  expect(extras).toContain('>Next: review</button>')
  expect(extras).toContain('aria-valuetext="Step 12 of 12"')
})

test('pre-owned keeps the chosen destination while dye stays unknown', () => {
  const thrifted = draft({ preOwned: { smell: 'musty', fragile: false, heatTreat: false }, dyeRun: 'fast', stain: 'none' })
  const args = createArgs('h1', 'closet', thrifted)
  expect(args).toMatchObject({ status: 'clean', dyeRun: 'unknown', preOwned: { smell: 'musty' } })
  expect(args).not.toHaveProperty('soilLevel')
  expect(createArgs('h1', 'hamper', thrifted)).toMatchObject({ status: 'dirty', soilLevel: 'normal', dyeRun: 'unknown' })
  expect(args).not.toHaveProperty('firstWash')
  expect(createArgs('h1', 'closet', draft())).toMatchObject({ status: 'clean' })
  expect(createArgs('h1', 'closet', draft())).not.toHaveProperty('preOwned')
  expect(createArgs('h1', 'hamper', draft({ preOwned: { smell: null, fragile: true, heatTreat: false } }))).toMatchObject({ preOwned: { fragile: true } })
})

test('heat treatment is sent only when the tag allows high heat', () => {
  const pre = { smell: null, fragile: false, heatTreat: true }
  for (const dryer of ['high', 'tumble'] as const) expect(createArgs('h1', 'hamper', draft({ preOwned: pre, tag: { ...machine, dryer } }))).toMatchObject({ preOwned: { heatTreat: true } })
  for (const dryer of ['low', 'medium', 'no_heat', 'no_tumble', 'unknown'] as const) expect(createArgs('h1', 'hamper', draft({ preOwned: pre, tag: { ...machine, dryer } }))?.preOwned).toEqual({})
})

test('the origin step asks about pre-owned; pre-owned adds smell and condition and drops the dye step', () => {
  const plain = render(draft({ colorName: 'Indigo' }), closet, 'origin')
  expect(plain).toContain('Pre-owned (thrift, hand-me-down)')
  expect(plain).toContain('role="checkbox"')
  expect(plain).not.toContain('role="switch"')
  expect(plain).not.toContain('Smells of')
  expect(render(draft({ colorName: 'Indigo' }), closet, 'dye')).toContain('Could the dye run?')
  const pre = render(draft({ colorName: 'Indigo', preOwned: { smell: 'smoke', fragile: false, heatTreat: false } }), closet, 'origin')
  for (const word of ['Smells of…', 'Musty', 'Smoke', 'Perfume', 'check the rinse water', 'Thin or damaged', '(optional)']) expect(pre).toContain(word)
  expect(pre.match(/role="checkbox"/g)).toHaveLength(2)
  expect(pre).not.toContain('Vintage')
  expect(pre).not.toContain('Optional.</span>')
})

test('the last step asks where pre-owned clothes go and offers heat treatment only when the tag allows it', () => {
  const pre = { smell: null, fragile: false, heatTreat: false }
  const allowed = render(draft({ preOwned: pre, tag: { ...machine, dryer: 'high' } }), closet, 'final')
  for (const destination of ['Ready to wear', 'Needs washing']) expect(allowed).toContain(destination)
  expect(allowed).not.toContain('Wash before wearing')
  expect(allowed).toContain('Pest treatment options')
  expect(allowed).not.toContain('Save to')
  const blocked = render(draft({ preOwned: pre, tag: { ...machine, dryer: 'low' } }), closet, 'final')
  expect(blocked).not.toContain('Heat-treat first')
  expect(blocked).not.toContain('so the dryer is out')
  expect(blocked).toContain('Review item')
  expect(blocked).not.toContain('How dirty?')
  expect(blocked).toContain('Low heat')
  expect(blocked).not.toContain('122 F')
  vi.stubEnv('VITE_TRIAL_NOTES', '1')
  try {
    expect(render(draft({ preOwned: pre, tag: { ...machine, dryer: 'high' } }), closet, 'final')).not.toContain('122 F')
    expect(render(draft({ preOwned: { ...pre, heatTreat: true }, tag: { ...machine, dryer: 'high' } }), closet, 'final')).not.toContain('122 F')
    expect(render(draft({ preOwned: { ...pre, heatTreat: true }, tag: { ...machine, dryer: 'low' } }), closet, 'final')).not.toContain('122 F')
  } finally { vi.unstubAllEnvs() }
})

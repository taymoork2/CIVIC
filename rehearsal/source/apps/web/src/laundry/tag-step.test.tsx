import type { ReactElement } from 'react'
import { renderToStaticMarkup } from '@/test/markup'
import { expect, test } from 'vitest'

import { TagRows, tagChoiceProblem, tagRowsAnswers, type TagRowsPatch } from '@/closet/tag-rows'
import { TagStep, emptyTag, tagAnswers, tagComplete, tagDraftFromCare, tagEcho, tagRows, type TagDraft } from '@/laundry/tag-step'
import { assertPlainCopy } from '@/kit/test-copy'

/** A machine tub with the bleach triangle and dryer square answered "Tag doesn't say". */
const machine = (overrides: Partial<TagDraft> = {}): TagDraft => ({ ...emptyTag, method: 'machine', bleach: 'unknown', dryer: 'unknown', ...overrides })

test('wool choices also reject unrestricted and hot temperatures in the less-common symbol controls', () => {
  for (const dots of [0, 3, 4] as const) expect(tagChoiceProblem('20% wool / 80% cotton', { wash: 'machine', dots })).not.toBeNull()
  for (const dots of [1, 2] as const) expect(tagChoiceProblem('wool', { wash: 'machine', dots, bars: 2 })).toBeNull()
  expect(tagChoiceProblem('cotton', { wash: 'machine', dots: 0 })).toBeNull()
})

test('nothing about care is preset: the washtub, bleach triangle and dryer square must be tapped', () => {
  expect(tagComplete(emptyTag)).toBe(false)
  expect(tagAnswers(emptyTag)).toBeNull()
  expect(tagAnswers({ ...emptyTag, method: 'machine' })).toBeNull()
  expect(tagAnswers({ ...emptyTag, method: 'machine', bleach: 'none' })).toBeNull()
  expect(tagAnswers({ ...emptyTag, method: 'machine', dryer: 'tumble' })).toBeNull()
  // A crossed tub grants no cleaning method. Existing explicit instructions remain distinct.
  expect(tagAnswers({ ...emptyTag, method: 'do_not_wash' })).toEqual({ washMethod: 'do_not_wash' })
  expect(tagAnswers({ ...emptyTag, method: 'dry_clean_only' })).toEqual({ washMethod: 'dry_clean_only' })
})

test('the tub with no dots or bars, and "Tag doesn’t say" on the triangle and square, stores only a normal machine wash', () => {
  expect(tagComplete(machine())).toBe(true)
  expect(tagAnswers(machine())).toEqual({ washMethod: 'machine', cycle: 'normal' })
})

test('the tub’s dots store 30, 40, 50 and 60 °C; its bars store the cycle', () => {
  expect(tagAnswers(machine({ dots: 1 }))).toEqual({ washMethod: 'machine', maxTemperatureC: 30, cycle: 'normal' })
  expect(tagAnswers(machine({ dots: 2 }))?.maxTemperatureC).toBe(40)
  expect(tagAnswers(machine({ dots: 3 }))?.maxTemperatureC).toBe(50)
  expect(tagAnswers(machine({ dots: 4 }))?.maxTemperatureC).toBe(60)
  expect(tagAnswers(machine({ dots: 0 }))).not.toHaveProperty('maxTemperatureC')
  expect(tagAnswers(machine({ bars: 1 }))?.cycle).toBe('permanent_press')
  expect(tagAnswers(machine({ bars: 2 }))?.cycle).toBe('delicate')
})

test('like colors is an independent label instruction that survives temperature and cycle changes', () => {
  const tag = machine({ dots: 1, washWithLikeColors: true })
  expect(tagAnswers(tag)).toMatchObject({ maxTemperatureC: 30, washWithLikeColors: true })
  expect(tagEcho(tag)).toContain('Cold · with like colors')
  expect(tagAnswers({ ...tag, dots: 2, bars: 2 })).toMatchObject({ maxTemperatureC: 40, cycle: 'delicate', washWithLikeColors: true })
  expect(tagAnswers({ ...tag, washWithLikeColors: false })).toHaveProperty('washWithLikeColors', false)
  const markup = renderToStaticMarkup(<TagRows only="wash" value={tagRows(tag)} onChange={() => undefined} />)
  expect(markup).toContain('Wash with like colors')
  expect(markup).toContain('role="checkbox"')
  expect(markup).toContain('aria-checked="true"')
  const care = { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, dryMethod: 'unknown', dryHeat: null, ironSteam: null, restrictions: ['Do not soak', 'Wash with like colors'] } as const
  expect(tagDraftFromCare(care)).toMatchObject({ dots: 1, washWithLikeColors: true })
})

test('the bleach triangle, every dryer answer including medium and flat, and the iron', () => {
  expect(tagAnswers(machine({ bleach: 'any' }))?.bleach).toBe('any')
  expect(tagAnswers(machine({ bleach: 'non_chlorine' }))?.bleach).toBe('non_chlorine')
  expect(tagAnswers(machine({ bleach: 'none' }))?.bleach).toBe('none')
  expect(tagAnswers(machine({ bleach: 'unknown' }))).not.toHaveProperty('bleach')
  expect(tagAnswers(machine({ dryer: 'tumble' }))).toEqual({ washMethod: 'machine', cycle: 'normal', dryMethod: 'tumble_dry' })
  expect(tagAnswers(machine({ dryer: 'low' }))).toEqual({ washMethod: 'machine', cycle: 'normal', dryMethod: 'tumble_dry', dryHeat: 'low' })
  expect(tagAnswers(machine({ dryer: 'medium' }))).toEqual({ washMethod: 'machine', cycle: 'normal', dryMethod: 'tumble_dry', dryHeat: 'medium' })
  expect(tagAnswers(machine({ dryer: 'high' }))).toEqual({ washMethod: 'machine', cycle: 'normal', dryMethod: 'tumble_dry', dryHeat: 'high' })
  expect(tagAnswers(machine({ dryer: 'no_heat' }))).toEqual({ washMethod: 'machine', cycle: 'normal', dryMethod: 'tumble_dry', dryHeat: 'no_heat' })
  expect(tagAnswers(machine({ dryer: 'no_tumble' }))?.dryMethod).toBe('do_not_tumble_dry')
  expect(tagAnswers(machine({ dryer: 'no_tumble', natural: 'line' }))?.dryMethod).toBe('line_dry')
  expect(tagAnswers(machine({ dryer: 'no_tumble', natural: 'flat' }))?.dryMethod).toBe('dry_flat')
  expect(tagAnswers(machine({ dryer: 'no_tumble', natural: 'drip' }))?.dryMethod).toBe('drip_dry')
  expect(tagAnswers(machine({ dryer: 'unknown' }))).not.toHaveProperty('dryMethod')
  expect(tagAnswers(machine({ iron: 'no' }))?.ironSteam).toBe('not_allowed')
  expect(tagAnswers(machine({ iron: 'low' }))?.ironSteam).toBe('allowed')
  expect(tagAnswers(machine({ iron: 'high' }))?.ironSteam).toBe('allowed')
  expect(tagAnswers(machine({ iron: 'allowed' }))?.ironSteam).toBe('allowed')
  expect(tagAnswers(machine({ iron: 'unknown' }))).not.toHaveProperty('ironSteam')
  expect(tagAnswers(machine({ dots: 3, bars: 2, bleach: 'non_chlorine', dryer: 'medium', iron: 'no' }))).toEqual({
    washMethod: 'machine', maxTemperatureC: 50, cycle: 'delicate', bleach: 'non_chlorine', dryMethod: 'tumble_dry', dryHeat: 'medium', ironSteam: 'not_allowed',
  })
})

test('hand wash keeps the triangle, square and iron; dry clean only keeps the iron; no answer on the tub stores unknown', () => {
  // Dots and bars left from a machine tub are not carried into another way of washing.
  const leftover = { dots: 3, bars: 2, bleach: 'none', dryer: 'low', natural: null } as const
  expect(tagAnswers({ ...emptyTag, ...leftover, method: 'hand_wash', iron: 'no' })).toEqual({ washMethod: 'hand_wash', bleach: 'none', dryMethod: 'tumble_dry', dryHeat: 'low', ironSteam: 'not_allowed' })
  expect(tagAnswers({ ...emptyTag, ...leftover, method: 'dry_clean_only' })).toEqual({ washMethod: 'dry_clean_only' })
  expect(tagAnswers({ ...emptyTag, method: 'no_tag', bleach: 'unknown', dryer: 'unknown' })).toEqual({ washMethod: 'unknown' })
})

test('the tag step stores exactly what the shared tag rows store for the same taps', () => {
  const drafts: TagDraft[] = [
    machine({ dots: 1, bars: 1, bleach: 'any', dryer: 'low', iron: 'medium' }),
    machine({ dots: 4, bars: 2, bleach: 'none', dryer: 'no_tumble', natural: 'flat' }),
    { ...emptyTag, method: 'hand_wash', bleach: 'non_chlorine', dryer: 'no_tumble', natural: 'drip' },
    { ...emptyTag, method: 'dry_clean_only', iron: 'no' },
    { ...emptyTag, method: 'no_tag', bleach: 'unknown', dryer: 'tumble' },
  ]
  const wash = { machine: 'machine', hand_wash: 'hand_wash', do_not_wash: 'do_not_wash', dry_clean_only: 'dry_clean_only', no_tag: 'unknown' } as const
  for (const draft of drafts) {
    const { method, ...rows } = draft
    expect(tagAnswers(draft)).toEqual(tagRowsAnswers({ ...rows, wash: method === null ? null : wash[method] }))
  }
})

test('recorded care reads back as the same answers', () => {
  const care = { washMethod: 'machine', cycle: 'delicate', maxTemperatureC: 40, dryMethod: 'tumble_dry', dryHeat: 'medium', ironSteam: 'not_allowed', bleach: 'non_chlorine' } as const
  const draft = tagDraftFromCare(care)
  expect(draft).toEqual({ method: 'machine', dots: 2, bars: 2, bleach: 'non_chlorine', dryer: 'medium', natural: null, iron: 'no' })
  expect(tagAnswers(draft)).toEqual({ washMethod: 'machine', maxTemperatureC: 40, cycle: 'delicate', bleach: 'non_chlorine', dryMethod: 'tumble_dry', dryHeat: 'medium', ironSteam: 'not_allowed' })
  expect(tagDraftFromCare(null)).toEqual(emptyTag)
  // No triangle recorded is "Tag doesn't say"; an iron recorded without its dots is stored again as it was.
  const { bleach: _, ...noTriangle } = care
  expect(tagDraftFromCare(noTriangle).bleach).toBe('unknown')
  expect(tagAnswers(tagDraftFromCare({ ...care, ironSteam: 'allowed' }))?.ironSteam).toBe('allowed')
  expect(tagDraftFromCare({ ...care, washMethod: 'unknown', cycle: null, maxTemperatureC: null, dryMethod: 'unknown', dryHeat: null, ironSteam: null }))
    .toMatchObject({ method: 'no_tag', dots: 0, bars: 0, dryer: 'unknown', iron: 'unknown' })
  expect(tagDraftFromCare({ ...care, cycle: 'permanent_press' })).toMatchObject({ method: 'machine', bars: 1 })
  // Anything the rows can't show is asked again, never guessed.
  expect(tagDraftFromCare({ ...care, washMethod: 'do_not_wash' }).method).toBe('do_not_wash')
  expect(tagDraftFromCare({ ...care, cycle: null }).method).toBeNull()
  expect(tagDraftFromCare({ ...care, washMethod: 'hand_wash', cycle: null })).toMatchObject({ method: 'hand_wash', dots: 0, bars: 0 })
  expect(tagDraftFromCare({ ...care, washMethod: 'do_not_wash', dryMethod: 'unknown', dryHeat: null, bleach: null })).toMatchObject({ method: 'do_not_wash', bleach: 'unknown', dryer: 'unknown' })
  expect(tagDraftFromCare({ ...care, dryMethod: 'line_dry', dryHeat: null })).toMatchObject({ dryer: 'no_tumble', natural: 'line' })
  expect(tagDraftFromCare({ ...care, dryMethod: 'dry_flat', dryHeat: null })).toMatchObject({ dryer: 'no_tumble', natural: 'flat' })
  expect(tagDraftFromCare({ ...care, dryMethod: 'do_not_tumble_dry', dryHeat: null })).toMatchObject({ dryer: 'no_tumble', natural: null })
  expect(tagDraftFromCare({ ...care, dryHeat: null }).dryer).toBe('tumble')
  expect(tagDraftFromCare({ ...care, dryHeat: 'no_heat' }).dryer).toBe('no_heat')
  expect(tagDraftFromCare({ ...care, dryHeat: 'high' }).dryer).toBe('high')
})

test('numeric and hand-wash limits survive unrelated edits without selecting a warmer dot', () => {
  const care = { washMethod: 'machine', cycle: 'delicate', maxTemperatureC: 35, dryMethod: 'line_dry', dryHeat: null, ironSteam: null } as const
  const draft = tagDraftFromCare(care)
  expect(draft).toMatchObject({ dots: 0, maxTemperatureC: 35 })
  expect(tagAnswers({ ...draft, bleach: 'none', iron: 'low' })).toMatchObject({ maxTemperatureC: 35, ironHeat: 'low' })
  expect(tagEcho(draft)).toContain('35 °C maximum')
  expect(renderToStaticMarkup(<TagStep value={draft} onChange={() => {}} />)).toContain('Recorded wash limit: 35')
  const hand = tagDraftFromCare({ ...care, washMethod: 'hand_wash', maxTemperatureC: 25 })
  expect(tagAnswers(hand)).toMatchObject({ washMethod: 'hand_wash', maxTemperatureC: 25 })
  expect(tagAnswers({ ...draft, steamPermission: 'unknown' })).not.toHaveProperty('steamPermission')
})

/** The tag rows' markup, from the washtub row's label on: the part the step shares with TagRows. */
const rowsOf = (markup: string) => {
  const rows = markup.replace(/ (id|aria-labelledby)="[^"]*"/g, '')
  return rows.slice(rows.indexOf('<div class="bulk-row" role="group" data-need="wash"')).replace(/<\/div>$/, '')
}

test('the step asks the same four rows with the same symbol tiles and words as the shared tag rows', () => {
  const render = (value: TagDraft) => renderToStaticMarkup(<TagStep value={value} onChange={() => undefined} />)
  const blank = render(emptyTag)
  for (const word of ['Washtub on the tag', 'Any temperature', 'Cold', 'Warm', 'Hot', 'Cold, permanent press', 'Cold, delicate', 'Hand wash', 'Do not wash', 'Tag doesn’t say', 'Something else',
    'Bleach triangle', 'Any bleach', 'Non-chlorine bleach only', 'Do not bleach',
    'Dryer square', 'Any heat', 'Low heat', 'Medium heat', 'High heat', 'No heat', 'Do not tumble dry', 'Iron', 'Steam instruction on the label']) expect(blank).toContain(word)
  // Optional iron and steam default to unknown without granting either permission.
  expect((blank.match(/aria-pressed="true"/g) ?? []).length).toBe(2)

  // The crossed tub is dry clean only: no triangle or square.
  const dryClean = render({ ...emptyTag, method: 'dry_clean_only' })
  expect(dryClean).not.toContain('Bleach triangle')
  expect(dryClean).not.toContain('Dryer square')
  expect(dryClean).toContain('Steam instruction on the label')

  // "Do not tumble dry" opens how it dries instead; an iron answer shows the iron row.
  const flat = render(machine({ dryer: 'no_tumble', natural: 'flat', iron: 'no' }))
  for (const word of ['How it dries instead', 'Line dry', 'Dry flat', 'Drip dry', 'Iron', 'Do not iron']) expect(flat).toContain(word)
  // A tub with no tile opens the dots and bars rows by itself.
  expect(render(machine({ dots: 4, bars: 2 }))).toContain('Bars under the tub')

  // Tile for tile, the same markup as TagRows for the same answers.
  const answers = { dots: 1, bars: 2, bleach: 'none', dryer: 'no_tumble', natural: 'line', iron: 'unknown' } as const
  const inRows = renderToStaticMarkup(<TagRows value={{ wash: 'machine', ...answers }} onChange={() => undefined} />)
  expect(rowsOf(inRows)).toContain('Steam instruction on the label')
  expect(rowsOf(render(machine(answers)))).toBe(rowsOf(`<div class="tag-step">${inRows}</div>`))
  for (const markup of [blank, flat]) assertPlainCopy(markup)
})

test('a tap on a tile changes only that answer; the crossed tub prohibits washing', () => {
  const changes: TagDraft[] = []
  const value = machine({ dots: 2, bleach: 'any' })
  const step = TagStep({ value, onChange: (tag) => changes.push(tag) }) as ReactElement<{ children: ReactElement<{ onChange: (patch: TagRowsPatch) => void }> }>
  const tap = step.props.children.props.onChange
  tap({ wash: 'do_not_wash', dots: 0, bars: 0 })
  tap({ wash: 'unknown', dots: 0, bars: 0 })
  tap({ wash: 'machine', dots: 4, bars: 1 })
  tap({ dryer: 'no_tumble' })
  tap({ iron: 'low' })
  expect(changes).toEqual([
    { ...value, method: 'do_not_wash', dots: 0 },
    { ...value, method: 'no_tag', dots: 0 },
    { ...value, method: 'machine', dots: 4, bars: 1 },
    { ...value, dryer: 'no_tumble' },
    { ...value, iron: 'low' },
  ])
})

test('the tag in a few words, for the button that saves it', () => {
  expect(tagEcho(emptyTag)).toBeNull()
  expect(tagEcho({ ...emptyTag, method: 'machine' })).toBeNull()
  expect(tagEcho(machine())).toBe('Any temperature')
  expect(tagEcho(machine({ dots: 1, dryer: 'low' }))).toBe('Cold · Low heat')
  expect(tagEcho(machine({ dots: 4, dryer: 'tumble' }))).toBe('Machine wash, very hot · Any heat')
  expect(tagEcho({ ...emptyTag, method: 'do_not_wash' })).toBe('Do not wash')
  expect(tagEcho({ ...emptyTag, method: 'dry_clean_only' })).toBe('Dry clean only')
  expect(tagEcho({ ...emptyTag, method: 'no_tag', bleach: 'unknown', dryer: 'unknown' })).toBe('Tag doesn’t say')
})

test('iron heat round-trips without granting steam; an explicit steam instruction is independent', () => {
  for (const iron of ['low', 'medium', 'high'] as const) {
    const answers = tagAnswers(machine({ iron }))!
    expect(answers).toMatchObject({ ironSteam: 'allowed', ironHeat: iron })
    expect(answers).not.toHaveProperty('steamPermission')
    const care = { cycle: 'normal', maxTemperatureC: null, dryMethod: 'unknown', dryHeat: null, ...answers, ironSteam: answers.ironSteam ?? null } as const
    expect(tagAnswers(tagDraftFromCare(care))).toEqual(answers)
  }
  expect(tagAnswers(machine({ iron: 'low', steamPermission: 'not_allowed' }))).toMatchObject({ ironHeat: 'low', steamPermission: 'not_allowed' })
  expect(tagAnswers(machine({ steamPermission: 'allowed' }))).toMatchObject({ steamPermission: 'allowed' })
})

test('the washtub offers Dry clean only beside Do not wash, so a cleaner-only tag can be recorded', () => {
  const markup = renderToStaticMarkup(<TagRows value={tagRows(emptyTag)} onChange={() => undefined} />)
  expect(markup).toContain('Dry clean only')
  expect(markup).toContain('Do not wash')
  expect(tagRowsAnswers({ ...tagRows(emptyTag), wash: 'dry_clean_only' })).toMatchObject({ washMethod: 'dry_clean_only' })
})

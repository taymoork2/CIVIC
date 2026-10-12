import { existsSync } from 'node:fs'
import { renderToStaticMarkup } from '@/test/markup'
import { expect, test } from 'vitest'

import { assertPlainCopy } from '@/kit/test-copy'
import { DoseBody, type MachineStepAction } from '@/laundry/machine-step'
import * as ui from '@/kit/ui'
import { MachineArt, ProductArt } from '@/household/household-art'
import type { Supply } from '@/household/inventory-types'
import { Checkbox } from '@/components/ui/checkbox'
import { GarmentIcon, garmentIconPaths } from '@/kit/garment-icon'
import { ChipRow, Choices, CountGlyph, CountPicker, Cup, DoseFigure, DotsPicture, DrumPictures, HeLogo, NotWornSymbol, Stepper, WasherClassLabel, dryingCareText, label, placementLabels, slotName, soilLabels, stageLabels } from '@/kit/ui'

const count = (markup: string, pattern: RegExp) => markup.match(pattern)?.length ?? 0

test('startup and screen loading announce the pending content without presenting fake controls', () => {
  for (const startup of [false, true]) {
    const markup = renderToStaticMarkup(<ui.Loading what="your household" startup={startup} />)
    expect(markup).toContain('role="status"')
    expect(count(markup, /Loading your household…/g)).toBe(1)
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).not.toMatch(/<(button|input|a)\b/)
    expect(markup).toContain(startup ? 'Getting things ready…' : 'skeleton-row')
  }
})

test('every clothing type has its own line icon, unknown kinds fall back to Other, and the colour dot is opt-in', () => {
  const kinds = ['t_shirt', 'shirt', 'sweater', 'pants', 'shorts', 'skirt', 'dress', 'outerwear', 'suit', 'pajamas', 'underwear', 'socks', 'workout', 'baby_bodysuit', 'towel', 'sheets', 'other']
  expect(Object.keys(garmentIconPaths).sort()).toEqual([...kinds].sort())
  expect(new Set(Object.values(garmentIconPaths)).size).toBe(kinds.length)
  const markup = renderToStaticMarkup(<GarmentIcon kind="pants" />)
  expect(markup).toContain('aria-hidden="true"')
  expect(markup).toContain('stroke="currentColor"')
  expect(markup).not.toContain('data-colour')
  for (const kind of [null, 'unrecognized']) expect(renderToStaticMarkup(<GarmentIcon kind={kind} />)).toContain(garmentIconPaths.other)
  expect(renderToStaticMarkup(<GarmentIcon kind="t_shirt" colorGroup="dark" />)).toContain('data-colour="dark"')
  expect(renderToStaticMarkup(<GarmentIcon kind="t_shirt" colorGroup="saturated" />)).toContain('#d9453b')
  expect(renderToStaticMarkup(<GarmentIcon kind="t_shirt" colorGroup={null} />)).toContain('data-colour="unknown"')
})

test('category photos cover packaging and appliances with existing local assets', () => {
  const supply = { name: 'Example detergent', kind: 'chemical', use: 'detergent', formulation: { form: 'liquid' } } as Supply
  const markup = renderToStaticMarkup(<>
    <MachineArt type="front_load_washer" /><MachineArt type="top_load_washer" /><MachineArt type="tumble_dryer" />
    <ProductArt supply={supply} /><ProductArt supply={{ ...supply, kind: 'wool_dryer_ball' }} />
  </>)
  const sources = [...markup.matchAll(/src="([^"]+)"/g)].map((match) => match[1]!)
  expect(sources).toHaveLength(5)
  for (const source of sources) expect(existsSync(new URL('../../public' + source, import.meta.url))).toBe(true)
  expect(markup).not.toContain('<svg')
})

test('a cup with marks draws one tick per mark and fills to the planned one', () => {
  const markup = renderToStaticMarkup(<Cup amount={1} unit="cap" marks={['1', '3', '5']} mark="3" state="now" />)
  expect(markup).toContain('has-marks')
  expect(count(markup, /class="cup-tick/g)).toBe(3)
  expect(count(markup, /cup-tick is-planned/g)).toBe(1)
  expect(markup).toContain('cup-fill')
  // A mark that is not on the cap fills nothing.
  expect(renderToStaticMarkup(<Cup amount={1} unit="cap" marks={['1', '3', '5']} mark="4" />)).not.toContain('cup-fill')
  expect(renderToStaticMarkup(<Cup amount={30} unit="ml" />)).not.toContain('cup-tick')
})

test('a counted dose draws the laundry items themselves, at most six', () => {
  expect(count(renderToStaticMarkup(<CountGlyph amount={2} unit="pods" />), /<circle/g)).toBe(2)
  expect(count(renderToStaticMarkup(<CountGlyph amount={9} unit="sheet" />), /<rect/g)).toBe(6)
})

test('the step in hand reads the mark as one sentence, with the volume after it and no reason line', () => {
  const markup = renderToStaticMarkup(
    <DoseFigure size="now" id="now-title" dose={{ amount: 1, unit: 'cap', mark: 'Line 2', equivalent: { amount: 30, unit: 'ml' } }} />,
  )
  expect(markup).toMatch(/<p class="dose-line" id="now-title"><span aria-hidden="true"><span class="now-lead">Fill the cap to<\/span>/)
  expect(markup).toContain('<span class="mark-word">Line </span><span class="mark-figure">2</span>')
  expect(markup).toContain('<p class="equivalent">≈ 30 ml</p>')
  expect(markup).not.toContain('basis')
  expect(markup).toContain('<span class="visually-hidden">Fill the cap to line 2, about 30 ml</span>')
  // A row carries the mark without the instruction.
  expect(renderToStaticMarkup(<DoseFigure dose={{ amount: 1, unit: 'cap', mark: 'Line 2' }} />)).not.toContain('now-lead')
})

test('a machine dose draws the cap only from its recorded marks, and names the mark and approximate volume', () => {
  const action: MachineStepAction = {
    id: 'dose', kind: 'treatment', phase: 'dispenser', supplyId: 'product', supplyName: 'Detergent', placement: 'detergent_compartment',
    dose: { amount: 1, unit: 'cap', mark: 'Line 2', marks: ['Line 1', 'Line 2', 'Line 3'], equivalent: { amount: 30, unit: 'ml' } },
  }
  const markup = renderToStaticMarkup(<DoseBody action={action} slot={null} />)
  expect(markup).toContain('≈ 30 ml')
  expect(markup).toContain('Fill the cap to line 2, about 30 ml')
  expect(markup).toContain('machine-step-cap')
  expect(markup).toContain('cup-tick')
  // Without the cap's printed marks there is no level to draw, so no graphic is guessed.
  expect(renderToStaticMarkup(<DoseBody action={{ ...action, dose: { amount: 1, unit: 'cap', mark: 'Line 2' } }} slot={null} />)).not.toContain('machine-step-cap')
  expect(renderToStaticMarkup(<DoseBody action={{ ...action, dose: { ...action.dose!, fractionOfMark: 0.5 } }} slot={null} />)).not.toContain('cup-tick')
  expect(renderToStaticMarkup(<DoseBody action={{ ...action, dose: { ...action.dose!, target: 'below' } }} slot={null} />)).not.toContain('cup-tick')
  expect(renderToStaticMarkup(<DoseBody action={{ ...action, dose: { ...action.dose!, mark: 'Line 4' } }} slot={null} />)).not.toContain('cup-tick')
})

test('the stepper names what it counts and holds its bounds', () => {
  const markup = renderToStaticMarkup(<Stepper label="Fills" value={1} min={1} max={4} onChange={() => undefined} />)
  expect(markup).toContain('aria-label="Less: Fills" disabled=""')
  expect(markup).toContain('aria-label="More: Fills">')
})

test('washer forms offer washer places only; a rule or step reads either', () => {
  expect(Object.keys(placementLabels)).not.toContain('dryer_drum')
  expect(Object.keys(stageLabels)).not.toContain('dry')
  expect(slotName('dryer_drum')).toBe('In the dryer')
  expect(label('dryer_drum')).toBe('In the dryer drum')
  expect(label('dry')).toBe('Drying')
  expect(label('tumble_dryer')).toBe('Tumble dryer')
})

test('drying care and soil read in the words of the tag step', () => {
  expect(dryingCareText('tumble_dry', 'low')).toBe('Dryer, low heat')
  expect(dryingCareText('tumble_dry', null)).toBe('Dryer, any heat')
  expect(dryingCareText('dry_flat', null)).toBe('Dry flat')
  expect(dryingCareText('drip_dry', null)).toBe("Hang wet, don't wring")
  expect(dryingCareText(null, null)).toBe("Tag doesn't say")
  expect(soilLabels).toEqual({ light: 'A little', normal: 'Normal', heavy: 'Very dirty' })
})

test('removed primitives are no longer exported', () => {
  for (const name of ['conditionText', 'basisText', 'washerClassLabels', 'RuleConditionsLike']) expect(Object.keys(ui)).not.toContain(name)
})

test('inside a sentence a dose is its printed mark or count alone', () => {
  const mark = renderToStaticMarkup(<DoseFigure size="inline" dose={{ amount: 1, unit: 'cap', mark: 'Line 1' }} />)
  expect(mark).toContain('<span class="mark-word">Line </span><span class="mark-figure">1</span>')
  expect(mark).not.toContain('Fill the cap')
  expect(mark).toContain('<span class="visually-hidden">line 1</span>')
  expect(renderToStaticMarkup(<DoseFigure size="inline" dose={{ amount: 2, unit: 'pod' }} />)).toContain('<span class="mark-figure">2</span> pods')
})

test('in pick mode every printed mark is its own button, highest first, and the cap fills to the pick', () => {
  const markup = renderToStaticMarkup(<Cup amount={null} unit="cap" marks={['1', '3', '5']} mark="3" onPick={() => undefined} label="Fill line for a large load" />)
  expect(markup).toContain('role="group" aria-label="Fill line for a large load"')
  expect([...markup.matchAll(/<button type="button" class="cup-pick-mark" aria-pressed="(true|false)">([^<]*)<\/button>/g)].map((match) => [match[2], match[1]]))
    .toEqual([['5', 'false'], ['3', 'true'], ['1', 'false']])
  expect(count(markup, /cup-tick is-planned/g)).toBe(1)
  expect(markup).toContain('cup-fill')
  // Nothing picked yet: an empty cap, every mark unpressed.
  const empty = renderToStaticMarkup(<Cup amount={null} unit="cap" marks={['Line 1', 'Max']} mark={null} onPick={() => undefined} />)
  expect(empty).not.toContain('cup-fill')
  expect(empty).not.toContain('aria-pressed="true"')
  // A scoop draws a scoop, and a cap without marks has nothing to pick.
  expect(renderToStaticMarkup(<Cup amount={null} unit="scoop" marks={['1', '2']} mark="2" onPick={() => undefined} />)).toContain('cup is-scoop')
  expect(renderToStaticMarkup(<Cup amount={30} unit="ml" onPick={() => undefined} />)).not.toContain('button')
  assertPlainCopy(markup)
})

test('a count picker offers 1 to 4 and speaks the unit', () => {
  const markup = renderToStaticMarkup(<CountPicker label="How many pods?" value={2} unit="pods" onPick={() => undefined} />)
  expect(count(markup, /class="count-picker-option"/g)).toBe(4)
  expect(markup).toContain('aria-pressed="true"><span aria-hidden="true">2</span><span class="visually-hidden">2 pods</span>')
  expect(markup).toContain('1 pod</span>')
})

test('the logo is the only way HE appears, and it never spells the letters', () => {
  const logo = renderToStaticMarkup(<HeLogo />)
  expect(logo).toContain('role="img" aria-label="high-efficiency logo"')
  expect(logo).toContain('>he</text>')
  const labels = renderToStaticMarkup(<p><WasherClassLabel value="he" /> <WasherClassLabel value="standard" /></p>)
  expect(labels).toContain('Has this logo <svg')
  expect(labels).toContain('No <svg')
  assertPlainCopy(labels)
})

test('the drum pictures run from a quarter to full and mark the chosen one', () => {
  const markup = renderToStaticMarkup(<DrumPictures legend="How full is the drum?" value="large" onPick={() => undefined} />)
  expect([...markup.matchAll(/<button type="button" class="drum-picture" aria-pressed="(true|false)">.*?<span>([^<]*)<\/span><\/button>/g)].map((match) => [match[2], match[1]]))
    .toEqual([['A quarter', 'false'], ['Half', 'false'], ['Three quarters', 'true'], ['Full', 'false']])
  expect(markup).toContain('How full is the drum?')
  assertPlainCopy(markup)
  // Saving a pick only disables them; a copy that can't be recorded here also marks them as off.
  const saving = renderToStaticMarkup(<DrumPictures legend="How full is the drum?" value={null} disabled onPick={() => undefined} />)
  expect(count(saving, /disabled=""/g)).toBe(4)
  expect(saving).not.toContain('is-read-only')
  const readOnly = renderToStaticMarkup(<DrumPictures legend="How full is the drum?" value={null} readOnly onPick={() => undefined} />)
  expect(count(readOnly, /disabled=""/g)).toBe(4)
  expect(readOnly).toContain('class="drum-pictures is-washer is-read-only"')
})

test('dots draw soil, water and dryer heat, and are silent unless labelled', () => {
  const soil = renderToStaticMarkup(<DotsPicture dots={2} />)
  expect(count(soil, /class="dot is-on"/g)).toBe(2)
  expect(count(soil, /class="dot"/g)).toBe(1)
  expect(soil).toContain('aria-hidden="true"')
  expect(count(renderToStaticMarkup(<DotsPicture dots={4} symbol="tub" />), /is-on/g)).toBe(4)
  expect(renderToStaticMarkup(<DotsPicture dots={1} symbol="dryer" label="Low heat" />)).toContain('role="img" aria-label="Low heat"')
})

test('the not-worn mark shows the short month and says the whole laundry item', () => {
  const now = new Date(2026, 8, 27).getTime()
  const markup = renderToStaticMarkup(<NotWornSymbol since={new Date(2026, 5, 3).getTime()} now={now} />)
  expect(markup).toContain('<span aria-hidden="true">Jun</span>')
  expect(markup).toContain('Not worn since June')
  expect(renderToStaticMarkup(<NotWornSymbol since={new Date(2025, 5, 3).getTime()} now={now} />)).toContain('Not worn since June 2025')
})

test('a chip row marks its chosen chip, or several', () => {
  const options = [{ value: 'any', label: 'Any' }, { value: 'work', label: 'Work' }, { value: 'sleep', label: 'Sleep' }] as const
  const single = renderToStaticMarkup(<ChipRow label="For what" options={options} value="work" onChange={() => undefined} />)
  expect(count(single, /aria-pressed="true"/g)).toBe(1)
  expect(single).toContain('aria-pressed="true">Work</button>')
  const many = renderToStaticMarkup(<ChipRow label="What happened?" hideLabel options={options} values={['any', 'sleep']} onToggle={() => undefined} />)
  expect(count(many, /aria-pressed="true"/g)).toBe(2)
  expect(many).toContain('class="visually-hidden">What happened?</span>')
})

test('a picked choice chip is marked by more than its fill, and a mixed checkbox shows a dash', () => {
  const markup = renderToStaticMarkup(<Choices label="Door" options={['front', 'top'] as const} value="top" onPick={() => undefined} words={(door) => door} />)
  expect(markup).toContain('aria-pressed="true"')
  for (const variant of ['text', 'answer', 'symbol'] as const) expect(ui.choiceChipVariants({ variant })).toContain('aria-pressed:shadow-[var(--selected-ring)]')
  const mixed = renderToStaticMarkup(<Checkbox aria-label="Use my results" indeterminate checked={false} />)
  expect(mixed).toContain('data-indeterminate')
  expect(count(mixed, /<svg/g)).toBe(2)
})

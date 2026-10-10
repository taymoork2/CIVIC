import { expect, test } from 'vitest'
import { ProcessRequirements } from '@/closet/care-instructions'
import { renderToStaticMarkup } from '@/test/markup'

test('severity is an explicit source-bound choice with unknown default and a single accessible acknowledgment', () => {
  const wording = 'Very mild process; use fragrance-free detergent'
  const markup = renderToStaticMarkup(<ProcessRequirements stage="washing" lines={[wording]} value={[{ wording, checked: false, requirements: [{ kind: 'maximum_mechanical_severity', value: 'very_mild' }, { kind: 'detergent_fragrance_free' }] }]} onChange={() => undefined} />)
  expect(markup).toContain(wording)
  expect(markup).toContain('Maximum mechanical severity')
  expect(markup).toContain('Not recorded or unclear')
  expect(markup).toContain('value="very_mild" selected=""')
  expect(markup).toContain('A program name does not establish severity.')
  expect(markup).toContain('Use fragrance-free detergent')
  expect(markup).toContain('Use dye-free detergent')
  expect(markup).toContain('Use detergent without bleach')
  expect(markup).not.toContain('aria-label="I’ve checked')
  expect(markup).not.toContain('type="number"')
  expect(markup).toContain('Leave unclear or conflicting lines unresolved; they still block the process.')
})

test('detergent and mechanical conditions are washing-only; exact numeric limits stay editable separately', () => {
  const wording = 'No spin; shade'
  const dry = renderToStaticMarkup(<ProcessRequirements stage="drying" lines={[wording]} value={[]} onChange={() => undefined} />)
  expect(dry).not.toContain('Maximum mechanical severity')
  expect(dry).not.toContain('detergent_fragrance_free')
  expect(dry).toContain('Dry in shade')
  const wash = renderToStaticMarkup(<ProcessRequirements stage="washing" lines={['Spin at most 400 rpm']} value={[{ wording: 'Spin at most 400 rpm', checked: true, requirements: [{ kind: 'maximum_spin_rpm', value: 400 }] }]} onChange={() => undefined} />)
  expect(wash).toContain('type="number"')
  expect(wash).toContain('value="400"')
})

test('first-wash separation is a washing-only checked interpretation, with no default permission', () => {
  const wording = 'Wash separately for the first wash only'
  const wash = renderToStaticMarkup(<ProcessRequirements stage="washing" lines={[wording]} value={[]} onChange={() => undefined} />)
  expect(wash).toContain('value="wash_alone_first_wash"')
  expect(wash).toContain('Wash alone for the first wash only')
  expect(wash).not.toContain('Unknown history needs confirmation.')
  expect(wash).not.toContain('type="checkbox"')
  expect(wash).toContain('Keep unresolved / choose condition')
  const recorded = renderToStaticMarkup(<ProcessRequirements stage="washing" lines={[wording]} value={[{ wording, checked: false, requirements: [{ kind: 'wash_alone_first_wash' }, { kind: 'no_bleach' }] }]} onChange={() => undefined} />)
  expect(recorded).toContain(wording)
  expect(recorded).toContain('Unknown history needs confirmation.')
  expect(recorded).toContain('No bleach')
  expect(recorded).toContain('I’ve checked that these conditions cover this entire source line')
  expect(recorded).not.toContain('aria-checked="true"')
  const dry = renderToStaticMarkup(<ProcessRequirements stage="drying" lines={[wording]} value={[]} onChange={() => undefined} />)
  expect(dry).not.toContain('wash_alone_first_wash')
})

test('washing-phase limits require whole-line checking and remain distinct from soaking and cycle timers', () => {
  const wording = 'Wash phase at most 10 minutes; no spin'
  const markup = renderToStaticMarkup(<ProcessRequirements stage="washing" lines={[wording]} value={[{ wording, checked: false, requirements: [{ kind: 'maximum_wash_minutes', value: 10 }, { kind: 'no_spin' }] }]} onChange={() => undefined} />)
  expect(markup).toContain(wording)
  expect(markup).toContain('Maximum washing-phase duration (minutes)')
  expect(markup).toContain('value="10"')
  expect(markup).toContain('max="300"')
  expect(markup).toContain('Soaking, rinsing, spinning and total-cycle timers are separate.')
  expect(markup).toContain('documented phase duration must be checked separately.')
  expect(markup).toContain('No spin in any phase')
  expect(markup).toContain('I’ve checked that these conditions cover this entire source line')
  expect(markup).not.toContain('aria-checked="true"')
  const dry = renderToStaticMarkup(<ProcessRequirements stage="drying" lines={[wording]} value={[]} onChange={() => undefined} />)
  expect(dry).not.toContain('maximum_wash_minutes')
})

test('unconditional isolation and like-color conditions are separate from first-wash-only separation', () => {
  const wording = 'Wash alone every time; wash phase at most 10 minutes'
  const markup = renderToStaticMarkup(<ProcessRequirements stage="washing" lines={[wording]} value={[{ wording, checked: false, requirements: [{ kind: 'wash_alone' }, { kind: 'maximum_wash_minutes', value: 10 }] }]} onChange={() => undefined} />)
  expect(markup).toContain('Wash alone every time')
  expect(markup).toContain('value="wash_with_like_colors"')
  expect(markup).toContain('value="wash_alone_first_wash"')
  expect(markup).toContain('Maximum washing-phase duration (minutes)')
  expect(markup).not.toContain('aria-checked="true"')
  const dry = renderToStaticMarkup(<ProcessRequirements stage="drying" lines={[wording]} value={[]} onChange={() => undefined} />)
  expect(dry).not.toContain('wash_alone')
  expect(dry).not.toContain('wash_with_like_colors')
})

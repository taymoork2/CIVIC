import { expect, test } from 'vitest'

import { ActionGroup, AnswerRow, MachineEntry, SwitchRow, dryerEntryWords } from '@/laundry/laundry-ui'
import { ToggleRow } from '@/laundry/question-parts'
import { renderToStaticMarkup } from '@/test/markup'

const dryers = Array.from({ length: 20 }, (_, index) => ({ machineId: `d${index + 1}`, name: `Dryer ${index + 1}` }))
const entry = (recent: readonly string[], options = dryers) => renderToStaticMarkup(
  <MachineEntry id="x" shared options={options} recent={recent} pending={false} onPick={() => undefined} words={dryerEntryWords} />,
)

test('settings and checklist rows announce their separate states and respect disabled input', () => {
  for (const role of ['switch', 'checkbox'] as const) {
    const markup = renderToStaticMarkup(<SwitchRow role={role} media={null} title="Independent choice" on={false} disabled onToggle={() => undefined} />)
    expect(markup).toContain(`role="${role}" aria-checked="false"`)
    expect(markup).toContain('disabled=""')
    expect(markup).not.toContain('role="radio"')
    expect(markup).not.toContain('aria-pressed')
  }
  const answer = renderToStaticMarkup(<ToggleRow title="Applies to every load" pressed disabled onClick={() => undefined} />)
  expect(answer).toContain('role="checkbox" aria-checked="true"')
  expect(answer).toContain('disabled=""')
  expect(answer).not.toContain('aria-pressed')
})

test('the machine number is the main input; only the few machines this household used last are shortcuts, the rest behind Show all', () => {
  const markup = entry(['d14', 'd3', 'd9', 'd1'])
  expect(markup).toContain('inputMode="numeric"')
  expect(markup.indexOf('Which dryer are you using?')).toBeLessThan(markup.indexOf('Previously used'))
  // Three recent dryers as chips, newest first; the fourth recent and the other sixteen are not on the page.
  expect(markup.indexOf('>Dryer 14<')).toBeLessThan(markup.indexOf('>Dryer 3<'))
  expect([...markup.matchAll(/>Dryer \d+</g)]).toHaveLength(3)
  expect(markup).toContain('All 20 dryers')
  expect(markup).toContain('aria-expanded="false"')
  expect(markup).not.toMatch(/\bis free\b|\bavailable\b/)
  // No history, many dryers: nothing is "Previously used", only the field and Show all.
  const none = entry([])
  expect(none).not.toContain('Previously used')
  expect([...none.matchAll(/>Dryer \d+</g)]).toHaveLength(0)
  expect(none).toContain('All 20 dryers')
  // A room of two lists both, with nothing to hide.
  expect([...entry([], dryers.slice(0, 2)).matchAll(/>Dryer \d+</g)]).toHaveLength(2)
})

test('two or three short answers are one row of equal buttons; actions are two side by side or one grouped list', () => {
  const answers = ['Gone', 'Lighter', 'Still there'].map((label) => ({ label, onClick: () => undefined }))
  const row = renderToStaticMarkup(<AnswerRow label="Stain gone?" answers={answers} />)
  expect(row).toContain('role="group"')
  expect([...row.matchAll(/<button/g)]).toHaveLength(3)
  const actions = (count: number) => Array.from({ length: count }, (_, index) => ({ label: `Action ${index + 1}`, onClick: () => undefined }))
  const pair = renderToStaticMarkup(<ActionGroup label="More" actions={actions(2)} />)
  expect(pair).not.toContain('<ul')
  expect([...pair.matchAll(/<button/g)]).toHaveLength(2)
  const list = renderToStaticMarkup(<ActionGroup label="What next?" actions={[...actions(4), { label: 'Retire it', quiet: true, onClick: () => undefined }]} />)
  expect(list).toContain('<ul')
  expect([...list.matchAll(/<li/g)]).toHaveLength(5)
  // The rare, final action is last.
  expect(list.indexOf('Action 1')).toBeLessThan(list.indexOf('Retire it'))
})

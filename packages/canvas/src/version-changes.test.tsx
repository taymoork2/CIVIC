import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VersionChanges, type VersionChange } from './version-changes'

const comparison: VersionChange = { id: 'candidate', status: 'same', summary: 'No scoped UI code or state changes', states: { added: [], removed: [] }, actions: { added: [], removed: [] }, text: { added: [], removed: [] }, fixtureChanged: false, stylesChanged: false, eventsChanged: false, totalChanges: 0, changes: [], limits: [], basis: 'Source comparison; runtime behavior is not verified.' }

test('comparison distinguishes matching source from verified behavior and unknown source', () => {
  const same = renderToStaticMarkup(<VersionChanges change={comparison} scope="Home" />)
  expect(same).toContain('local dependencies and registered states match')
  expect(same).toContain('runtime behavior is not verified')
  const unknown = renderToStaticMarkup(<VersionChanges change={{ ...comparison, status: 'unavailable', limits: ['Built source snapshot unavailable.'] }} scope="Home" />)
  expect(unknown).toContain('Built source snapshot unavailable')
  expect(unknown).not.toContain('registered states match')
})

test('actual changes are readable and source excerpts cannot execute markup', () => {
  const html = renderToStaticMarkup(<VersionChanges scope="Dialog" change={{ ...comparison, status: 'changed', text: { added: ['Save'], removed: ['Submit'] }, states: { added: ['error'], removed: [] }, totalChanges: 1, changes: [{ file: 'src/Dialog.tsx', name: 'Dialog', kind: 'selected', change: 'changed', before: '<script>alert(1)</script>', after: '<button>Save</button>', truncated: false }] }} />)
  expect(html).toContain('Text added:')
  expect(html).toContain('State added:')
  expect(html).toContain('src/Dialog.tsx')
  expect(html).toContain('&lt;script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).toContain('aria-label="Current source for Dialog"')
  expect(html).toContain('aria-label="Candidate source for Dialog"')
})

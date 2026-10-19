import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SharedNavigation } from './shared-navigation'
import { appFlows, flowEdges } from './app-map'
import { connectionBundles } from './connection-routing'

test('bundled paths stay contextual and expose each connection with readable labels', () => {
  const flows = appFlows([
    { id: 'home', label: 'Home', journey: 'Notes', renderer: 'test', edges: [{ action: 'Save', destination: 'saved' }] },
    { id: 'draft', label: 'Draft', journey: 'Notes', renderer: 'test', edges: [{ action: 'Save', destination: 'saved' }] },
    { id: 'saved', label: 'Saved', journey: 'Notes', renderer: 'test', edges: [] },
  ], { adapter: 'module', navigation: ['Screens'] })
  const group = connectionBundles(flowEdges(flows[0]!))[0]!
  expect(group).toBeDefined()
  expect(renderToStaticMarkup(<SharedNavigation flows={flows} select={() => {}} />)).toBe('')
  const html = renderToStaticMarkup(<SharedNavigation flows={flows} group={group} select={() => {}} />)
  expect(html).toContain('aria-label="Connections for Save"')
  expect(html).toContain('aria-label="Home → Saved"')
  expect(html).toContain('aria-label="Draft → Saved"')
  expect(html).not.toContain('<details')
  expect(html).not.toContain('Shared navigation')
})

import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VersionRow } from './version-row'

test('a collapsed version has one disclosure target and no preview-switch action', () => {
  const html = renderToStaticMarkup(<VersionRow id="running" label="Running app" expanded={false} current={false} disabled={false} toggle={() => {}} summary={<strong>Running app</strong>}><button>Open Live app</button></VersionRow>)
  expect(html.match(/<button/g)).toHaveLength(1)
  expect(html).toContain('aria-label="Preview options for Running app"')
  expect(html).toContain('aria-expanded="false"')
  expect(html).not.toContain('Open Live app')
})

test('expansion reveals a separate preview action while viewing and disclosure state remain distinct', () => {
  const html = renderToStaticMarkup(<VersionRow id="main" label="Main" expanded current disabled={false} toggle={() => {}} summary={<strong>Main</strong>}><button>Open Test copy</button></VersionRow>)
  expect(html.match(/<button/g)).toHaveLength(2)
  expect(html).toContain('aria-current="true"')
  expect(html).toContain('aria-expanded="true"')
  expect(html).toContain('Viewing')
  expect(html).toContain('role="region" aria-label="Previews for Main"')
  expect(html.indexOf('</button>')).toBeLessThan(html.indexOf('Open Test copy'))
})

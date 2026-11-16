import assert from 'node:assert/strict'
import { test } from 'node:test'
import { tagSources } from './review-source-tags.mjs'

test('tags host JSX with original locations only within declared development sources', () => {
  const project = { root: '/repo', sources: ['/repo/src'] }
  const code = 'const view = <Widget>\n  <button><span /></button>\n</Widget>'
  const tagged = tagSources(code, '/repo/src/view.tsx', project)
  assert.ok(tagged.includes('<Widget>'))
  assert.ok(tagged.includes('<button data-civic-source={"src/view.tsx:2:3"}>'))
  assert.ok(tagged.includes('<span  data-civic-source={"src/view.tsx:2:11"}/>'))
  assert.equal(tagSources(code, '/repo/src-other/view.tsx', project), code)
})

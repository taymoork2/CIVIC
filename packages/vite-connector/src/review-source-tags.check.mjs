import assert from 'node:assert/strict'
import { test } from 'node:test'
import { tagHostElements, tagSources } from './review-source-tags.mjs'
import loader from './review-source-tags-loader.mjs'

test('tags host JSX with original locations only within declared development sources', () => {
  const project = { root: '/repo', sources: ['/repo/src'] }
  const code = 'const view = <Widget>\n  <button><span /></button>\n</Widget>'
  const tagged = tagSources(code, '/repo/src/view.tsx', project)
  assert.ok(tagged.includes('<Widget>'))
  assert.ok(tagged.includes('<button data-civic-source={"src/view.tsx:2:3"}>'))
  assert.ok(tagged.includes('<span  data-civic-source={"src/view.tsx:2:11"}/>'))
  assert.equal(tagSources(code, '/repo/src-other/view.tsx', project), code)
})

for (const extension of ['tsx', 'jsx']) test(`shared transform and loader preserve original ${extension} coordinates`, () => {
  const file = `/repo/src/view.${extension}`
  const code = `${extension === 'tsx' ? 'const label: string' : 'const label'} = 'é😀';\nconst view = <><Widget /><svg><path /></svg><button /></>`
  const result = tagHostElements(code, file, { root: '/repo' })
  assert.ok(result.code.includes(`data-civic-source={"src/view.${extension}:2:26"}`))
  assert.ok(result.code.includes('<Widget />'))
  assert.equal(result.map, null)
  let calls = 0
  loader.call({ resourcePath: file, getOptions: () => ({ root: '/repo', include: ['src/**/*.tsx', 'src/**/*.jsx'] }), callback(error, output, map) {
    calls++
    assert.ifError(error)
    assert.equal(output, result.code)
    assert.equal(map, null)
  } }, code)
  assert.equal(calls, 1)
})

for (const [file, code] of [
  ['/elsewhere/view.tsx', 'const view = <div />'],
  ['/repo-other/view.jsx', 'const view = <div />'],
  ['/repo/node_modules/pkg/view.tsx', 'const view = <div />'],
  ['/repo/src/node_modules/pkg/view.jsx', 'const view = <div />'],
  ['/repo/src/view.tsx', 'const view = <Widget />'],
  ['/repo/src/plain.ts', 'const value = 1'],
]) test(`leaves ${file} without host JSX tagging`, () => {
  assert.equal(tagHostElements(code, file, { root: '/repo' }).code, code)
  const inputMap = { version: 3, sources: [file], mappings: '' }
  let calls = 0
  loader.call({ resourcePath: file, getOptions: () => ({ root: '/repo', include: ['**/*'] }), callback(error, output, map) {
    calls++
    assert.ifError(error)
    assert.equal(output, code)
    assert.equal(map, inputMap)
  } }, code, inputMap)
  assert.equal(calls, 1)
})

test('loader excludes unmatched sources and reports option and parse errors through callback', () => {
  for (const [options, code, fails] of [
    [{ root: '/repo', include: ['app/**/*.tsx'] }, 'const view = <div />', false],
    [{ root: 'relative', include: [] }, '', true],
    [{ root: '/repo', include: '**/*' }, '', true],
    [{ root: '/repo', include: ['**/*'] }, 'const view = <div', true],
  ]) {
    let calls = 0
    loader.call({ resourcePath: '/repo/src/view.tsx', getOptions: () => options, callback(error, output) {
      calls++
      assert.equal(Boolean(error), fails)
      if (!fails) assert.equal(output, code)
    } }, code)
    assert.equal(calls, 1)
  }
})

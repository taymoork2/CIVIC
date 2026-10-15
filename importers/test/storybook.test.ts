import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { componentStoriesIn, indexGraph, type GraphDocument, type PlatformComponent, type SemanticComponent } from '../../graph/src/index.ts'
import { readStorybookStories } from '../src/index.ts'

// The one-time Storybook import (decision 0013): Fluent's own Button stories become component
// stories, and the ones the contract already shows are pruned into it.

const dir = new URL('../../demo/fluent-button/sources/react-button-stories/', import.meta.url)
const files = readdirSync(dir).filter((name) => name.endsWith('.stories.tsx')).map((name) => ({ name, text: readFileSync(new URL(name, dir), 'utf8') }))
const graph = indexGraph(JSON.parse(readFileSync(new URL('../../demo/fluent-button/out/resolved.graph.json', import.meta.url), 'utf8')) as GraphDocument)
const component = graph.get('platform:fluent-react-v9.button') as PlatformComponent
const semantic = graph.get('semantic:button') as SemanticComponent
const read = (variantProperty = 'appearance') => readStorybookStories(files, { component, semantic, extensionPoints: graph.ofKind('extension-point'), variantProperty, packages: ['@fluentui/react-components'], path: 'stories' })

test('each element a story renders becomes a story with its variant, state and declared props', () => {
  const result = read()
  assert.equal(result.title, 'Components/Button/Button')
  assert.equal(result.stories.length, 31)
  assert.deepEqual(result.skipped, [])
  const circular = result.stories.find((story) => story.storybook![0]!.story === 'Shape' && story.props?.shape === 'circular')!
  assert.deepEqual([circular.id, circular.variant, circular.expression, circular.title], ['story:component.fluent-react-v9.button.neutral-default.shape-circular', 'neutral-default', 'secondary', 'Neutral default, shape circular'])
  const disabled = result.stories.find((story) => story.storybook![0]!.story === 'Disabled' && story.variant === 'primary-filled' && story.state === 'disabled')!
  assert.equal(disabled.props, undefined)
  // A prop set to an element is kept as set, and a prop no extension point declares is listed.
  const after = result.stories.find((story) => story.storybook![0]!.label === 'With calendar icon after contents')!
  assert.deepEqual([after.props, after.storybook![0]!.undeclared], [{ icon: null }, ['iconPosition']])
  // A story that passes its args through shows the default.
  const args = result.stories.find((story) => story.storybook![0]!.story === 'Default')!
  assert.deepEqual([args.variant, args.storybook![0]!.label], ['neutral-default', 'Example (its args)'])
})

test('a variant property the mapping does not know skips the element with the reason', () => {
  const result = read('shape')
  assert.ok(result.skipped.some((item) => item.why === 'shape="circular" maps to no semantic variant'))
})

test('imported stories the contract already shows are pruned into it; the rest are kept once each', () => {
  const imported = read().stories
  const stories = componentStoriesIn(graph, imported).filter((story) => story.componentId === component.id)
  const rest = stories.find((story) => story.id === 'story:component.fluent-react-v9.button.neutral-default')!
  assert.equal(rest.from, 'contract')
  assert.ok(rest.storybook!.some((ref) => ref.story === 'Shape' && ref.label === 'Rounded'))
  const kept = stories.filter((story) => story.from === 'storybook')
  assert.equal(new Set(kept.map((story) => story.id)).size, kept.length)
  assert.equal(stories.flatMap((story) => story.storybook ?? []).length, imported.length)
})

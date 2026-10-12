import { expect, test } from 'vitest'
import { feedbackOnScreen, type Feedback } from './review-panel'
import type { MapScreen } from './app-map'

const wash: MapScreen = { id: 'care:wash', label: 'Wash', scenario: 'intake.towel.care', partial: false, edges: [] }
const dry = { ...wash, id: 'care:dry', label: 'Dry' }
test('screen-targeted feedback keeps the separate care screens distinct despite their shared scenario', () => {
  const comment = { context: { screen: wash.id, scenario: wash.scenario } } as Feedback
  expect(feedbackOnScreen(comment, wash)).toBe(true)
  expect(feedbackOnScreen(comment, dry)).toBe(false)
})
test('older scenario-only reviews remain visible without inventing a screen identity', () => {
  const comment = { context: { scenario: wash.scenario } } as Feedback
  expect(feedbackOnScreen(comment, wash)).toBe(true)
  expect(feedbackOnScreen(comment, { ...wash, scenario: 'intake.towel.fabric' })).toBe(false)
})
test('a branch or flow review is not misidentified as feedback on its representative screen', () => {
  for (const kind of ['app', 'flow', 'path'] as const) {
    expect(feedbackOnScreen({ target: { kind, id: wash.id, label: 'Target' }, context: { screen: wash.id, scenario: wash.scenario } } as Feedback, wash)).toBe(false)
  }
  expect(feedbackOnScreen({ target: { kind: 'region', id: wash.id, label: 'Target' }, context: { screen: wash.id, scenario: wash.scenario } } as Feedback, wash)).toBe(true)
})

import { expect, test } from 'vitest'
import { connectionDescription, connectionStyle, interactionOf } from './connection-semantics'

test('interaction meaning uses an explicit type before conservative label inference', () => {
  for (const action of ['Back to Laundry', 'Cancel', 'Return to list', 'Close dialog']) expect(interactionOf({ action })).toBe('return')
  for (const action of ['Save item; finish intake', 'Confirm selected pieces dry', 'Transfer washed pieces', 'Put away selected dry pieces', 'Dismiss reminder']) expect(interactionOf({ action })).toBe('update')
  for (const action of ['Open settings', 'Next', 'Add clothes', 'Start setup', 'Review returned items', 'Open cancel policy']) expect(interactionOf({ action })).toBe('navigate')
  expect(interactionOf({ action: 'Add project', interaction: 'navigate' })).toBe('navigate')
  expect(interactionOf({ action: 'Done', interaction: 'update' })).toBe('update')
  expect(connectionDescription({ action: 'Done', interaction: 'update' })).not.toContain('inferred')
  expect(connectionDescription({ action: 'Next', when: 'Eligible' })).toContain('inferred from action label · When: Eligible')
})

test('conditions are independent of action type and return context does not mean returning now', () => {
  const settings = { action: 'Open settings', returnTo: 'home' }
  expect(interactionOf(settings)).toBe('navigate')
  expect(connectionStyle({ action: 'Confirm', when: 'Dry' })).toMatchObject({ interaction: 'update', stroke: '#7c3fb0', strokeDasharray: '2 5' })
  expect(connectionStyle({ action: 'Back', when: 'No unsaved inputs' })).toMatchObject({ interaction: 'return', strokeDasharray: '8 6' })
  expect(connectionStyle({ action: 'Open settings', when: 'Signed in' })).toMatchObject({ interaction: 'navigate', stroke: '#157b70', strokeDasharray: '2 5' })
})

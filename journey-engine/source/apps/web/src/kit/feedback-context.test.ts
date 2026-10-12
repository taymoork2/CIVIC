import { expect, test } from 'vitest'
import { feedbackScreen } from './feedback-context'

test('feedback keeps stable workflow context without leaking record IDs or untrusted steps', () => {
  expect(feedbackScreen('/closet', 'care:dry')).toBe('/closet · care:dry')
  expect(feedbackScreen('/session/private-load-id', 'review')).toBe('/session/:id · review')
  expect(feedbackScreen('/join/private-invite-token')).toBe('/app')
  expect(feedbackScreen('/closet?item=private-id')).toBe('/app')
  expect(feedbackScreen('/household', 'edit:Private appliance name')).toBe('/household')
})

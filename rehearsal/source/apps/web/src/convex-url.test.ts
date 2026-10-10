import { expect, test } from 'vitest'

import { resolveConvexUrl } from './convex-url'

test('a page on this Mac talks to the local backend directly', () => {
  expect(resolveConvexUrl('http://127.0.0.1:3210', { protocol: 'http:', hostname: 'localhost' }, '8443')).toBe('http://127.0.0.1:3210')
})

test('a phone on the private network reaches the backend through the same host on the forwarded port', () => {
  expect(resolveConvexUrl('http://127.0.0.1:3210', { protocol: 'https:', hostname: 'laundry-mac.tailnet-name.ts.net' }, '8443'))
    .toBe('https://laundry-mac.tailnet-name.ts.net:8443')
})

test('a hosted backend address is used as configured', () => {
  expect(resolveConvexUrl('https://happy-animal-123.convex.cloud/', { protocol: 'https:', hostname: 'washcloset.example' }, '8443'))
    .toBe('https://happy-animal-123.convex.cloud')
})

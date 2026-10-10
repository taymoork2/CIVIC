import { expect, test } from 'vitest'
import { authRequestOrigin } from './authOrigin'

const site = 'https://phone.example.test:10443'
const local = 'http://127.0.0.1:3005'
const forwarded = (origin: string) => {
  const url = new URL(origin)
  return new Request('http://127.0.0.1:3221/api/auth/get-session', { headers: {
    'x-better-auth-forwarded-host': url.host,
    'x-better-auth-forwarded-proto': url.protocol.slice(0, -1),
  } })
}

test('cookie origin follows exact configured HTTPS and loopback previews', () => {
  expect(authRequestOrigin(forwarded(site), site, [local])).toBe(site)
  expect(authRequestOrigin(forwarded(local), site, [local])).toBe(local)
  expect(authRequestOrigin(forwarded(site.replace('https:', 'http:')), site, [local])).toBe(site)
  expect(authRequestOrigin(new Request('http://127.0.0.1:3221/api/auth/get-session'), site, [local])).toBe(site)
})

test('rejects unknown, mixed-protocol and remote HTTP authentication origins', () => {
  for (const origin of ['https://attacker.example', 'http://other.example:10443', 'https://127.0.0.1:3005']) {
    expect(() => authRequestOrigin(forwarded(origin), site, [local])).toThrow('Untrusted authentication origin')
  }
  const insecure = 'http://remote.example'
  expect(() => authRequestOrigin(forwarded(insecure), site, [insecure])).toThrow('Untrusted authentication origin')
})

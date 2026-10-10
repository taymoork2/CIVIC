import { expect, test } from 'vitest'

import { authSearch, safeRedirect } from '@/account/auth-pages'

test.each([
  ['/account', '/account'],
  ['/laundry?step=2', '/laundry?step=2'],
  ['/join/LC%2F7Q2M%3Fname%3DAlex', '/join/LC%2F7Q2M%3Fname%3DAlex'],
  ['/sign-in?redirect=%2Faccount', '/account'],
  ['/sign-in?redirect=%2Fsign-in%3Fredirect%3D%252Faccount', '/account'],
  ['/create-account?redirect=%2Fjoin%2FABC', '/join/ABC'],
  ['/forgot-password?step=code', undefined],
  ['/sign-in', undefined],
  ['/sign-in/', undefined],
  ['/Sign-In?redirect=%2Fme', '/me'],
  ['/sign-in?redirect=%2F%2Fevil.example', undefined],
  ['//evil.example', undefined],
  ['/\t/evil.example', undefined],
  ['/\\evil.example', undefined],
  ['https://evil.example/account', undefined],
  ['account', undefined],
  [42, undefined],
] as const)('safeRedirect(%j) is %j', (value, expected) => {
  expect(safeRedirect(value)).toBe(expected)
})

test('a redirect nested deeper than the unwrap limit is dropped rather than looping', () => {
  let value = '/account'
  for (let i = 0; i < 8; i += 1) value = `/sign-in?redirect=${encodeURIComponent(value)}`
  expect(safeRedirect(value)).toBeUndefined()
})

test('auth routes keep only a cleaned redirect in their search', () => {
  expect(authSearch({ redirect: '/sign-in?redirect=%2Fcloset' })).toEqual({ redirect: '/closet' })
  expect(authSearch({ redirect: '/sign-in' })).toEqual({})
})

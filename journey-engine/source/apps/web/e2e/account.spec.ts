import { expect, test } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'

import { createHousehold, email, freshPage, inviteNewPerson, joinWithCode, openHousehold, password, signInAs, signUp } from './flows'

const api = anyApi as any
const convexUrl = process.env.WASHCLOSET_E2E_CONVEX_URL ?? 'http://127.0.0.1:3210'

test('U2: deleting an account ends household access, even for a token issued before deletion', async ({ browser }) => {
  const owner = await freshPage(browser)
  await signInAs(owner, 'keeper', 'Kim Keeper')
  await createHousehold(owner)
  const code = await inviteNewPerson(owner, 'Lee')

  const leaver = await freshPage(browser)
  await signUp(leaver, 'leaver', 'Lee Leaver')
  await joinWithCode(leaver, code)
  await openHousehold(leaver, 'People')
  await expect(leaver.getByRole('heading', { name: 'Kim’s home' })).toBeVisible()
  await expect(owner.getByText('Lee Leaver')).toBeVisible()

  // Capture a token as an attacker holding a copy would, before the account is deleted.
  const { token } = (await (await leaver.request.get('/api/auth/convex/token')).json()) as { token: string }
  const stale = new ConvexHttpClient(convexUrl)
  stale.setAuth(token)
  const householdId = (await stale.query(api.households.onboardingStatus, {})).households[0].householdId

  leaver.on('dialog', (dialog) => dialog.accept())
  await leaver.getByRole('link', { name: 'Me', exact: true }).click()
  await leaver.getByRole('button', { name: /^Account/ }).click()
  await leaver.getByRole('button', { name: /Delete account/ }).click()
  await leaver.getByLabel('Confirm your password').fill(password)
  const deletion = leaver.getByRole('dialog', { name: 'Delete account' })
  await deletion.getByRole('checkbox').check()
  await deletion.getByRole('button', { name: 'Delete account', exact: true }).click()
  await expect(leaver.getByRole('heading', { name: 'Welcome back' })).toBeVisible()

  await expect(owner.getByText('Lee Leaver')).toHaveCount(0)
  await expect(stale.query(api.inventory.list, { householdId })).rejects.toThrow('Forbidden')
  expect((await stale.query(api.households.onboardingStatus, {})).households).toEqual([])

  await leaver.getByLabel('Email').fill(email('leaver'))
  await leaver.getByLabel('Password').fill(password)
  await leaver.getByRole('button', { name: 'Sign in' }).click()
  await expect(leaver.getByRole('alert')).toBeVisible()
  await expect(leaver.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

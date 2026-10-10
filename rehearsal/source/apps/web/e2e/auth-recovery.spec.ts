import { expect, test } from '@playwright/test'
import { createHousehold, signUp } from './flows'

test.use({ locale: 'en-US' })

// Actual routes, not the design preview. Accounts are synthetic and fresh per run.
test('forgot password without a sender promises no code and names the signed-in way to change it', async ({ page }) => {
  await page.goto('/forgot-password')
  await expect(page.getByRole('heading', { level: 1, name: 'Reset password' })).toBeVisible()
  await expect(page.getByRole('note')).toContainText('Reset by email isn’t set up yet')
  await expect(page.getByRole('note')).toContainText('Me → Account → Change password')
  await expect(page.getByText(/6-digit code/)).toHaveCount(0)
  await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Send code', exact: true })).toHaveCount(0)
  // Sign-in stays one tap away.
  await page.getByRole('link', { name: 'Back to sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

test('an unknown address shows a recovery page with Go home, signed out and signed in', async ({ page }) => {
  await page.goto('/no-such-page-signed-out')
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
  // Signed out, the page shows directly instead of detouring through sign-in.
  await expect(page).toHaveURL(/\/no-such-page-signed-out$/)
  await expect(page.getByRole('link', { name: 'Go home', exact: true })).toHaveAttribute('href', '/')

  await signUp(page, 'auth-notfound', 'Synthetic Not Found')
  await createHousehold(page)
  await page.goto('/no-such-page-signed-in')
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
  await page.getByRole('link', { name: 'Go home', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
})

test('signing out from Account lands on plain sign-in with no nested redirect', async ({ page }) => {
  await signUp(page, 'auth-signout', 'Synthetic Sign Out')
  await createHousehold(page)
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Me', exact: true }).click()
  await page.getByRole('button', { name: /^Account/ }).click()
  await expect(page).toHaveURL(/\/account$/)
  await page.getByRole('main').getByRole('button', { name: /^Sign out/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Sign out?' })
  await sheet.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/sign-in')
  expect(new URL(page.url()).searchParams.has('redirect')).toBe(false)
  expect(decodeURIComponent(page.url())).not.toContain('sign-in?redirect')
})

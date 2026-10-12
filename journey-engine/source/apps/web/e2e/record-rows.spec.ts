import { expect, test } from '@playwright/test'
import { api } from '../src/api'
import { convexAs, createHousehold, freshPage, openHousehold, signUp } from './flows'

test('record rows keep badges beside the text, reflow long content and preserve separate controls', async ({ page }) => {
  test.skip(process.env.WASHCLOSET_E2E_BUILD === 'production', 'Design specimens are development only')
  for (const [width, scale] of [[393, 1], [320, 1], [320, 2], [1280, 1]]) {
    await page.setViewportSize({ width, height: 852 })
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme })
      for (const screen of ['closet-index', 'household-people', 'household-people-long', 'me-index', 'me-history', 'laundry-hamper', 'laundry-review']) {
        await page.goto(`/design-preview?screen=${screen}&textScale=${scale}`)
        await page.waitForLoadState('networkidle')
        await page.evaluate(() => document.fonts.ready)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${screen} ${width}px ${scale}× ${theme}`).toBe(true)
        const rows = page.locator('.record-row :is(button, a, [data-slot=item]):has(> [data-slot=item-content])')
        expect(await rows.count(), screen).toBeGreaterThan(0)
        for (const row of await rows.all()) {
          const text = row.locator('[data-slot=item-content]')
          if (width === 393 && scale === 1 && ['closet-index', 'household-people', 'me-index'].includes(screen)) {
            for (const line of await text.locator('[data-slot=item-title], [data-slot=item-description]').all()) {
              const height = (await line.boundingBox())!.height
              expect(height, `${screen}: ${await line.innerText()}`).toBeLessThanOrEqual(await line.evaluate(node => Number.parseFloat(getComputedStyle(node).lineHeight)) + 1)
            }
          }
          const badge = row.locator('[data-slot=badge]')
          if (await badge.count() === 0) continue
          const contentBox = (await text.boundingBox())!, badgeBox = (await badge.boundingBox())!
          if (scale === 1) {
            expect(badgeBox.x).toBeGreaterThanOrEqual(contentBox.x + contentBox.width - 1)
            expect(Math.abs(badgeBox.y - contentBox.y)).toBeLessThanOrEqual(1)
          }
          const arrow = row.locator('[data-slot=item-actions] > svg')
          if (await arrow.count() > 0) {
            const arrowBox = (await arrow.boundingBox())!
            expect(arrowBox.y).toBeGreaterThanOrEqual(badgeBox.y + badgeBox.height - 1)
            expect(arrowBox.x + arrowBox.width).toBeLessThanOrEqual(badgeBox.x + badgeBox.width + 1)
          }
        }
        if (screen === 'household-people') {
          await expect(page.getByRole('button', { name: 'Open Alex. Clothing preferences', exact: true })).toHaveCount(1)
          await expect(page.getByRole('button', { name: 'Open Sam. Clothing preferences', exact: true })).toHaveCount(1)
          await expect(page.getByText(/has an account/)).toHaveCount(0)
          await page.getByRole('button', { name: 'Open Sam. Clothing preferences', exact: true }).click()
          await page.getByRole('button', { name: 'Edit clothing profile', exact: true }).click()
          await expect(page.getByRole('dialog').getByLabel('Name', { exact: true })).toHaveValue('Sam')
          await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
          await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click()
        }
        if (width === 393 && scale === 1 && ['closet-index', 'household-people', 'me-index'].includes(screen)) {
          await page.screenshot({ path: test.info().outputPath(`${screen}-${theme}.png`), animations: 'disabled' })
        }
      }
    }
  }
})

test('Household shows a linked member once and keeps Me, same-name profiles and clothing edits distinct', async ({ browser }) => {
  const page = await freshPage(browser)
  try {
    await page.setViewportSize({ width: 393, height: 852 })
    await signUp(page, 'compact-people', 'Synthetic Owner')
    await createHousehold(page)
    const { client, householdId } = await convexAs(page)
    await openHousehold(page, 'People')
    await expect(page.getByRole('heading', { name: 'Whose clothes', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Open Synthetic. Clothing preferences', exact: true })).toHaveCount(1)
    const wearerId = await client.mutation(api.inventory.createWearer, { householdId, name: 'Synthetic', kind: 'child' })
    await expect(page.getByRole('button', { name: 'Open Synthetic. Child', exact: true })).toHaveCount(1)
    await page.getByRole('button', { name: 'Open Synthetic. Clothing preferences', exact: true }).click()
    await page.getByRole('button', { name: 'Edit clothing profile', exact: true }).click()
    const drawer = page.getByRole('dialog')
    await drawer.getByLabel('Name', { exact: true }).fill('Clothing name')
    await drawer.getByRole('button', { name: 'Save person', exact: true }).click()
    await expect(drawer.getByRole('heading', { name: 'Clothing name', exact: true })).toBeVisible()
    await drawer.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(drawer).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Open Clothing name. Clothing preferences', exact: true })).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Open Synthetic. Child', exact: true })).toHaveCount(1)
    expect((await client.query(api.inventory.list, { householdId })).wearers.find((wearer) => wearer.wearerId === wearerId)?.name).toBe('Synthetic')
    await page.goto('/me')
    await expect(page.getByText('Synthetic Owner', { exact: true })).toBeVisible()
    await expect(page.getByText('Clothing name', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: /^Account/ }).click()
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible()
  } finally { await page.context().close() }
})

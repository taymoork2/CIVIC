import { expect, test } from '@playwright/test'
import { api } from '../src/api'
import { convexAs, createHousehold, freshPage, inviteNewPerson, signUp } from './flows'

test('invite, Closet and hamper hierarchy fit phone, enlarged text and desktop', async ({ page }) => {
  test.skip(process.env.WASHCLOSET_E2E_BUILD === 'production', 'Design specimens are development only')
  for (const [width, scale] of [[393, 1], [320, 2], [1280, 1]]) {
    await page.setViewportSize({ width, height: 852 })
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme })
      for (const screen of ['invite-sheet', 'closet-index', 'laundry-hamper', 'join-link', 'join-code', 'join-link-signed-out']) {
        await page.goto(`/design-preview?screen=${screen}&textScale=${scale}`)
        await page.waitForLoadState('networkidle')
        await page.evaluate(() => document.fonts.ready)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${screen} ${width}px ${scale}× ${theme}`).toBe(true)
        if (screen === 'invite-sheet') {
          const drawer = page.getByRole('dialog')
          for (const name of ['Replace link', 'Cancel invite', 'Copy link', 'Share invite link']) {
            const button = drawer.getByRole('button', { name, exact: true })
            await button.scrollIntoViewIfNeeded()
            const box = (await button.boundingBox())!
            expect(box.height).toBeGreaterThanOrEqual(44)
            expect(box.x + box.width).toBeLessThanOrEqual(width)
            const foot = (await drawer.locator('.sheet-foot').boundingBox())!
            if (name === 'Cancel invite' || name === 'Replace link') expect(box.y + box.height).toBeLessThanOrEqual(foot.y + 1)
          }
          const replace = (await drawer.getByRole('button', { name: 'Replace link', exact: true }).boundingBox())!
          const cancel = (await drawer.getByRole('button', { name: 'Cancel invite', exact: true }).boundingBox())!
          expect(Math.abs(replace.width - cancel.width)).toBeLessThanOrEqual(1)
          expect(Math.abs(replace.y - cancel.y)).toBeLessThanOrEqual(1)
          await drawer.locator('.sheet-scroll').evaluate((node) => { node.scrollTop = 0 })
        } else if (screen === 'closet-index') {
          await expect(page.getByRole('region', { name: 'Your clothes at a glance' }).locator('svg')).toHaveCount(4)
          await expect(page.getByRole('radiogroup', { name: 'Group clothes by' })).toHaveCount(0)
          await page.getByRole('button', { name: 'Manage closet', exact: true }).click()
          await expect(page.getByRole('radiogroup', { name: 'Group clothes by' })).toBeVisible()
          await page.getByRole('radio', { name: 'Status', exact: true }).click()
          await page.keyboard.press('Escape')
        } else if (screen === 'laundry-hamper') {
          await expect(page.getByRole('region', { name: 'Plan your wash' })).toContainText('11 pieces selected')
        } else if (screen === 'join-link') {
          await expect(page.getByRole('region', { name: 'As a member you can' })).toBeVisible()
          await expect(page.getByRole('button', { name: 'Join household: Our apartment', exact: true })).toBeEnabled()
        }
        await page.screenshot({ path: test.info().outputPath(`${screen}-${width}-${scale}-${theme}.png`), animations: 'disabled' })
      }
    }
  }
})

test('Closet keeps status icons and grouping while the Laundry summary follows selection', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await signUp(page, 'page-balance', 'Synthetic Casey')
  await createHousehold(page)
  const { client, householdId } = await convexAs(page)
  const textileId = await client.mutation(api.inventory.createTextile, { householdId, name: 'Synthetic blue tee', color: 'Blue', colorGroup: 'medium' })
  await client.mutation(api.inventory.setCare, { textileId, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, restrictions: [], dryMethod: 'tumble_dry', dryHeat: 'low', provenance: { source: 'Synthetic care label', confidence: 'verified' } })
  await page.goto('/closet')
  const glance = page.getByRole('region', { name: 'Your clothes at a glance' })
  await expect(glance.locator('svg')).toHaveCount(4)
  await expect(glance).toContainText('In the hamper')
  await expect(page.getByRole('radiogroup', { name: 'Group clothes by' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Manage closet', exact: true }).click()
  await page.getByRole('radio', { name: 'Status', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Manage closet', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Status', exact: true })).toBeChecked()
  await page.goto('/laundry')
  const summary = page.getByRole('region', { name: 'Plan your wash' })
  await expect(summary).toContainText('1 piece selected')
  await page.getByRole('button', { name: 'Fewer Synthetic blue tee', exact: true }).click()
  await expect(summary).toContainText('Choose clothes to wash')
  await page.getByRole('button', { name: 'More Synthetic blue tee', exact: true }).click()
  await expect(summary).toContainText('1 piece selected')
  await expect(page.getByRole('button', { name: 'Sort 1 piece into loads', exact: true })).toBeEnabled()
})

test('invite copy failure remains recoverable and sharing cancellation preserves the invitation', async ({ browser }) => {
  const page = await freshPage(browser)
  try {
    await page.setViewportSize({ width: 393, height: 852 })
    await signUp(page, 'invite-polish', 'Synthetic Owner')
    await createHousehold(page)
    const code = await inviteNewPerson(page, 'Polished Sam')
    await page.getByRole('button', { name: 'Manage invite for Polished Sam', exact: true }).click()
    const drawer = page.getByRole('dialog')
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Unavailable') } } })
      Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Canceled', 'AbortError') } })
    })
    await drawer.getByRole('button', { name: /^Copy code/ }).click()
    await expect(drawer.getByLabel('Invite link', { exact: true })).toHaveValue(new RegExp(`/join/${code}$`))
    await drawer.getByRole('button', { name: 'Share invite link', exact: true }).click()
    const { client } = await convexAs(page)
    expect(await client.query(api.households.invitePreview, { code })).toMatchObject({ status: 'valid' })
    await drawer.getByRole('button', { name: 'Replace link', exact: true }).click()
    await expect(drawer.getByRole('heading', { name: 'Replace this invite link?', exact: true })).toBeVisible()
    await drawer.getByRole('button', { name: 'Keep link', exact: true }).click()
    expect(await client.query(api.households.invitePreview, { code })).toMatchObject({ status: 'valid' })
    await drawer.getByRole('button', { name: 'Replace link', exact: true }).click()
    await drawer.getByRole('button', { name: 'Replace link', exact: true }).click()
    await expect(drawer.getByRole('button', { name: /^Copy code/ })).not.toContainText(code)
    expect(await client.query(api.households.invitePreview, { code })).toEqual({ status: 'unknown' })
    await drawer.getByRole('button', { name: 'Cancel invite', exact: true }).click()
    await expect(drawer.getByRole('heading', { name: 'Cancel this invite?', exact: true })).toBeVisible()
    await drawer.getByRole('button', { name: 'Keep invite', exact: true }).click()
    await expect(drawer.getByRole('button', { name: 'Share invite link', exact: true })).toBeVisible()
  } finally { await page.context().close() }
})

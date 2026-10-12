import { expect, test } from '@playwright/test'

test('discard confirmation fills compact and regular footers without losing the draft', async ({ page }) => {
  test.skip(process.env.WASHCLOSET_E2E_BUILD === 'production', 'Memory-only design specimens')
  for (const [width, scale] of [[393, 1], [320, 2], [1280, 1]]) {
    await page.setViewportSize({ width, height: 852 })
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme })
      for (const screen of ['profile-form', 'closet-add-details']) {
        await page.goto(`/design-preview?screen=${screen}&textScale=${scale}`)
        const sheet = page.getByRole('dialog')
        const name = sheet.getByLabel('Name', { exact: true })
        await name.fill('Keep this draft')
        await sheet.getByRole('button', { name: 'Close', exact: true }).click()
        const prompt = sheet.getByRole('alert')
        await expect(prompt).toContainText('Discard your changes?')
        const box = (await prompt.boundingBox())!
        const foot = await sheet.locator('.sheet-foot').evaluate(node => {
          const box = node.getBoundingClientRect(), style = getComputedStyle(node)
          return { left: box.left + parseFloat(style.paddingLeft), right: box.right - parseFloat(style.paddingRight) }
        })
        expect(Math.abs(box.x - foot.left)).toBeLessThan(1)
        expect(Math.abs(box.x + box.width - foot.right)).toBeLessThan(1)
        for (const label of ['Keep editing', 'Discard']) {
          const button = (await prompt.getByRole('button', { name: label, exact: true }).boundingBox())!
          expect(button.height).toBeGreaterThanOrEqual(44)
          expect(button.x).toBeGreaterThanOrEqual(box.x)
          expect(button.x + button.width).toBeLessThanOrEqual(box.x + box.width + 1)
          expect(button.y + button.height).toBeLessThanOrEqual(852)
        }
        if (width === 393 && screen === 'profile-form') await page.screenshot({ path: test.info().outputPath(`discard-${theme}.png`), animations: 'disabled' })
        await prompt.getByRole('button', { name: 'Keep editing', exact: true }).click()
        await expect(name).toHaveValue('Keep this draft')
        await expect(prompt).toHaveCount(0)
        await sheet.getByRole('button', { name: 'Close', exact: true }).click()
        await sheet.getByRole('button', { name: 'Discard', exact: true }).click()
        await expect(sheet).toHaveCount(0)
      }
    }
  }
})

test('fabric percentages balance and dark-mode validation stays readable', async ({ page }) => {
  test.skip(process.env.WASHCLOSET_E2E_BUILD === 'production', 'Memory-only design specimens')
  await page.setViewportSize({ width: 393, height: 852 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/design-preview?screen=closet-add-details')
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Next: fabric', exact: true }).click()
  await expect(sheet.getByRole('checkbox', { name: 'Cotton', exact: true })).toBeChecked()
  await sheet.getByRole('checkbox', { name: 'Polyester', exact: true }).click()
  await sheet.getByLabel('Cotton percentage', { exact: true }).fill('90')
  await expect(sheet.getByLabel('Polyester percentage', { exact: true })).toHaveValue('10')
  await expect(sheet.getByRole('button', { name: 'Next: color', exact: true })).toBeEnabled()
  await sheet.getByLabel('Cotton percentage', { exact: true }).fill('101')
  const error = sheet.getByRole('alert')
  await expect(error).toContainText('no more than 100')
  expect(await error.evaluate(node => getComputedStyle(node).color)).toBe('rgb(255, 184, 190)')
  await expect(sheet.getByRole('button', { name: 'Next: color', exact: true })).toBeDisabled()
  await page.screenshot({ path: test.info().outputPath('fabric-error-dark.png'), animations: 'disabled' })
  await sheet.getByLabel('Cotton percentage', { exact: true }).fill('90')
  await sheet.getByRole('checkbox', { name: 'Elastane / spandex', exact: true }).click()
  await sheet.getByLabel('Cotton percentage', { exact: true }).fill('80')
  await expect(sheet.getByLabel('Polyester percentage', { exact: true })).toHaveValue('10')
  await expect(sheet.getByLabel('Elastane / spandex percentage', { exact: true })).toHaveValue('10')
  await sheet.getByLabel('Cotton percentage', { exact: true }).fill('90')
  await expect(sheet.getByLabel('Polyester percentage', { exact: true })).toHaveValue('5')
  await expect(sheet.getByLabel('Elastane / spandex percentage', { exact: true })).toHaveValue('5')
  await page.screenshot({ path: test.info().outputPath('fabric-balanced-dark.png'), animations: 'disabled' })
  await sheet.getByRole('button', { name: 'Back', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: fabric', exact: true }).click()
  await expect(sheet.getByLabel('Cotton percentage', { exact: true })).toHaveValue('90')
  await sheet.getByLabel('Cotton percentage', { exact: true }).fill('')
  await expect(sheet.getByLabel('Polyester percentage', { exact: true })).toHaveValue('')
  await expect(sheet.getByLabel('Elastane / spandex percentage', { exact: true })).toHaveValue('')
  await expect(sheet.getByRole('button', { name: 'Next: color', exact: true })).toBeEnabled()
})

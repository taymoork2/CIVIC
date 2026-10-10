import { expect, test } from '@playwright/test'

test('saved records keep header editing reachable and preserve the record on Cancel', async ({ page }) => {
  test.skip(process.env.WASHCLOSET_E2E_BUILD === 'production', 'Design specimens are development only')
  for (const [width, scale] of [[393, 1], [320, 2], [1280, 1]]) {
    await page.setViewportSize({ width, height: 852 })
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      for (const [screen, label] of [['closet-record', 'Edit item details'], ['household-profile', 'Edit clothing profile'], ['household-water-sheet', 'Edit water details']]) {
        await page.goto(`/design-preview?screen=${screen}&textScale=${scale}`)
        const record = page.getByRole('dialog').last()
        const pencil = record.getByRole('button', { name: label, exact: true })
        await expect(pencil).toBeVisible()
        const box = (await pencil.boundingBox())!
        expect(box.width).toBeGreaterThanOrEqual(44)
        expect(box.height).toBeGreaterThanOrEqual(44)
        expect(box.y + box.height).toBeLessThan(852)
        expect(await record.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
        if (screen === 'closet-record') await record.getByRole('tab', { name: 'Details', exact: true }).click()
        if (width === 393 && theme === 'light') await page.screenshot({ path: test.info().outputPath(`${screen}.png`), animations: 'disabled' })
        await pencil.focus()
        await pencil.press('Enter')
        const editor = page.getByRole('dialog').last()
        await expect(editor.getByRole('button', { name: label, exact: true })).toHaveCount(0)
        const parentPencil = page.getByRole('button', { name: label, exact: true, includeHidden: true })
        if (screen !== 'household-water-sheet') {
          await expect(parentPencil).toBeVisible()
          await expect(parentPencil).toBeDisabled()
          await expect(parentPencil).toHaveCSS('opacity', '0.45')
          if (screen === 'household-profile' && width === 393) await page.screenshot({ path: test.info().outputPath(`profile-parent-pencil-${theme}.png`), animations: 'disabled' })
        }
        if (screen === 'household-water-sheet') {
          await expect(editor.getByLabel('What’s your ZIP code?', { exact: true })).toHaveValue('94610')
          await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
        } else {
          const name = editor.getByLabel('Name', { exact: true })
          const original = await name.inputValue()
          await name.fill('Unsaved edit')
          await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
          await expect(editor.getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused()
          await editor.getByRole('button', { name: 'Keep editing', exact: true }).click()
          await expect(name).toHaveValue('Unsaved edit')
          await name.fill(original)
          await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
        }
        await expect(page.getByRole('dialog').last().getByRole('button', { name: label, exact: true })).toBeVisible()
        await expect(parentPencil).toBeEnabled()
        if (screen === 'closet-record') await expect(page.getByRole('dialog').last().getByRole('tab', { name: 'Details', exact: true })).toHaveAttribute('aria-selected', 'true')
      }
    }
  }
})

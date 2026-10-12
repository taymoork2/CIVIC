import { expect, test, type Locator } from '@playwright/test'

async function reachable(control: Locator) {
  await control.scrollIntoViewIfNeeded()
  await expect.poll(() => control.evaluate(node => {
    const bounds = node.getBoundingClientRect()
    const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight && (hit === node || (hit !== null && node.contains(hit)))
  })).toBe(true)
}

test.use({ hasTouch: true })

test('native 1000-piece rehearsal keeps every destination and paging reachable', async ({ page }, info) => {
  test.skip(!process.env.WASHCLOSET_REHEARSAL_URL, 'Requires the explicitly isolated Rehearsal host')
  test.setTimeout(360_000)
  await page.setViewportSize({ width: 1360, height: 1200 })
  await page.goto(`${process.env.WASHCLOSET_REHEARSAL_URL}/review?familyDay=1`)
  await page.getByRole('button', { name: 'Start 1,000-item run', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Disconnect app', exact: true })).toBeEnabled()
  const app = page.frameLocator('iframe[title="Synthetic Laundry App"]')
  try {
    await app.getByRole('button', { name: /Fewer .*Alex cotton 00/ }).click()
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Preview appearance').selectOption(theme)
      for (const [device, width, height, scale] of [['small-phone', 320, 658, 2], ['phone', 393, 852, 1], ['phone', 393, 852, 2], ['tablet', 768, 1024, 2], ['desktop', 1024, 768, 1], ['folded', 360, 764, 2], ['unfolded', 984, 1016, 1]] as const) {
        await page.getByLabel('Preview device').selectOption(device)
        await page.getByLabel('Preview text size').selectOption(String(scale))
        await expect(app.locator('html')).toHaveCSS('font-size', `${16 * scale}px`)
        await expect.poll(() => app.locator('body').evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width, height })
        await page.locator('iframe[title="Synthetic Laundry App"]').scrollIntoViewIfNeeded()
        await page.mouse.move(1300, 900)
        await page.mouse.wheel(0, 1600)
        const nav = app.getByRole('navigation', { name: 'Primary navigation' })
        await info.attach(`${theme}-${device}-${scale}-bounds`, { body: JSON.stringify({ frame: await page.locator('iframe[title="Synthetic Laundry App"]').boundingBox(), nav: await nav.boundingBox(), links: await nav.getByRole('link').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, bounds: node.getBoundingClientRect().toJSON() }))) }), contentType: 'application/json' })
        for (const name of ['Home', 'Closet', 'Household', 'Me', 'Laundry']) {
          const link = nav.getByRole('link', { name: new RegExp(`^${name}(?:,|$)`) })
          await reachable(link)
          await link.tap()
          await expect(nav.getByRole('link', { name: new RegExp(`^${name}(?:,|$)`) })).toHaveAttribute('aria-current', 'page')
        }
        await expect(app.getByText('999 of 1000 machine-wash pieces selected across every page.', { exact: true })).toBeVisible()
        const sort = app.getByRole('button', { name: 'Sort 999 pieces into loads', exact: true })
        await reachable(sort)
        const next = app.getByRole('button', { name: 'Next 40', exact: true })
        await next.focus()
        await reachable(next)
        await next.press('Enter')
        await expect(app.getByRole('status').filter({ hasText: /^Groups 41–50/ })).toBeFocused()
        await app.getByRole('button', { name: 'Previous 40', exact: true }).click()
        expect(await app.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.locator('iframe[title="Synthetic Laundry App"]').screenshot({ path: info.outputPath(`native-${theme}-${device}-${scale}.png`) })
      }
    }
  } finally {
    await page.getByRole('button', { name: 'Close app', exact: true }).click()
  }
})

test('native sorting, load review and preparation are reachable at 320px enlarged text', async ({ page }, info) => {
  test.skip(!process.env.WASHCLOSET_REHEARSAL_URL, 'Requires the explicitly isolated Rehearsal host')
  await page.setViewportSize({ width: 1360, height: 1200 })
  await page.goto(`${process.env.WASHCLOSET_REHEARSAL_URL}/review?familyDay=1`)
  await page.getByRole('button', { name: 'Start 1,000-item run', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Disconnect app', exact: true })).toBeEnabled()
  const app = page.frameLocator('iframe[title="Synthetic Laundry App"]')
  try {
    await page.getByLabel('Preview device').selectOption('small-phone')
    await page.getByLabel('Preview text size').selectOption('2')
    await expect(app.locator('html')).toHaveCSS('font-size', '32px')
    await expect.poll(() => app.locator('body').evaluate(() => innerWidth)).toBe(320)
    await page.mouse.move(1300, 900)
    await page.mouse.wheel(0, 1600)
    await app.getByRole('button', { name: 'Sort 1000 pieces into loads', exact: true }).tap()
    for (const name of ['Review next load', 'I’m at the laundry room', /^Confirm recipe for/, 'See what goes in', /^(Start|Continue) preparation$/]) {
      const action = app.getByRole('button', { name, exact: typeof name === 'string' })
      await reachable(action)
      await action.tap()
    }
    const done = app.getByRole('button', { name: 'Done · next step', exact: true })
    await reachable(done)
    await done.tap()
    await expect(app.getByText('Step 2 of 4', { exact: true })).toBeVisible()
    await page.locator('iframe[title="Synthetic Laundry App"]').screenshot({ path: info.outputPath('native-preparation-small-enlarged.png') })
  } finally {
    await page.getByRole('button', { name: 'Close app', exact: true }).click()
  }
})

test('long preparation, drying and put-away actions stay reachable at enlarged text', async ({ page }, info) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    for (const [width, height, scale] of [[320, 658, 2], [658, 320, 2], [393, 852, 1], [768, 1024, 2], [1024, 768, 1]]) {
      await page.setViewportSize({ width: width!, height: height! })
      for (const screen of ['laundry-preparation-long', 'drying-scale-check', 'drying-scale-putaway']) {
        await page.goto(`/design-preview?screen=${screen}&textScale=${scale}`)
        await page.waitForLoadState('networkidle')
        await page.evaluate(async () => { await document.fonts.ready })
        const actions = page.locator('[data-slot="task-footer"]').getByRole('button').filter({ hasNot: page.locator('[disabled]') })
        expect(await actions.count()).toBeGreaterThan(0)
        for (const action of await actions.all()) {
          if (await action.isDisabled()) continue
          await action.focus()
          await reachable(action)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        const footer = page.locator('[data-slot="task-footer"]').last()
        expect(await footer.evaluate(node => node.getBoundingClientRect().height <= innerHeight / 2 + 1)).toBe(true)
        if (width === 320) await page.screenshot({ path: info.outputPath(`${screen}-${theme}-enlarged.png`) })
      }
    }
  }
})

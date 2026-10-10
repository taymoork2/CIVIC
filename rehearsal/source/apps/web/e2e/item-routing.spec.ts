import { expect, test, type Locator, type Page } from '@playwright/test'
import { closetRows, hamperRows, signIn, homeGarmentLinks } from './flows'

/** The person circles under the glance choose whose closet; act on the Everyone circle. */
async function familyClosets(page: Page, act: (everyone: Locator) => Promise<void>) {
  await act(page.getByRole('radiogroup', { name: 'Whose clothes' }).getByRole('radio', { name: 'Everyone', exact: true }))
}

async function idle(page: Page) {
  await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'))
}

async function restoredDrawer(page: Page, title: string) {
  await expect(page.getByRole('dialog').getByRole('heading', { name: title, exact: true })).toBeVisible()
  await idle(page)
  await expect(page.getByRole('dialog')).toHaveCount(1)
}

for (const [device, width, height] of [['phone', 390, 844], ['desktop', 1440, 1000]] as const) {
  test(`${device}: item drawers survive reload and history, and copied links dismiss safely`, async ({ page, context }) => {
    await page.setViewportSize({ width, height })
    await signIn(page, 'demo@example.invalid', 'today')
    // Each list's record rows by role: Closet and hamper rows, then appliance and product rows.
    for (const [path, rows, key] of [
      ['/closet', closetRows, 'item'],
      ['/laundry', hamperRows, 'item'],
      ['/household?section=machines', (list: Page) => list.getByRole('button', { name: /\. Edit settings$/ }), 'machine'],
      ['/household?section=bottles', (list: Page) => list.getByRole('button', { name: /\. Open product$/ }), 'product'],
    ] as const satisfies readonly (readonly [string, (list: Page) => Locator, string])[]) {
      await page.goto(path)
      if (path === '/closet') {
        await familyClosets(page, (everyone) => everyone.click())
        await page.getByRole('searchbox', { name: 'Search clothes', exact: true }).fill('5009')
      }
      const card = rows(page).first()
      await expect(card).toBeVisible()
      await idle(page)
      const base = page.url()
      // Rows draw garment art (img or svg); the row itself stands in when it has no media.
      await card.evaluate((node) => { Object.assign(window, { itemPagePhoto: node.querySelector('img, svg') ?? node }) })
      await card.click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await idle(page)
      const title = await page.getByRole('dialog').getByRole('heading').first().innerText()
      const selected = page.url()
      expect(new URL(selected).searchParams.get(key)).toBeTruthy()
      // Opening a drawer keeps the list's existing images and local browsing state.
      expect(await page.evaluate(() => (window as any).itemPagePhoto?.isConnected)).toBe(true)
      await page.goBack()
      await expect(page).toHaveURL(base)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      if (path === '/closet') {
        await expect(page.getByRole('searchbox', { name: 'Search clothes', exact: true })).toHaveValue('5009')
        await familyClosets(page, (everyone) => expect(everyone).toBeChecked())
      }
      await page.goForward()
      await restoredDrawer(page, title)
      await page.reload()
      await restoredDrawer(page, title)
      await page.getByRole('dialog').getByRole('button', { name: /^(Close|Cancel)$/ }).first().click()
      await expect(page).toHaveURL(base)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await page.reload()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await page.goForward()
      await restoredDrawer(page, title)
      await page.keyboard.press('Escape')
      await expect(page).toHaveURL(base)

      // A new tab has no originating app history: Close replaces the item URL with its list.
      const copied = await context.newPage()
      try {
        await copied.goto(selected)
        await restoredDrawer(copied, title)
        await copied.getByRole('dialog').getByRole('button', { name: /^(Close|Cancel)$/ }).first().click()
        await expect(copied.getByRole('dialog')).toHaveCount(0)
        expect(new URL(copied.url()).searchParams.has(key)).toBe(false)
        expect(new URL(copied.url()).pathname).toBe(new URL(selected).pathname)
        await copied.reload()
        await expect(copied.getByRole('dialog')).toHaveCount(0)
      } finally { await copied.close() }
    }
  })
}

test('Home masks return context, restores its drawer, and Close adds no duplicate Home entry', async ({ page, context }) => {
  await signIn(page, 'demo@example.invalid', 'today')
  const primary = page.getByRole('navigation', { name: 'Primary navigation' })
  await primary.getByRole('link', { name: 'Closet', exact: true }).click()
  await expect(page).toHaveURL(/\/closet$/)
  await idle(page)
  await primary.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(homeGarmentLinks(page).first()).toBeVisible()
  await idle(page)
  const home = page.url()
  await homeGarmentLinks(page).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await idle(page)
  const title = await page.getByRole('dialog').getByRole('heading').first().innerText()
  const selected = page.url()
  expect(new URL(selected).searchParams.get('item')).toBeTruthy()
  expect(new URL(selected).searchParams.has('returnTo')).toBe(false)
  expect(await page.evaluate(() => history.state.__tempLocation?.search)).toContain('returnTo=home')
  await page.reload()
  await restoredDrawer(page, title)
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page).toHaveURL(home)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goBack()
  await expect(page).toHaveURL(/\/closet$/)
  await page.goForward()
  await expect(page).toHaveURL(home)
  await page.goForward()
  await restoredDrawer(page, title)
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(home)

  const copied = await context.newPage()
  try {
    await copied.goto(selected)
    await restoredDrawer(copied, title)
    await copied.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    await expect(copied).toHaveURL(/\/closet$/)
    await copied.reload()
    await expect(copied.getByRole('dialog')).toHaveCount(0)
  } finally { await copied.close() }
})

test('missing item URLs show a recoverable message without opening an unrelated drawer', async ({ page }) => {
  await signIn(page, 'demo@example.invalid', 'today')
  for (const [path, message, action] of [
    ['/closet?item=missing', 'This item is no longer in this closet.', 'Return to your clothes'],
    ['/laundry?item=missing', 'This item is no longer waiting in this hamper.', 'Return to laundry'],
    ['/household?machine=missing', 'This appliance is no longer in this household.', 'Return to appliances'],
    ['/household?product=missing', 'This product is no longer in this household.', 'Return to products'],
  ] as const) {
    await page.goto(path)
    await expect(page.getByRole('status').filter({ hasText: message })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: action, exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: message })).toHaveCount(0)
    expect(new URL(page.url()).search).not.toContain('missing')
  }
})

test('Closet to Laundry preserves the originating item in browser history', async ({ page }) => {
  await signIn(page, 'demo@example.invalid', 'today')
  await page.goto('/closet')
  await familyClosets(page, (everyone) => everyone.click())
  // A garment waiting to wash: its record links its hamper pieces to Laundry.
  await closetRows(page).filter({ hasText: /waiting to wash|in hamper/ }).first().click()
  await idle(page)
  const closetItem = page.url()
  const title = await page.getByRole('dialog').getByRole('heading').first().innerText()
  await page.getByRole('dialog').getByRole('link', { name: /^\d+ in the hamper$/ }).click()
  await expect(page).toHaveURL(/\/laundry\?item=/)
  await restoredDrawer(page, title)
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page).toHaveURL(closetItem)
  await restoredDrawer(page, title)
  await page.goForward()
  await expect(page).toHaveURL(/\/laundry\?item=/)
  await restoredDrawer(page, title)
  await page.goBack()
  await restoredDrawer(page, title)
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/closet$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

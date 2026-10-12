import { test, expect, type Page } from '@playwright/test'
import { api } from '../src/api'
import { closetRows, convexAs, createHousehold, hamperRows, homeReadyTiles, signUp, topDialog, signIn, homeGarmentLinks } from './flows'

async function settled(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'))
  await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => undefined))))
  await expect(page.locator('.skeleton, .app-loading')).toHaveCount(0)
}

async function closeSheet(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

/** Everyone's closet, chosen with the person circles under the glance. */
async function everyone(page: Page) {
  const circle = page.getByRole('radiogroup', { name: 'Whose clothes' }).getByRole('radio', { name: 'Everyone', exact: true })
  await circle.click()
  await expect(circle).toBeChecked()
}

test('household drawers show photos and discard canceled edits in both themes', async ({ page }) => {
  await signIn(page)
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' })
    await page.setViewportSize({ width: theme === 'light' ? 462 : 1440, height: 795 })
    await page.goto('/household?section=machines')
    for (const [section, edit] of [['Appliances', 'Edit settings'], ['Products', 'Edit details']] as const) {
      await page.getByRole('button', { name: section, exact: true }).click()
      await page.getByRole('button', { name: section === 'Products' ? /\. Open product$/ : /\. Edit settings$/ }).first().click()
      const dialog = page.getByRole('dialog')
      const heading = await dialog.getByRole('heading', { level: 2 }).innerText()
      await expect(dialog.locator('.sheet-header-art img')).toBeVisible()
      await expect(dialog.getByRole('textbox')).toHaveCount(0)
      await dialog.getByRole('button', { name: edit, exact: true }).click()
      await expect(dialog.getByRole('heading', { level: 2 })).toBeFocused()
      const name = dialog.getByLabel(section === 'Products' ? 'Product name' : 'Number or label as printed', { exact: true })
      const original = await name.inputValue()
      await name.fill('An unsaved change')
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(heading)
      await expect(dialog.getByRole('heading', { level: 2 })).toBeFocused()
      await expect(dialog.getByRole('textbox')).toHaveCount(0)
      await dialog.getByRole('button', { name: edit, exact: true }).click()
      await expect(name).toHaveValue(original)
      await closeSheet(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.getByRole('button', { name: 'People', exact: true }).click()
    await page.getByRole('button', { name: /^Open Demo\b/ }).click()
    await page.getByRole('button', { name: 'Edit clothing profile', exact: true }).click()
    await expect(page.getByRole('dialog').getByLabel('Name', { exact: true })).toHaveValue('Demo')
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.goto('/me')
    // Settings is a list row on Me, not a pill.
    const settings = page.getByRole('button', { name: /^Settings\b/ })
    await expect(settings).toBeVisible()
    expect(await settings.evaluate((element) => parseFloat(getComputedStyle(element).borderRadius) < element.clientWidth / 2)).toBe(true)
  }
})

test('today’s outfit saves matching quantities, survives reload, and can be cleared', async ({ page }) => {
  // The demo hamper holds every demo garment, so this outfit uses its own household with ready clothes.
  await page.setViewportSize({ width: 390, height: 844 })
  await signUp(page, 'outfit', 'Olive Outfit')
  await createHousehold(page)
  const { client, householdId } = await convexAs(page)
  const status = await client.query(api.households.onboardingStatus, {})
  const mine = (await client.query(api.inventory.list, { householdId })).wearers.find((wearer) => wearer.principalKey === status.principalKey)!
  const partner = await client.mutation(api.inventory.createWearer, { householdId, name: 'Partner', kind: 'adult' })
  const ready = { kind: 't_shirt', colorGroup: 'white', color: 'White', status: 'clean' } as const
  await client.mutation(api.inventory.createTextiles, { householdId, name: 'Raglan Tee', quantity: 2, wearerId: mine.wearerId, ...ready, tags: ['Weekend outfit'] })
  await client.mutation(api.inventory.createTextiles, { householdId, name: 'Court Shorts', quantity: 1, wearerId: mine.wearerId, ...ready, kind: 'shorts' })
  await client.mutation(api.inventory.createTextiles, { householdId, name: 'Ink LS Tee', quantity: 1, wearerId: partner, ...ready, color: 'Black', colorGroup: 'black' })
  await page.goto('/')
  const outfit = page.getByRole('region', { name: 'Today’s outfit', exact: true })
  const sheet = page.getByRole('dialog', { name: 'Outfit' })
  const planned = outfit.getByRole('list', { name: 'Planned outfit' })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error' && /hydration|useContext|invalid hook/i.test(message.text())) errors.push(message.text()) })
  await outfit.getByRole('button', { name: 'Choose today’s outfit', exact: true }).click()
  await sheet.getByRole('group', { name: 'Outfit tags' }).getByRole('button', { name: 'Weekend outfit', exact: true }).click()
  const choice = sheet.getByRole('button', { name: 'Choose Raglan Tee, White', exact: true })
  await choice.click()
  await sheet.getByRole('button', { name: 'More Raglan Tee, White', exact: true }).click()
  await sheet.getByRole('button', { name: 'Save outfit', exact: true }).click()
  await expect(sheet).toHaveCount(0)
  await expect(planned).toContainText('Raglan Tee ×2')
  await page.reload()
  await expect(planned).toContainText('Raglan Tee ×2')
  // Home's tag filter sits above the ready clothes it filters.
  const tags = page.getByLabel('Filter by tag', { exact: true })
  expect((await tags.boundingBox())!.y).toBeLessThan((await page.getByRole('region', { name: 'Ready to wear pages', exact: true }).boundingBox())!.y)
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await outfit.getByRole('button', { name: 'Change today’s outfit', exact: true }).click()
    await sheet.getByRole('group', { name: 'Outfit tags' }).getByRole('button', { name: 'All tags', exact: true }).click()
    await expect(choice).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await sheet.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(sheet).toHaveCount(0)
  }
  await outfit.getByRole('combobox', { name: 'Outfit for', exact: true }).selectOption({ label: 'Partner' })
  await outfit.getByRole('button', { name: 'Choose today’s outfit', exact: true }).click()
  await sheet.getByRole('button', { name: 'Choose Ink LS Tee, Black', exact: true }).click()
  await sheet.getByRole('button', { name: 'Save outfit', exact: true }).click()
  await expect(planned).toContainText('Ink LS Tee')
  await page.reload()
  await expect(planned).toContainText('Raglan Tee ×2')
  await outfit.getByRole('combobox', { name: 'Outfit for', exact: true }).selectOption({ label: 'Partner' })
  await expect(planned).toContainText('Ink LS Tee')
  // Deselecting everything turns Save into Clear outfit.
  await outfit.getByRole('button', { name: 'Change today’s outfit', exact: true }).click()
  await sheet.getByRole('button', { name: 'Choose Ink LS Tee, Black', exact: true }).click()
  await sheet.getByRole('button', { name: 'Clear outfit', exact: true }).click()
  await expect(outfit.getByRole('button', { name: 'Choose today’s outfit', exact: true })).toBeVisible()
  await outfit.getByRole('combobox', { name: 'Outfit for', exact: true }).selectOption({ label: 'Me' })
  await expect(planned).toContainText('Raglan Tee ×2')
  expect(errors).toEqual([])
})

test('custom tags save on a matching pack, stay off grid cards, and filter independently of type', async ({ page }) => {
  await signIn(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/closet')
  const card = closetRows(page, 'Staple Raglan Tee').filter({ hasText: 'White' })
  // Tags open from the record's Details tab, over the record, which stays open beneath.
  const editTags = async () => {
    await page.getByRole('dialog').getByRole('tab', { name: 'Details', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: /^Tags: .*\. Edit\.$/ }).click()
  }
  // Closet filters live in the Manage closet popover: a status chip row plus one chip per used tag.
  const filters = async (act: (popover: ReturnType<Page['getByRole']>) => Promise<void>) => {
    await page.getByRole('button', { name: 'Manage closet', exact: true }).click()
    const popover = page.getByRole('dialog', { name: 'Closet filters and management' })
    await act(popover)
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
  }
  await card.click()
  await editTags()
  const dialog = topDialog(page)
  await expect(dialog).toHaveAccessibleName('Tags')
  const input = dialog.getByPlaceholder('Filter or add a tag')
  await input.fill('fuck')
  await dialog.getByRole('button', { name: 'Add tag', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('offensive language')
  await input.fill('E2E capsule')
  await input.press('Enter')
  await expect(dialog.getByRole('group', { name: 'Tags', exact: true }).getByRole('button', { name: 'E2E capsule', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('button', { name: 'Save tags', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Tags', exact: true })).toHaveCount(0)
  await closeSheet(page)
  try {
    await page.reload()
    await expect(card).toBeVisible()
    await expect(card).not.toContainText('E2E capsule')
    await filters(async (popover) => {
      await popover.getByRole('button', { name: 'E2E capsule', exact: true }).click()
      await expect(popover.getByRole('button', { name: 'E2E capsule', exact: true })).toHaveAttribute('aria-pressed', 'true')
    })
    await expect(closetRows(page)).toHaveCount(1)
    // The tag combines with the status filter: nothing tagged is ready, so Ready shows the empty result.
    await filters((popover) => popover.getByRole('button', { name: 'Ready', exact: true }).click())
    await expect(page.getByRole('status').filter({ hasText: 'No clothes match your search or filters.' })).toBeVisible()
    await filters((popover) => popover.getByRole('button', { name: 'All', exact: true }).click())
    await expect(closetRows(page)).toHaveCount(1)
    await page.reload()
    await expect(closetRows(page)).toHaveCount(1)
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 844 })
      await card.click()
      await page.getByRole('dialog').getByRole('tab', { name: 'Details', exact: true }).click()
      await expect(page.getByRole('dialog').getByRole('button', { name: /^Tags: .*E2E capsule.*\. Edit\.$/ })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await closeSheet(page)
    }
  } finally {
    await page.goto('/closet')
    const reset = page.getByRole('button', { name: 'Reset filters', exact: true })
    if (await reset.isVisible()) await reset.click()
    await card.click()
    await editTags()
    await topDialog(page).getByRole('group', { name: 'Tags', exact: true }).getByRole('button', { name: 'E2E capsule', exact: true }).click()
    await topDialog(page).getByRole('button', { name: 'Save tags', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Tags', exact: true })).toHaveCount(0)
    await closeSheet(page)
  }
})

test('saved selection and filters survive reload without hydration or hook errors', async ({ page }) => {
  await signIn(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydration|useContext|invalid hook/i.test(message.text())) errors.push(message.text())
  })
  // The hamper's per-row choice survives a reload.
  await page.goto('/laundry')
  const firstRow = hamperRows(page).first()
  await expect(firstRow).toContainText('4 of 4 selected')
  const stepper = page.getByRole('main').getByRole('listitem').first().getByRole('group')
  await stepper.getByRole('button', { name: /^Fewer / }).click()
  await expect(page.getByRole('button', { name: 'Sort 22 pieces into loads', exact: true })).toBeEnabled()
  await page.reload()
  await expect(firstRow).toContainText('3 of 4 selected')
  await expect(page.getByRole('button', { name: 'Sort 22 pieces into loads', exact: true })).toBeEnabled()
  await stepper.getByRole('button', { name: /^More / }).click()
  await expect(firstRow).toContainText('4 of 4 selected')
  // The chosen family closet is remembered on this device across a reload.
  await page.goto('/closet')
  await page.getByRole('radiogroup', { name: 'Whose clothes' }).getByRole('radio', { name: 'Partner', exact: true }).click()
  await expect(closetRows(page).first()).toBeVisible()
  const partnerRows = await closetRows(page).count()
  await page.reload()
  await expect(closetRows(page)).toHaveCount(partnerRows)
  const profiles = page.getByRole('radiogroup', { name: 'Whose clothes' })
  await expect(profiles.getByRole('radio', { name: 'Partner', exact: true })).toBeChecked()
  await profiles.getByRole('radio', { name: 'Everyone', exact: true }).click()
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Care overview', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('page polish keeps browsing controls aligned and garment copy consistent at phone and desktop sizes', async ({ page }) => {
  await signIn(page)
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/closet')
    const heading = page.getByRole('heading', { level: 1, name: 'Closet', exact: true })
    await expect(heading).toBeVisible()
    const search = page.getByRole('searchbox', { name: 'Search clothes' })
    // The browsing controls sit in the page header beside the title; the status chips share one row.
    const manage = page.getByRole('button', { name: 'Manage closet', exact: true })
    const headingBox = (await heading.boundingBox())!
    const manageBox = (await manage.boundingBox())!
    expect(manageBox.y + manageBox.height / 2).toBeCloseTo(headingBox.y + headingBox.height / 2, -1)
    expect(manageBox.height).toBeGreaterThanOrEqual(40)
    await manage.click()
    const chips = page.getByRole('group', { name: 'Filter clothes', exact: true })
    await expect(chips).toBeVisible()
    // The drawer slides in, so compare the two chips' rows once it has settled.
    const chipY = async (name: string) => (await chips.getByRole('button', { name, exact: true }).boundingBox())!.y
    await expect.poll(async () => Math.abs(await chipY('Needs care') - await chipY('All'))).toBeLessThan(0.5)
    await page.keyboard.press('Escape')
    await expect(chips).toBeHidden()
    await search.fill('no such garment')
    await expect(closetRows(page)).toHaveCount(0)
    await search.fill('')
    await expect(closetRows(page).first()).toBeVisible()
    // A garment reads the same in Closet and in the hamper: its name, then its color.
    await expect(closetRows(page, 'Staple Raglan Tee').filter({ hasText: 'White' })).toContainText(/Staple Raglan Tee.*White/)
    await page.goto('/laundry')
    await expect(page.getByRole('heading', { name: 'Laundry', exact: true })).toBeVisible()
    await expect(hamperRows(page, 'Staple Raglan Tee').filter({ hasText: 'White' })).toContainText(/Staple Raglan Tee.*White/)
    const fewer = page.getByRole('button', { name: /^Fewer / }).first()
    expect((await fewer.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await page.goto('/')
    await expect(page.getByRole('region', { name: 'Care overview', exact: true })).toBeVisible()
    // Ready tiles carry no status chip: every one reads as ready to wear.
    expect(await homeReadyTiles(page).evaluateAll((links) => links.every((link) => link.getAttribute('aria-label')?.includes('Ready to wear')))).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('empty states lead back to clothes and secondary actions look like buttons on mobile and desktop', async ({ page }) => {
  await signIn(page)
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    // Me's empty laundry history says what will appear there.
    await page.goto('/me')
    await expect(page.getByRole('heading', { name: 'Laundry history', exact: true })).toBeVisible()
    await expect(page.getByText('No completed loads yet', { exact: false })).toBeVisible()
    // Closet: a search with no match says so, and clearing it brings the clothes back.
    await page.goto('/closet')
    const add = page.getByRole('main').getByRole('button', { name: 'Add clothes', exact: true })
    await expect(add).toBeVisible()
    const search = page.getByRole('searchbox', { name: 'Search clothes' })
    await search.fill('no such garment')
    await expect(closetRows(page)).toHaveCount(0)
    await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'no such garment' })).toBeVisible()
    await search.fill('')
    await expect(closetRows(page).first()).toBeVisible()
    // A filter with no match offers Reset filters, an outlined secondary button that leads back to the clothes.
    await page.getByRole('button', { name: 'Manage closet', exact: true }).click()
    await page.getByRole('group', { name: 'Filter clothes', exact: true }).getByRole('button', { name: 'Ready', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'No clothes match your search or filters.' })).toBeVisible()
    const reset = page.getByRole('button', { name: 'Reset filters', exact: true })
    await expect(reset).toHaveAttribute('data-variant', 'outline')
    await reset.click()
    await expect(reset).toHaveCount(0)
    await expect(closetRows(page).first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('mobile page navigation is immediate and keeps the navigation in place', async ({ page }) => {
  await page.setViewportSize({ width: 462, height: 795 })
  await page.addInitScript(() => {
    Object.assign(window, { pageSnapshots: 0 })
    const start = document.startViewTransition?.bind(document)
    if (start) document.startViewTransition = (...args) => { (window as any).pageSnapshots++; return start(...args) }
  })
  await signIn(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Primary navigation' })
  const position = await nav.boundingBox()
  for (const name of ['Closet', 'Laundry', 'Household', 'Me', 'Home']) {
    await nav.getByRole('link', { name, exact: name !== 'Laundry' }).click()
    expect(await page.evaluate(() => (window as any).pageSnapshots)).toBe(0)
    expect((await nav.boundingBox())!.y).toBeCloseTo(position!.y, 0)
  }
})

test('Home item transitions keep the drawer intact and never replay its opening animation', async ({ page, browserName }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, topMax: 59 } })
  }
  await page.addInitScript(() => {
    const transitions: { error?: string; animations?: string[]; sheetTransform?: string; contentName?: string; incomingOpacity?: string }[] = []
    Object.assign(window, { careTransitions: transitions })
    const original = document.startViewTransition?.bind(document)
    if (!original) return
    document.startViewTransition = (options: Parameters<Document['startViewTransition']>[0]) => {
      const entry = {} as typeof transitions[number]
      transitions.push(entry)
      const transition = original(options)
      transition.ready.then(() => {
        entry.animations = document.getAnimations().map((animation) => (animation.effect as KeyframeEffect)?.pseudoElement ?? '').filter(Boolean)
        const sheet = document.querySelector('.sheet')
        entry.sheetTransform = sheet ? getComputedStyle(sheet).transform : 'none'
        entry.contentName = getComputedStyle(document.querySelector('.app-main')!).viewTransitionName
        if ((window as any).careHoldTransition) {
          const animations = document.getAnimations().filter((animation) => (animation.effect as KeyframeEffect)?.pseudoElement)
          for (const animation of animations) { animation.pause(); animation.currentTime = 90 }
          Object.assign(window, { careHeldAnimations: animations })
        }
        entry.incomingOpacity = getComputedStyle(document.documentElement, '::view-transition-new(root)').opacity
      }, (error) => { entry.error = String(error) })
      return transition
    }
  })
  await signIn(page)
  await expect(homeGarmentLinks(page).first()).toBeVisible()
  await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'))
  const home = homeGarmentLinks(page).first()
  const shellStyle = await page.locator('.wordmark').evaluate((node) => ({ filter: getComputedStyle(node).filter, top: node.getBoundingClientRect().top }))
  expect(shellStyle.filter).toBe('none')
  // The wordmark sits below the emulated 59px safe-area inset (the compact header leaves little extra room).
  expect(shellStyle.top).toBeGreaterThanOrEqual(browserName === 'chromium' ? 59 : 0)
  await page.screenshot({ path: testInfo.outputPath('logo-safe-area-home.png'), animations: 'disabled' })
  await page.evaluate(() => (window as any).careTransitions.splice(0))
  await home.click()
  await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toBeVisible()
  const title = await page.getByRole('dialog').getByRole('heading', { level: 2 }).innerText()
  await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'))
  await page.screenshot({ path: testInfo.outputPath('home-item-opening-frame.png') })
  // The drawer owns its slide and scrim, so no page snapshot runs over it and it settles once, open and unshifted.
  await expect.poll(() => page.getByRole('dialog').evaluate((node) => ({
    // An identity matrix is the settled drawer, the same as no transform.
    transform: getComputedStyle(node).transform.replace('matrix(1, 0, 0, 1, 0, 0)', 'none'),
    animation: getComputedStyle(node).animationName,
    count: document.querySelectorAll('[role=dialog]').length,
  }))).toEqual({ transform: 'none', animation: 'none', count: 1 })
  await page.screenshot({ path: testInfo.outputPath('home-item-details-phone.png'), animations: 'disabled' })
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(home).toBeVisible()
  await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'))
  const transitions = await page.evaluate(() => (window as any).careTransitions) as { error?: string }[]
  expect(transitions.flatMap((transition) => transition.error ? [transition.error] : [])).toEqual([])
  expect(transitions).toHaveLength(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await home.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(home).toBeVisible()
  expect(await page.evaluate(() => (window as any).careTransitions.length)).toBe(0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.evaluate(() => Object.defineProperty(document, 'startViewTransition', { value: undefined, configurable: true }))
  await home.click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: title, exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(home).toBeVisible()
  expect(errors).toEqual([])
  console.log(JSON.stringify({ transitions: transitions.length, logoTop: shellStyle.top }))
})

test('Repeated Closet and Laundry drawers preserve the page icons and scroll position', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible()
  for (const [name, rows] of [['Closet', closetRows], ['Laundry', hamperRows]] as const) {
    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name, exact: name === 'Closet' }).click()
    if (name === 'Closet') await everyone(page)
    const card = rows(page).first()
    await expect(card).toBeVisible()
    await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'))
    await card.scrollIntoViewIfNeeded()
    await page.evaluate(async () => {
      const icons = [...document.querySelectorAll<HTMLElement>('main li .garment-icon')].filter((icon) => {
        const rect = icon.getBoundingClientRect()
        return rect.top < innerHeight && rect.bottom > 0
      })
      Object.assign(window, { drawerPageIcons: icons, drawerScroll: scrollY })
    })
    for (let count = 0; count < 3; count++) {
      // Tap the visible card without the automation driver's implicit scroll-to-centre.
      const box = (await card.boundingBox())!
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      const drawer = page.getByRole('dialog')
      await expect(drawer).toBeVisible()
      await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'))
      await expect(drawer.locator('.sheet-header-art .garment-icon svg')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(drawer).toHaveCount(0)
      await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'))
      expect(await page.evaluate(() => { const icons = (window as any).drawerPageIcons as HTMLElement[]; return icons.length > 0 && icons.every((icon) => icon.isConnected) })).toBe(true)
      expect(await page.evaluate(() => scrollY)).toBe(await page.evaluate(() => (window as any).drawerScroll))
    }
  }
})

test('Closet item hands off to Laundry preparation across device sizes', async ({ page }, testInfo) => {
  await signIn(page)
  for (const [name, width, height, colorScheme] of [['desktop', 1440, 1000, 'light'], ['tablet', 834, 1112, 'dark'], ['phone', 390, 844, 'dark']] as const) {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ colorScheme })
    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Closet', exact: true }).click()
    await everyone(page)
    // The row carries the brand in its name and the matching quantity in its text.
    await expect(closetRows(page).first()).toHaveAccessibleName(/AS Colour/)
    await expect(closetRows(page).first()).toContainText('×4')
    await closetRows(page).first().click()
    const dialog = page.getByRole('dialog')
    // An unchecked label is one confirmation note on the record, not an error.
    await expect(dialog.getByRole('group', { name: 'Needs confirmation: Care label not checked', exact: true })).toBeVisible()
    await expect(dialog.getByText('Care label not checked', { exact: true })).toHaveCount(1)
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    if (name === 'desktop') {
      await dialog.getByRole('button', { name: 'Check care label', exact: true }).click()
      // The label check opens over the record; Escape returns to the record.
      await expect(topDialog(page).getByRole('heading', { name: 'Check the care label', exact: true })).toBeVisible()
      await expect(topDialog(page).getByRole('button', { name: 'Save label answers', exact: true })).toBeEnabled()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog', { name: 'Check the care label' })).toHaveCount(0)
      await expect(dialog).toHaveCount(1)
    }
    await expect(dialog.getByText('Prepare for washing', { exact: true })).toHaveCount(0)
    const title = await dialog.getByRole('heading', { level: 2 }).innerText()
    await settled(page)
    await page.screenshot({ path: testInfo.outputPath(`${name}-closet-item.png`) })
    await dialog.getByRole('link', { name: /^\d+ in the hamper$/ }).click()
    await expect(page).toHaveURL(/\/laundry\?item=/)
    await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(dialog.getByRole('group', { name: 'Wash now', exact: true }).first()).toBeVisible()
    await expect(dialog.getByLabel('How dirty?', { exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Save care details', exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Update care details', exact: true })).toHaveCount(0)
    await settled(page)
    await page.screenshot({ path: testInfo.outputPath(`${name}-laundry-quantity.png`) })
    const selection = dialog.getByRole('group', { name: 'Wash now', exact: true }).first()
    // Only chosen clothes can receive new stains; the rest remain untouched.
    while (await selection.getByRole('button').first().isEnabled()) await selection.getByRole('button').first().click()
    await selection.getByRole('button').last().click()
    await selection.getByRole('button').last().click()
    await dialog.locator('.laundry-care-group').first().getByRole('button', { name: /Add stains or a note|Edit stains and notes/ }).click()
    await expect(dialog.getByLabel('How dirty?', { exact: true })).toBeVisible()
    await expect(dialog.getByLabel('Needed by?', { exact: true })).toBeVisible()
    const affected = dialog.getByRole('group', { name: 'Affected clothes', exact: true })
    await expect(affected).toContainText('1 of 2 selected')
    await affected.getByRole('button').last().click()
    await expect(affected.getByRole('button').last()).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Save care details', exact: true })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Save care details', exact: true }).scrollIntoViewIfNeeded()
    const saveBounds = await dialog.getByRole('button', { name: 'Save care details', exact: true }).boundingBox()
    const footerBounds = await dialog.getByRole('contentinfo').boundingBox()
    expect(saveBounds!.y + saveBounds!.height).toBeLessThanOrEqual(footerBounds!.y)
    await page.screenshot({ path: testInfo.outputPath(`${name}-laundry-item.png`) })
    expect(await dialog.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(false)
    // Laundry changes only today's care need; identity edits stay on the Closet record's Details tab.
    await expect(dialog.getByRole('tab', { name: 'Details', exact: true })).toHaveCount(0)
    // Closing Laundry returns to the originating Closet item in router history.
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/closet\?item=/)
    await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await settled(page)
    await closeSheet(page)
    // The hamper's own steppers choose what gets sorted; the Sort button counts the chosen pieces.
    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: /^Laundry/ }).click()
    // The record's Wash now choice carried over: 2 of the first row's 4 pieces are chosen.
    const firstRow = hamperRows(page).first()
    await expect(firstRow).toContainText('2 of 4 selected')
    await expect(page.getByRole('button', { name: 'Sort 21 pieces into loads', exact: true })).toBeEnabled()
    const more = page.getByRole('main').getByRole('listitem').first().getByRole('group').getByRole('button', { name: /^More / })
    while (await more.isEnabled()) await more.click()
    await expect(firstRow).toContainText('4 of 4 selected')
    await expect(page.getByRole('button', { name: 'Sort 23 pieces into loads', exact: true })).toBeEnabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  }
})

test('household cards retain readable details and short history keeps navigation anchored', async ({ page }, testInfo) => {
  await signIn(page)
  for (const [name, width, height, colorScheme] of [['wide', 2048, 1286, 'dark'], ['tablet', 834, 1112, 'light'], ['phone', 390, 844, 'dark']] as const) {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ colorScheme })
    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Household', exact: true }).click()
    for (const section of ['Appliances', 'Products', 'People']) {
      await page.getByRole('button', { name: section, exact: true }).click()
      await settled(page)
      await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode().catch(() => undefined))))
      if (section !== 'People') {
        // Each record row reads its name and details in one accessible name and keeps them inside the row.
        const cards = page.getByRole('main').getByRole('listitem').getByRole('button', { name: section === 'Products' ? /\. Open product$/ : /\. Edit settings$/ })
        expect(await cards.count()).toBeGreaterThan(0)
        for (const card of await cards.all()) {
          await expect(card).toBeVisible()
          await expect(card).not.toBeEmpty()
          expect(await card.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        }
        await cards.first().click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await closeSheet(page)
      } else {
        const demo = page.getByRole('button', { name: /^Open Demo\b/ })
        await expect(demo).toBeVisible()
        await demo.click()
        await expect(page.getByRole('dialog').getByRole('heading', { name: 'Demo', exact: true })).toBeVisible()
        await closeSheet(page)
      }
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: testInfo.outputPath(`${name}-household-${section.toLowerCase()}.png`) })
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    }
    // Me's short page (its laundry history is empty) and Settings keep the navigation where it was.
    const nav = page.getByRole('navigation', { name: 'Primary navigation' })
    const position = await nav.boundingBox()
    await nav.getByRole('link', { name: 'Me', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Laundry history', exact: true })).toBeVisible()
    await settled(page)
    expect((await nav.boundingBox())!.y).toBeCloseTo(position!.y, 0)
    await page.getByRole('button', { name: /^Settings\b/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible()
    await settled(page)
    expect((await nav.boundingBox())!.y).toBeCloseTo(position!.y, 0)
    const gap = await page.evaluate(() => document.querySelector('main')!.getBoundingClientRect().top - document.querySelector('.wordmark')!.getBoundingClientRect().bottom)
    // The page content starts clear of the header wordmark.
    expect(gap).toBeGreaterThanOrEqual(8)
    await page.screenshot({ path: testInfo.outputPath(`${name}-settings.png`) })
  }
})

test('Settings groups compact preferences and keeps destructive account actions closed', async ({ page }, testInfo) => {
  await signIn(page)
  await page.goto('/settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible()
  for (const [name, width, height] of [['phone', 390, 844], ['desktop', 1440, 1000]] as const) {
    await page.setViewportSize({ width, height })
    await expect(page.getByRole('radiogroup', { name: 'Appearance', exact: true })).toBeVisible()
    await expect(page.getByLabel('Confirm your password', { exact: true })).not.toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    const theme = page.getByRole('radiogroup', { name: 'Appearance', exact: true })
    await theme.getByRole('radio', { name: 'Dark', exact: true }).click()
    await expect(theme.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked()
    await theme.getByRole('radio', { name: 'System', exact: true }).click()
    const units = page.getByRole('radiogroup', { name: 'Units on this device', exact: true })
    await units.getByRole('radio', { name: 'US', exact: true }).click()
    await expect(units.getByRole('radio', { name: 'US', exact: true })).toBeChecked()
    await units.getByRole('radio', { name: 'Automatic', exact: true }).click()
    await page.screenshot({ path: testInfo.outputPath(`${name}-settings-groups.png`), animations: 'disabled' })
  }
  // Account actions live on Account; deleting opens its own sheet with a password and a destructive button.
  await page.goto('/account')
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true })
  await expect(signOut).toBeVisible()
  const signOutBackground = await signOut.evaluate((node) => getComputedStyle(node).backgroundColor)
  await expect(page.getByLabel('Confirm your password', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: /^Delete account\b/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Delete account' })
  await expect(sheet.getByLabel('Confirm your password', { exact: true })).toBeVisible()
  const destructive = sheet.getByRole('button', { name: 'Delete account', exact: true })
  await expect(destructive).toBeDisabled()
  expect(await destructive.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(signOutBackground)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('Confirm your password', { exact: true })).toHaveCount(0)
})

test('shared frame, navigation and item arrival across device sizes', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await signIn(page)
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
  await page.evaluate(() => {
    const audit = { loading: false, shifts: 0, since: performance.now(), measuresShifts: PerformanceObserver.supportedEntryTypes.includes('layout-shift') }
    Object.assign(window, { polishAudit: audit })
    new MutationObserver(() => { if (document.querySelector('.skeleton, .app-loading')) audit.loading = true }).observe(document.body, { childList: true, subtree: true })
    if (audit.measuresShifts) new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; sources: { node?: Node }[] })[]) {
        if (entry.startTime >= audit.since && entry.sources.some((source) => source.node instanceof Element && source.node.closest('.app-main'))) audit.shifts += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: false })
  })
  const measurements = []
  for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 834, 1112], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height })
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    let origin: { x: number; y: number; width: number } | undefined
    for (const [tab, path] of [['Home', '/'], ['Closet', '/closet'], ['Laundry', '/laundry'], ['Household', '/household'], ['Me', '/me']] as const) {
      await page.evaluate(() => Object.assign((window as unknown as { polishAudit: object }).polishAudit, { loading: false, shifts: 0, since: performance.now() }))
      await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: tab, exact: tab !== 'Laundry' }).click()
      await expect(page).toHaveURL((url) => url.pathname === path)
      await expect(page.locator('.page')).toHaveClass(new RegExp(tab === 'Home' ? 'home-overview' : tab === 'Laundry' ? 'wash' : tab.toLowerCase()))
      await expect(page.locator('.page')).toBeVisible()
      await settled(page)
      await page.screenshot({ path: testInfo.outputPath(`${name}-${tab.toLowerCase()}.png`) })
      const measured = await page.evaluate(({ name, tab }) => {
        const main = document.querySelector('.page')!.getBoundingClientRect()
        const header = document.querySelector('.app-header')!.getBoundingClientRect()
        return { name, tab, x: main.x, y: main.y, width: main.width, height: main.height, headerX: header.x,
          overflow: document.documentElement.scrollWidth > innerWidth,
          ...(window as unknown as { polishAudit: { loading: boolean; shifts: number } }).polishAudit }
      }, { name, tab })
      measurements.push(measured)
      if (origin === undefined) origin = measured
      expect(measured.x).toBeCloseTo(origin.x, 0)
      expect(measured.y).toBeCloseTo(origin.y, 0)
      expect(measured.width).toBeCloseTo(origin.width, 0)
      expect(measured.overflow).toBe(false)
      expect(measured.loading, `${name} ${tab}: loading placeholder shown`).toBe(false)
      expect(measured.shifts, `${name} ${tab}: layout shift`).toBeLessThan(0.02)
    }
    await page.getByRole('button', { name: /^Settings\b/ }).click()
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    await settled(page)
    await page.screenshot({ path: testInfo.outputPath(`${name}-settings.png`) })
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Closet', exact: true }).click()
  await settled(page)
  expect(await page.evaluate(() => getComputedStyle(document.documentElement, '::view-transition-new(care-content)').animationName)).toBe('none')
  expect(errors).toEqual([])
  console.log(JSON.stringify(measurements))
})

test('key journeys open the right item and forms, and return without saving', async ({ page }, testInfo) => {
  await signIn(page)
  const nav = page.getByRole('navigation', { name: 'Primary navigation' })
  await expect(nav).toBeVisible()
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height })
    await nav.getByRole('link', { name: 'Home', exact: true }).click()
    const preview = homeGarmentLinks(page).first()
    await expect(preview).toBeVisible()
    await settled(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await settled(page)
    await page.screenshot({ path: testInfo.outputPath(name + '-home-dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })
    await settled(page)
    await page.screenshot({ path: testInfo.outputPath(name + '-home.png') })
    await preview.click()
    await expect(page).toHaveURL(/item=/)
    const record = page.getByRole('dialog')
    await expect(record.getByRole('heading', { level: 2 })).toBeVisible()
    await expect(record.locator('.sheet-header-art .garment-icon')).toBeVisible()
    await settled(page)
    await page.screenshot({ path: testInfo.outputPath(name + '-item.png') })
    // Edit opens over the still-open record; Escape closes the editor first, then the record.
    await record.getByRole('tab', { name: 'Details', exact: true }).click()
    await record.getByRole('button', { name: /^Color: .*\. Edit\.$/ }).click()
    // The record stays mounted beneath the editor (hidden from assistive tech while the editor is on top).
    await expect(page.locator('[role=dialog]')).toHaveCount(2)
    await expect(topDialog(page).getByRole('heading', { level: 2 })).toHaveText(/matching pieces|Clothing details/)
    await page.keyboard.press('Escape')
    await expect(page.locator('[role=dialog]')).toHaveCount(1)
    await expect(record.getByRole('tab', { name: 'Details', exact: true })).toHaveAttribute('aria-selected', 'true')
    await closeSheet(page)
    await expect(page).toHaveURL((url) => url.pathname === '/')
    await nav.getByRole('link', { name: 'Closet', exact: true }).click()
    await everyone(page)
    await settled(page)
    const originalCount = await closetRows(page).count()
    const search = page.getByRole('searchbox', { name: 'Search clothes' })
    await search.fill('no-such-garment-xyz')
    await expect(closetRows(page)).toHaveCount(0)
    await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'no-such-garment-xyz' })).toBeVisible()
    await search.fill('')
    await expect(closetRows(page)).toHaveCount(originalCount)
    if (name === 'mobile') {
      await closetRows(page).last().scrollIntoViewIfNeeded()
      const clearance = (await nav.boundingBox())!.y - ((await closetRows(page).last().boundingBox())!.y + (await closetRows(page).last().boundingBox())!.height)
      expect(clearance).toBeGreaterThanOrEqual(0)
    }
    await page.getByRole('button', { name: 'Manage closet', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Closet filters and management' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('main').getByRole('button', { name: 'Add clothes', exact: true }).click()
    const add = page.getByRole('dialog')
    await expect(add.getByRole('heading', { name: 'What is it?', exact: true })).toBeVisible()
    await expect(add.getByRole('button', { name: 'Close', exact: true })).toBeVisible()
    await settled(page)
    await page.screenshot({ path: testInfo.outputPath(name + '-add.png') })
    await closeSheet(page)
    await nav.getByRole('link', { name: /^Laundry/ }).click()
    await settled(page)
    await hamperRows(page).first().click()
    await expect(page.getByRole('dialog').locator('.sheet-header-art .garment-icon')).toBeVisible()
    await expect(page.getByRole('dialog').getByRole('group', { name: 'Wash now', exact: true }).first()).toBeVisible()
    await closeSheet(page)
    await expect(page.getByRole('button', { name: /^Sort \d+ pieces into loads$/ })).toBeEnabled()
    await nav.getByRole('link', { name: 'Household', exact: true }).click()
    await page.getByRole('button', { name: 'Appliances', exact: true }).click()
    await page.getByRole('button', { name: /\. Edit settings$/ }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await closeSheet(page)
    await page.getByRole('button', { name: 'Products', exact: true }).click()
    await page.getByRole('button', { name: /\. Open product$/ }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await closeSheet(page)
    await page.getByRole('button', { name: 'People', exact: true }).click()
    await page.getByRole('button', { name: /^Open Demo\b/ }).click()
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Demo', exact: true })).toBeVisible()
    await closeSheet(page)
    await nav.getByRole('link', { name: 'Me', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Laundry history', exact: true })).toBeVisible()
    await page.getByRole('button', { name: /^Settings\b/ }).click()
    const theme = page.getByRole('radiogroup', { name: 'Appearance', exact: true })
    const initialTheme = await theme.getByRole('radio', { checked: true }).innerText()
    await theme.getByRole('radio', { name: 'Dark', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await theme.getByRole('radio', { name: initialTheme, exact: true }).click()
    await page.getByRole('link', { name: 'Back to Me', exact: true }).click()
  }
  await page.getByRole('button', { name: /^Account\b/ }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Sign out?' })
  if (await confirm.count() > 0 || await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible()
  await expect(homeReadyTiles(page).or(page.getByRole('navigation', { name: 'Primary navigation' }))).toHaveCount(0)
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('washcloset:private:')))).toEqual([])
})

test('fresh account explores joining without creating a household, then creates one', async ({ page }) => {
  await signUp(page, 'first-run', 'Fran First')
  await page.getByRole('button', { name: /Join a household/ }).click()
  await expect(page.getByLabel('Invite code', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your household', exact: true })).toBeVisible()
  // Nothing is created by looking: a reload returns to the same choice, without the app's navigation.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your household', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(0)
  await createHousehold(page)
})

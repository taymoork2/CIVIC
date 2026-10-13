import { expect, test, type Locator, type Page } from '@playwright/test'

// Finite additions to A7's base-state matrix. An already-running development app is required.
test.use({ locale: 'en-US', colorScheme: 'dark', viewport: { width: 320, height: 640 } })

test.beforeAll(() => {
  expect(process.env.WASHCLOSET_E2E_BASE_URL, 'Set an explicit development base URL').toBeTruthy()
  expect(process.env.WASHCLOSET_E2E_BUILD).not.toBe('production')
})

const mutations = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const sent: string[] = []
  mutations.set(page, sent)
  page.on('websocket', (socket) => socket.on('framesent', ({ payload }) => {
    const frame = JSON.parse(String(payload))
    if (frame.type === 'Mutation') sent.push(frame.udfPath)
  }))
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/mutation') sent.push(request.url())
  })
})

test.afterEach(async ({ page }, info) => {
  expect(mutations.get(page), 'Previews must not send household mutations').toEqual([])
  await info.attach('variant', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
})

async function open(page: Page, screen: string, state?: string, scale = 2) {
  const search = new URLSearchParams({ screen, textScale: String(scale) })
  if (state) search.set('state', state)
  await page.goto(`/design-preview?${search}`)
  await page.waitForLoadState('networkidle')
  await page.locator('link[data-tanstack-router-dev-styles]').waitFor({ state: 'detached' })
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '')
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('html')).toHaveCSS('font-size', scale === 2 ? '32px' : '16px')
  await noOverflow(page)
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Document overflow').toBe(true)
}

// Visibility alone permits clipping or an obscuring footer. Inspect every rendered text line.
async function readable(target: Locator) {
  await target.scrollIntoViewIfNeeded()
  await expect(target).toBeVisible()
  expect(await target.evaluate((node) => {
    const range = document.createRange()
    range.selectNodeContents(node)
    const footer = (node.closest('.sheet') ?? document).querySelector('.sheet-foot, [data-slot="task-footer"]')?.getBoundingClientRect()
    const inFooter = node.closest('.sheet-foot, [data-slot="task-footer"]') !== null
    const scroll = node.closest('.sheet-scroll, .account-page > div')?.getBoundingClientRect()
    return [...range.getClientRects()].every((rect) => rect.width === 0 || (
      rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1
      && (inFooter || !footer || rect.bottom <= footer.top + 1)
      && (!scroll || (rect.top >= scroll.top - 1 && rect.bottom <= scroll.bottom + 1))
    ))
  }), 'Text lines must clear clipping and the footer').toBe(true)
}

async function footerAction(page: Page, name: string | RegExp, disabled = false) {
  const action = page.locator('[data-slot="task-footer"], .sheet-foot').getByRole('button', { name, exact: typeof name === 'string' })
  if (disabled) await expect(action).toBeDisabled()
  else {
    await expect(action).toBeEnabled()
    await action.focus()
    await expect(action).toBeFocused()
  }
  await readable(action)
}

// A long notice can exceed the body viewport. Scroll and inspect each actual text line.
async function scrollingText(target: Locator) {
  await expect(target).toBeVisible()
  expect(await target.evaluate((node) => {
    const scroll = node.closest<HTMLElement>('.sheet-scroll, .account-page > div')!
    const bounds = scroll.getBoundingClientRect()
    const footer = (node.closest('.sheet') ?? document).querySelector('.sheet-foot, [data-slot="task-footer"]')!.getBoundingClientRect()
    const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
    const range = document.createRange()
    while (text.nextNode()) {
      if (!text.currentNode.textContent?.trim()) continue
      range.selectNodeContents(text.currentNode)
      for (let i = 0; i < range.getClientRects().length; i++) {
        scroll.scrollTop += range.getClientRects()[i]!.top - bounds.top
        const rect = range.getClientRects()[i]!
        if (rect.left < -1 || rect.right > innerWidth + 1 || rect.top < bounds.top - 1 || rect.bottom > Math.min(bounds.bottom, footer.top, innerHeight) + 1) return false
      }
    }
    return true
  }), 'Every notice line must be reachable above the footer').toBe(true)
}

const accountCases = [
  { screen: 'create-account', state: 'invalid', message: 'Enter your name', action: 'Create account', invalid: 'Name' },
  { screen: 'create-account', state: 'error', message: 'Couldn’t reach the server. Check your connection, then try again.', action: 'Create account' },
  { screen: 'create-account', state: 'busy', action: 'Creating account…', disabled: true },
  { screen: 'reset-code', state: 'invalid', message: 'Enter the 6-digit code', action: 'Continue', invalid: '6-digit code', disabled: true },
  { screen: 'reset-code', state: 'error', message: 'Couldn’t reach the server. Check your connection, then try again.', action: 'Continue', disabled: true },
  { screen: 'reset-code', state: 'busy', action: 'Checking…', disabled: true },
  { screen: 'reset-email', state: 'invalid', message: 'Enter a valid email address', action: 'Send code', invalid: 'Email' },
  { screen: 'reset-email', state: 'error', message: 'Couldn’t reach the server. Check your connection, then try again.', action: 'Send code' },
  { screen: 'reset-email', state: 'busy', action: 'Sending…', disabled: true },
  { screen: 'reset-password', state: 'invalid', message: 'Use at least 8 characters', action: 'Save new password', invalid: 'New password' },
  { screen: 'reset-password', state: 'error', message: 'Couldn’t reach the server. Check your connection, then try again.', action: 'Save new password' },
  { screen: 'reset-password', state: 'busy', action: 'Saving…', disabled: true },
  { screen: 'join-code', state: 'invalid', message: 'We couldn’t find that code. Check it with the person who invited you.', action: 'Check code', invalid: 'Invite code', disabled: true },
  { screen: 'join-code', state: 'error', message: 'We couldn’t check this invite. Try again.', action: 'Check code', disabled: true },
  { screen: 'join-code', state: 'busy', action: 'Checking…', disabled: true },
  { screen: 'join-preview', state: 'error', message: 'We couldn’t join this household. Try again.', action: 'Join household: Our apartment' },
  { screen: 'join-preview', state: 'busy', action: 'Joining…', disabled: true },
  { screen: 'join-link', state: 'error', message: 'We couldn’t join this household. Try again.', action: 'Join household: Our apartment' },
  { screen: 'join-link', state: 'busy', action: 'Joining…', disabled: true },
] as const

for (const sample of accountCases) test(`${sample.screen}: ${sample.state}, enlarged narrow error/footer`, async ({ page }) => {
  await open(page, sample.screen, sample.state)
  if ('message' in sample) await readable(page.getByText(sample.message, { exact: true }))
  if ('invalid' in sample) await expect(page.getByLabel(sample.invalid, { exact: true }).and(page.locator('input'))).toHaveAttribute('aria-invalid', 'true')
  if (sample.state === 'busy') {
    const fields = page.locator('.account-page input')
    for (const field of await fields.all()) await expect(field).toBeDisabled()
  }
  if (sample.screen === 'reset-email' || sample.screen === 'reset-password') {
    // These field states show sending once it exists, so no unavailable note is expected here.
    if (sample.screen === 'reset-email') await expect(page.getByRole('note')).toHaveCount(0)
    const back = page.getByRole('link', { name: 'Back to sign in', exact: true })
    await expect(back).toHaveAttribute('href', '/sign-in')
    await back.focus()
    await expect(back).toBeFocused()
    await readable(back)
  }
  await footerAction(page, sample.action, 'disabled' in sample && sample.disabled)
  await noOverflow(page)
})

test('reset email: unavailable delivery promises no code and names the signed-in way to change a password', async ({ page }) => {
  await open(page, 'reset-email')
  const note = page.getByRole('note')
  await scrollingText(note)
  await expect(note).toContainText('Me → Account → Change password')
  await expect(page.getByText(/6-digit code/)).toHaveCount(0)
  await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Send code', exact: true })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  const back = page.getByRole('link', { name: 'Back to sign in', exact: true })
  await expect(back).toHaveAttribute('href', '/sign-in')
  await back.focus()
  await expect(back).toBeFocused()
  await readable(back)
})

test('reset password: validation focuses the first invalid field and retains drafts on resize', async ({ page }) => {
  await open(page, 'reset-password')
  const password = page.getByLabel('New password', { exact: true }).and(page.locator('input'))
  const confirmation = page.getByLabel('Confirm new password', { exact: true })
  await expect(password).toHaveAttribute('autocomplete', 'new-password')
  await expect(confirmation).toHaveAttribute('autocomplete', 'new-password')
  await password.fill('short')
  await confirmation.fill('different')
  await page.getByRole('button', { name: 'Save new password', exact: true }).click()
  await expect(password).toBeFocused()
  await expect(password).toHaveAttribute('aria-invalid', 'true')
  await expect(confirmation).toHaveAttribute('aria-invalid', 'true')
  await readable(page.getByText('Use at least 8 characters', { exact: true }))
  await readable(page.getByText('Passwords don’t match', { exact: true }))
  await password.fill('long-enough-password')
  await confirmation.fill('still-different')
  await page.getByRole('button', { name: 'Save new password', exact: true }).click()
  await expect(confirmation).toBeFocused()
  await expect(password).not.toHaveAttribute('aria-invalid', 'true')
  await expect(confirmation).toHaveAttribute('aria-invalid', 'true')
  await page.setViewportSize({ width: 1120, height: 720 })
  await expect(confirmation).toBeFocused()
  await expect(password).toHaveValue('long-enough-password')
  await expect(confirmation).toHaveValue('still-different')
  await readable(page.getByText('Other devices are signed out after a reset.', { exact: true }))
  await footerAction(page, 'Save new password')
  await noOverflow(page)
})

test('invite link: signed-out account actions preserve the return path', async ({ page }) => {
  await open(page, 'join-link-signed-out')
  await readable(page.getByText('Create an account or sign in to see who invited you and join.', { exact: true }))
  for (const [name, pathname] of [['Create account', '/create-account'], ['I already have an account', '/sign-in']]) {
    const action = page.getByRole('link', { name, exact: true })
    const href = new URL((await action.getAttribute('href'))!, page.url())
    expect(href.pathname).toBe(pathname)
    expect(href.searchParams.get('redirect')).toBe('/join/LC-7Q2M')
    await action.focus()
    await expect(action).toBeFocused()
    await readable(action)
  }
  await expect(page.getByRole('button', { name: /Join household/ })).toHaveCount(0)
})

const inviteLinkCases = [
  { screen: 'join-link-invalid', message: 'We couldn’t find that code. Check it with the person who invited you.' },
  { screen: 'join-link-expired', message: /^This code expired on Oct 1\. Ask the person who invited you for a new one\.$/ },
  { screen: 'join-link-used', message: 'This code was already used. Ask the person who invited you for a new one.' },
  { screen: 'join-link-member', message: 'An account can belong to one household at a time. Leave your current household in Household settings before joining another.' },
] as const

for (const sample of inviteLinkCases) test(`${sample.screen}: focused outcome and reachable footer`, async ({ page }) => {
  await open(page, sample.screen)
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await readable(page.getByText(sample.message, { exact: true }))
  await expect(page.getByRole('alert')).toHaveCount(sample.screen === 'join-link-member' ? 0 : 1)
  await expect(page.getByRole('button', { name: /Join household/ })).toHaveCount(0)
  await footerAction(page, 'Go to Home')
  await noOverflow(page)
})

test('invite link: long names retain link wording and both footer actions', async ({ page }) => {
  await open(page, 'join-link-long', 'error')
  await expect(page.getByRole('heading', { name: 'You’re invited', exact: true })).toBeFocused()
  await readable(page.getByText('AlexandriaAndMontgomeryFamilyHouseholdWithAnUnusuallyLongName', { exact: true }))
  await readable(page.getByText(/^Invited by Alexandria-Montgomery-WithAnUnusuallyLongFamilyName · expires /))
  await readable(page.getByText('We couldn’t join this household. Try again.', { exact: true }))
  await footerAction(page, 'Join household: AlexandriaAndMontgomeryFamilyHouseholdWithAnUnusuallyLongName')
  await footerAction(page, 'Not now')
})

test('recipient confirmation: long names and unchanged household action', async ({ page }) => {
  await open(page, 'join-long', 'error')
  await readable(page.getByText('AlexandriaAndMontgomeryFamilyHouseholdWithAnUnusuallyLongName', { exact: true }))
  await readable(page.getByText(/^Invited by Alexandria-Montgomery-WithAnUnusuallyLongFamilyName · expires /))
  await readable(page.getByText('We couldn’t join this household. Try again.', { exact: true }))
  await footerAction(page, 'Join household: AlexandriaAndMontgomeryFamilyHouseholdWithAnUnusuallyLongName')
})

test('household choice: short viewport retains focused create/join actions without sign-out', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 400 })
  await open(page, 'household-choice')
  await expect(page.getByRole('heading', { name: 'Your household', exact: true })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0)
  for (const name of [/Create a household/, /Join a household/]) {
    const action = page.getByRole('button', { name })
    await action.focus()
    await expect(action).toBeFocused()
    await readable(action)
  }
})

test('household creation confirms success on setup with one footer action', async ({ page }) => {
  await open(page, 'household-created')
  await expect(page.getByRole('heading', { name: 'Set up', exact: true })).toBeFocused()
  await expect(page.getByRole('status')).toHaveText('Household created')
  await expect(page.getByRole('button', { name: /Finish later|Sign out|Skip for now/ })).toHaveCount(0)
  await footerAction(page, 'Continue')
})

for (const screen of ['household-joined', 'laundry-completed']) {
  for (const reduced of [false, true]) test(`${screen}: static completion on open and reload (${reduced ? 'reduced' : 'full'} motion)`, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
    await page.setViewportSize({ width: 390, height: 400 })
    await open(page, screen, undefined, 1)
    const check = page.locator('[data-completion-mark]')
    await expect(check).toBeVisible()
    await expect(check).toHaveCSS('animation-name', 'none')
    await expect(page.locator('[data-burst]')).toHaveCount(0)
    if (screen === 'household-joined') {
      await expect(page.getByRole('heading', { name: 'You’re in', exact: true })).toBeFocused()
      await expect(page.getByRole('status')).toHaveText('Welcome to Our apartment')
      await footerAction(page, 'Continue')
    } else {
      await expect(page.getByRole('heading', { name: 'Load complete', exact: true })).toBeVisible()
      await expect(page.getByText('2 pieces washed, dried and put away', { exact: false })).toBeVisible()
      await footerAction(page, 'Back to Me')
    }
    await page.reload()
    // A reload renders inert server markup first; wait for the same readiness as opening, so the
    // completion screen's own focus on mount has happened before the footer is focused.
    await page.waitForLoadState('networkidle')
    await page.locator('link[data-tanstack-router-dev-styles]').waitFor({ state: 'detached' })
    await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '')
    if (screen === 'household-joined') await expect(page.getByRole('heading', { name: 'You’re in', exact: true })).toBeFocused()
    await expect(check).toHaveCSS('animation-name', 'none')
    if (!reduced) for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme })
      for (const [width, height, scale] of [[393, 852, 1], [320, 640, 2], [1120, 720, 1]]) {
        await page.setViewportSize({ width: width!, height: height! })
        await page.evaluate((size) => { document.documentElement.style.fontSize = `${size}px` }, scale! * 16)
        await noOverflow(page)
        await expect(check).toHaveCSS('animation-name', 'none')
        await footerAction(page, screen === 'household-joined' ? 'Continue' : 'Back to Me')
        const name = `${screen}-${theme}-${width}-${scale}`
        await info.attach(name, { body: await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true }), contentType: 'image/png' })
      }
    }
  })
}

test('garment details: narrow large-text and wide layouts keep the fields accessible', async ({ page }) => {
  for (const [width, scale] of [[320, 2], [393, 1], [1024, 1]]) {
    await page.setViewportSize({ width: width!, height: 852 })
    await open(page, 'closet-add-details', undefined, scale!)
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('heading', { name: 'Item details', exact: true })).toBeVisible()
    await sheet.getByLabel('Quantity', { exact: true }).fill('10')
    await sheet.getByLabel('Brand', { exact: true }).fill('Rangoon')
    await sheet.getByLabel('Size', { exact: true }).fill('M')
    const tags = sheet.getByRole('textbox', { name: 'Tags', exact: true })
    await tags.fill('Trip to Kyoto')
    await readable(sheet.getByRole('button', { name: 'Add tag', exact: true }))
    await sheet.getByRole('button', { name: 'Add tag', exact: true }).click()
    await readable(sheet.getByRole('button', { name: 'Trip to Kyoto', exact: true }))
    await noOverflow(page)
    await sheet.locator('.sheet-scroll').evaluate((scroll) => { scroll.scrollTop = 0 })
    await page.screenshot({ path: test.info().outputPath(`details-${width}-${scale}.png`) })
  }
})

test('tags: expanded suggestions, long tag, rejected save and guarded draft', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, 'closet-tags-long')
  const sheet = page.getByRole('dialog', { name: 'Tags', exact: true })
  await expect(sheet).toHaveCSS('transition-duration', '0s')
  await sheet.getByText('More tags', { exact: true }).click()
  await expect(sheet.getByRole('group', { name: 'Suggested tags', exact: true })).toBeVisible()
  const longTag = sheet.getByRole('button', { name: 'AlexandriaMontgomeryFamilyShirts', exact: true })
  await scrollingText(longTag)
  await longTag.click()
  await expect(longTag).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('textbox', { name: 'Tags', exact: true }).fill('Unsaved draft')
  await sheet.getByRole('button', { name: 'Save tags', exact: true }).click()
  await scrollingText(sheet.getByText('Something went wrong. Try again in a moment.', { exact: true }))
  await footerAction(page, 'Save tags')
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('alertdialog', { name: 'Discard your changes?', exact: true }).getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused()
  await page.getByRole('alertdialog', { name: 'Discard your changes?', exact: true }).getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(sheet.getByRole('textbox', { name: 'Tags', exact: true })).toHaveValue('Unsaved draft')
  await sheet.getByRole('textbox', { name: 'Tags', exact: true }).fill('')
  await expect(longTag).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByText('More tags', { exact: true })).toBeVisible()
  await noOverflow(page)
})

test('tags: local pending save disables editing and preserves selected tags', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 })
  await open(page, 'closet-tags-pending', undefined, 1)
  const sheet = page.getByRole('dialog', { name: 'Tags', exact: true })
  const work = sheet.getByRole('button', { name: 'Work', exact: true })
  await work.click()
  await sheet.getByRole('button', { name: 'Save tags', exact: true }).click()
  await footerAction(page, 'Saving…', true)
  await expect(work).toBeDisabled()
  await expect(work).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByRole('textbox', { name: 'Tags', exact: true })).toBeDisabled()
})

test('people: owner links an unclaimed profile from its drawer', async ({ page }) => {
  await open(page, 'household-people')
  await readable(page.getByRole('button', { name: /^Invite someone/ }))
  await expect(page.getByRole('button', { name: 'Link account', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Whose clothes', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Open Mia. Child', exact: true }).click()
  await page.getByRole('button', { name: 'Edit clothing profile', exact: true }).click()
  if (await page.getByRole('dialog').getByRole('tab', { name: 'Access', exact: true }).count()) await page.getByRole('dialog').getByRole('tab', { name: 'Access', exact: true }).click()
  await readable(page.getByRole('dialog').getByRole('button', { name: 'Link account', exact: true }))
})

test('people: member role omits owner invite/remove actions', async ({ page }) => {
  await open(page, 'household-people-member')
  await expect(page.getByRole('heading', { name: 'Household members', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Invite |^Remove$/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Leave', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Open Sam. Clothing preferences', exact: true }).click()
  await page.getByRole('button', { name: 'Edit clothing profile', exact: true }).click()
  if (await page.getByRole('dialog').getByRole('tab', { name: 'Access', exact: true }).count()) await page.getByRole('dialog').getByRole('tab', { name: 'Access', exact: true }).click()
  await readable(page.getByRole('dialog').getByRole('button', { name: 'Leave household', exact: true }))
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await readable(page.getByRole('button', { name: /^Add clothing profile/ }))
})

test('people: long member and account-free clothing-profile names wrap', async ({ page }) => {
  await open(page, 'household-people-long')
  await readable(page.getByText('Sam Rivera Alexandria-Montgomery-WithAnUnusuallyLongFamilyName', { exact: true }))
  await readable(page.getByText('Mia Alexandria-Montgomery-WithAnUnusuallyLongFamilyName', { exact: true }))
  await noOverflow(page)
})

for (const state of ['error', 'busy']) test(`inviter sheet: long household and ${state}`, async ({ page }) => {
  await open(page, 'invite-sheet-long', state)
  const sheet = page.getByRole('dialog', { name: 'Invite someone', exact: true })
  await readable(sheet.getByText('AlexandriaAndMontgomeryFamilyHouseholdWithAnUnusuallyLongName', { exact: true }))
  if (state === 'error') await readable(sheet.getByText('We couldn’t make a new invite link. Try again.', { exact: true }))
  for (const name of ['Copy link', 'Replace link']) {
    const action = sheet.getByRole('button', { name, exact: true })
    if (state === 'busy') await expect(action).toBeDisabled()
    await readable(action)
  }
  await footerAction(page, 'Share invite link', state === 'busy')
})

test('outfit picker: quantity caps, filtered empty view, reject and guarded draft', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, 'outfit-picker', 'error')
  const sheet = page.getByRole('dialog', { name: 'Outfit', exact: true })
  await expect(sheet).toHaveCSS('transition-duration', '0s')
  await sheet.getByRole('button', { name: 'Choose White cotton tee, White', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Fewer White cotton tee, White', exact: true })).toBeDisabled()
  await sheet.getByRole('button', { name: 'More White cotton tee, White', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'More White cotton tee, White', exact: true })).toBeDisabled()
  await readable(sheet.getByText('2 of 2', { exact: true }))
  const longName = 'AlexandriaMontgomeryFamilySpecialOccasionShirt'
  const longChoice = sheet.getByRole('button', { name: `Choose ${longName}, Navy`, exact: true })
  await scrollingText(longChoice)
  await longChoice.click()
  const more = sheet.getByRole('button', { name: `More ${longName}, Navy`, exact: true })
  for (let count = 1; count < 20; count++) await more.click()
  await expect(more).toBeDisabled()
  await expect(sheet.getByText('20 of 25', { exact: true })).toBeVisible()
  await readable(sheet.getByText('20 of 25', { exact: true }))
  await sheet.getByRole('button', { name: 'Work', exact: true }).click()
  await readable(sheet.getByText('No ready clothes tagged “Work”.', { exact: true }))
  await sheet.getByRole('button', { name: 'All tags', exact: true }).click()
  await expect(sheet.getByText('2 of 2', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Save outfit', exact: true }).click()
  await scrollingText(sheet.getByText('This visual preview does not save changes.', { exact: true }))
  await footerAction(page, 'Save outfit')
  await page.setViewportSize({ width: 1120, height: 720 })
  await expect(sheet.getByText('20 of 25', { exact: true })).toBeVisible()
  await expect(page.locator('.sheet-foot').getByRole('button', { name: 'Save outfit', exact: true })).toBeFocused()
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('alertdialog', { name: 'Discard your changes?', exact: true }).getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused()
  await page.getByRole('alertdialog', { name: 'Discard your changes?', exact: true }).getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(sheet.getByText('20 of 25', { exact: true })).toBeVisible()
  await noOverflow(page)
})

test('outfit picker: local pending callback disables selection, tags and save', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 })
  await open(page, 'outfit-picker', 'busy', 1)
  const sheet = page.getByRole('dialog', { name: 'Outfit', exact: true })
  const choice = sheet.getByRole('button', { name: 'Choose White cotton tee, White', exact: true })
  await choice.click()
  await sheet.getByRole('button', { name: 'Save outfit', exact: true }).click()
  await expect(choice).toBeDisabled()
  await expect(choice).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByRole('button', { name: 'All tags', exact: true })).toBeDisabled()
  await footerAction(page, 'Saving…', true)
})

test('outfit picker: no ready clothes leaves save disabled', async ({ page }) => {
  await open(page, 'outfit-picker-empty')
  const sheet = page.getByRole('dialog', { name: 'Outfit', exact: true })
  await readable(sheet.getByText('No ready clothes.', { exact: true }))
  await expect(sheet.getByRole('group', { name: 'Outfit tags', exact: true })).toHaveCount(0)
  await footerAction(page, 'Save outfit', true)
})

test('outfit picker: stale selection warning keeps save disabled', async ({ page }) => {
  await open(page, 'outfit-picker-stale')
  const sheet = page.getByRole('dialog', { name: 'Outfit', exact: true })
  await sheet.getByRole('button', { name: 'Choose White cotton tee, White', exact: true }).click()
  await readable(sheet.getByText('Some clothes are no longer ready. Close and choose again.', { exact: true }))
  await footerAction(page, 'Save outfit', true)
})

test('completed-wash Closet keeps the list visible without a persistent celebration card', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, 'closet-first-wash')
  await expect(page.getByRole('region', { name: 'Milestones', exact: true })).toHaveCount(0)
  await expect(page.getByText('First wash complete', { exact: true })).toHaveCount(0)
  await readable(page.getByRole('button', { name: /White cotton tee,/ }))
  await page.reload()
  await expect(page.getByText('First wash complete', { exact: true })).toHaveCount(0)
  await noOverflow(page)
})

async function addIngredient(sheet: Locator, ingredient: string) {
  await sheet.getByRole('tab', { name: 'Products', exact: true }).click()
  const input = sheet.getByRole('textbox', { name: 'Ingredients to avoid', exact: true })
  await input.fill(ingredient)
  await input.press('Enter')
  await expect(input).toHaveValue('')
}

test('clothing profile: native name guards and normal editing retain requirements', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 390, height: 640 })
  await open(page, 'profile-form', undefined, 1)
  const sheet = page.getByRole('dialog', { name: 'Mia', exact: true })
  const name = sheet.getByLabel('Name', { exact: true })
  const save = sheet.getByRole('button', { name: 'Save person', exact: true })
  await expect(save).toBeDisabled()
  await expect(name).toHaveAttribute('required', '')
  await expect(name).toHaveAttribute('maxlength', '60')
  await name.fill('   ')
  await expect(save).toBeDisabled()
  await name.fill('Mia Lee')
  const adult = sheet.getByRole('button', { name: 'Adult', exact: true })
  await adult.focus()
  await adult.press('Space')
  await expect(adult).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('tab', { name: 'Products', exact: true }).click()
  await sheet.getByRole('checkbox', { name: 'Fragrance-free only', exact: true }).uncheck()
  await expect(sheet.getByRole('checkbox', { name: 'Dye-free only', exact: true })).toBeChecked()
  await addIngredient(sheet, 'lanolin')
  await sheet.getByRole('checkbox', { name: 'Other product', exact: true }).check()
  await expect(sheet.getByRole('checkbox', { name: 'Known product', exact: true })).toBeChecked()
  await expect(sheet.getByRole('checkbox', { name: 'Other product', exact: true })).toBeChecked()
  await footerAction(page, 'Save person')
  await noOverflow(page)
})

test('clothing profile: pending save freezes every edit and retains submitted values', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 })
  await open(page, 'profile-form', 'busy', 1)
  const sheet = page.getByRole('dialog', { name: 'Mia', exact: true })
  await sheet.getByRole('tab', { name: 'Person', exact: true }).click()
  await sheet.getByLabel('Name', { exact: true }).fill('Mia Lee')
  await sheet.getByRole('button', { name: 'Baby', exact: true }).click()
  await sheet.getByRole('tab', { name: 'Products', exact: true }).click()
  await sheet.getByRole('checkbox', { name: 'Dye-free only', exact: true }).uncheck()
  await addIngredient(sheet, 'lanolin')
  await sheet.getByRole('checkbox', { name: 'Other product', exact: true }).check()
  await sheet.getByRole('button', { name: 'Save person', exact: true }).click()
  await expect(sheet.getByRole('textbox', { name: 'Ingredients to avoid', exact: true })).toBeDisabled()
  await expect(sheet.getByRole('tab', { name: 'Person', exact: true })).toBeDisabled()
  await expect(sheet.getByRole('tab', { name: 'Person', exact: true })).toHaveAttribute('aria-selected', 'false')
  await expect(sheet.getByLabel('Name', { exact: true })).toBeDisabled()
  for (const kind of ['Adult', 'Child', 'Baby']) await expect(sheet.getByRole('button', { name: kind, exact: true, includeHidden: true })).toBeDisabled()
  for (const [label, checked] of [['Fragrance-free only', true], ['Dye-free only', false], ['Known product', true], ['Other product', true]] as const) {
    const checkbox = sheet.getByRole('checkbox', { name: label, exact: true })
    await expect(checkbox).toBeDisabled()
    await expect(checkbox).toHaveAttribute('tabindex', '-1')
    // The label remains readable; tapping its text must not alter the frozen choice.
    await sheet.getByText(label, { exact: true }).click({ force: true })
    await expect(checkbox).toHaveAttribute('aria-checked', String(checked))
  }
  expect(await sheet.locator('form input, form button').evaluateAll((controls) => controls.every((control) => control.matches(':disabled')))).toBe(true)
  await expect(sheet.getByLabel('Name', { exact: true })).toHaveValue('Mia Lee')
  await expect(sheet.getByRole('button', { name: 'lanolin', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByRole('button', { name: 'Optical brighteners', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByRole('button', { name: 'Baby', exact: true, includeHidden: true })).toHaveAttribute('aria-pressed', 'true')
  await footerAction(page, 'Save person', true)
  await footerAction(page, 'Cancel', true)
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(sheet.getByRole('status')).toHaveText('Saving changes…')
  await expect(sheet.getByRole('button', { name: 'Discard', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('status')).toHaveText('Saving changes…')
  await expect(sheet.getByLabel('Name', { exact: true })).toHaveValue('Mia Lee')
  await expect(sheet.getByRole('button', { name: 'lanolin', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('clothing profile: locally rejected save keeps the draft and dismissal guards', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 640 })
  await open(page, 'profile-form', 'error', 1)
  const sheet = page.getByRole('dialog', { name: 'Mia', exact: true })
  await sheet.getByRole('tab', { name: 'Person', exact: true }).click()
  await sheet.getByLabel('Name', { exact: true }).fill('Mia Lee')
  await addIngredient(sheet, 'lanolin')
  await sheet.getByRole('checkbox', { name: 'Other product', exact: true }).check()
  await sheet.getByRole('button', { name: 'Save person', exact: true }).click()
  await readable(sheet.getByText('This visual preview does not save changes.', { exact: true }))
  await expect(sheet.getByLabel('Name', { exact: true })).toBeEnabled()
  await footerAction(page, 'Save person')
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('alertdialog', { name: 'Discard your changes?', exact: true }).getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused()
  await page.getByRole('alertdialog', { name: 'Discard your changes?', exact: true }).getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(sheet.getByLabel('Name', { exact: true })).toHaveValue('Mia Lee')
  await expect(sheet.getByRole('button', { name: 'lanolin', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByRole('checkbox', { name: 'Other product', exact: true })).toBeChecked()
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('alertdialog', { name: 'Discard your changes?', exact: true }).getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(sheet).toHaveCount(0)
})

test('clothing profile: enlarged narrow long requirements retain reachable fields and footer', async ({ page }) => {
  await open(page, 'profile-form-long')
  const sheet = page.getByRole('dialog', { name: 'Mia', exact: true })
  await sheet.getByRole('tab', { name: 'Products', exact: true }).click()
  await readable(sheet.getByRole('heading', { name: 'Product requirements', exact: true }))
  const avoid = sheet.getByRole('textbox', { name: 'Ingredients to avoid', exact: true })
  await avoid.scrollIntoViewIfNeeded()
  for (const ingredient of ['Optical brighteners', 'lanolin', 'sodium carbonate', 'benzisothiazolinone']) await scrollingText(sheet.getByRole('button', { name: ingredient, exact: true }))
  await expect(avoid).toHaveAttribute('maxlength', '80')
  await addIngredient(sheet, 'limonene')
  await scrollingText(sheet.getByText('AlexandriaMontgomeryFamilyFragranceFreeLiquidDetergent', { exact: true }))
  await expect(sheet.getByRole('checkbox', { name: 'AlexandriaMontgomeryFamilyFragranceFreeLiquidDetergent', exact: true })).toBeChecked()
  await footerAction(page, 'Cancel')
  await footerAction(page, 'Save person')
  await noOverflow(page)
})

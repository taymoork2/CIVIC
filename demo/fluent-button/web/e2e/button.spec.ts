// Web evidence for the Fluent Button demo. Each test names the CIVIC records it proves in a
// `civic.subject` annotation; the Playwright report importer turns each result into an
// automated evidence record for those IDs, tied to the run's revision.
import { expect, test, type Page } from '@playwright/test'
import { cssColor, mapped, restBackground, tokens, web } from './fluent.ts'

const harness = new URL('../index.html', import.meta.url).href

const subjects = (...ids: string[]) => ids.map((description) => ({ type: 'civic.subject', description }))

test.beforeEach(async ({ page }) => {
  await page.goto(harness)
})

for (const { variant, appearance } of mapped) {
  test(`${variant} renders as a button with an accessible name`, { annotation: subjects('semantic:button', web.id, 'intent:button.accessible-name') }, async ({ page }) => {
    const button = page.getByRole('button', { name: variant, exact: true })
    await expect(button).toBeVisible()
    await expect(button).toHaveAttribute('data-civic-variant', variant)
  })

  const token = restBackground[appearance]!
  test(`${variant} rests on ${token}`, { annotation: subjects(web.id, `token:${token}`) }, async ({ page }) => {
    expect(await background(page, `[data-civic-variant="${variant}"]`)).toBe(cssColor(tokens[token]!.$value))
  })
}

test('a button with no appearance renders as the neutral default', { annotation: subjects(web.id) }, async ({ page }) => {
  const neutral = await background(page, '[data-civic-variant="neutral-default"]')
  expect(await background(page, '[data-civic-state="default-appearance"]')).toBe(neutral)
})

test('a disabled button cannot take focus', { annotation: subjects('semantic:button', web.id) }, async ({ page }) => {
  const button = page.locator('[data-civic-state="disabled"]')
  await expect(button).toBeDisabled()
  await button.focus()
  await expect(button).not.toBeFocused()
})

test('a disabledFocusable button takes focus and reports itself disabled', { annotation: subjects(`extension:${web.id.slice('platform:'.length)}.disabledFocusable`) }, async ({ page }) => {
  const button = page.locator('[data-civic-state="disabled-focusable"]')
  await button.focus()
  await expect(button).toBeFocused()
  await expect(button).toHaveAttribute('aria-disabled', 'true')
})

function background(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => getComputedStyle(element).backgroundColor)
}

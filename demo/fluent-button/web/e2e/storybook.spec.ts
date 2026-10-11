// Web evidence from Fluent's own Button stories, the ones Fluent publishes in its Storybook,
// vendored at the release the demo pins (../../sources/react-button-stories). Each test
// opens a story in the built Storybook and names the CIVIC records it proves; `civic.method`
// tells the Playwright report importer the evidence came from a Storybook story.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { cssColor, mapped, restBackground, tokens, web } from './fluent.ts'

const index = JSON.parse(readFileSync(new URL('../storybook-static/index.json', import.meta.url), 'utf8')) as { entries: Record<string, { id: string; name: string; importPath: string; type: string }> }
/** How Fluent's Appearance story labels each appearance; the one with no `appearance` prop is "Default". */
const storyLabel: Record<string, string> = { secondary: 'Default', primary: 'Primary', outline: 'Outline', subtle: 'Subtle', transparent: 'Transparent' }

/** The story with this name, from the built Storybook's index. */
function story(name: string) {
  const entry = Object.values(index.entries).find((candidate) => candidate.type === 'story' && candidate.name === name && candidate.id.startsWith('components-button-button--'))
  if (!entry) throw new Error(`Fluent's Button stories have no "${name}" story.`)
  return entry
}

const annotations = (name: string, ...ids: string[]) => {
  const entry = story(name)
  return [
    ...ids.map((description) => ({ type: 'civic.subject', description })),
    { type: 'civic.method', description: 'storybook' },
    { type: 'civic.source', description: `${entry.importPath.replace(/^.*\/sources\//, 'demo/fluent-button/sources/')}#${entry.id}` },
  ]
}

async function open(page: Page, name: string) {
  await page.goto(`/iframe.html?id=${story(name).id}&viewMode=story`)
  await expect(page.locator('#storybook-root button').first()).toBeVisible()
}

for (const { variant, appearance } of mapped) {
  const label = storyLabel[appearance]!
  test(`Fluent's Appearance story shows ${appearance} for ${variant}, with an accessible name`, { annotation: annotations('Appearance', 'semantic:button', web.id, 'intent:button.accessible-name') }, async ({ page }) => {
    await open(page, 'Appearance')
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
  })

  const token = restBackground[appearance]!
  test(`Fluent's Appearance story rests ${appearance} on ${token}`, { annotation: annotations('Appearance', web.id, `token:${token}`) }, async ({ page }) => {
    await open(page, 'Appearance')
    expect(await background(page.getByRole('button', { name: label, exact: true }))).toBe(cssColor(tokens[token]!.$value))
  })
}

test("Fluent's Default story renders the neutral default", { annotation: annotations('Default', web.id, 'token:colorNeutralBackground1') }, async ({ page }) => {
  await open(page, 'Default')
  expect(await background(page.getByRole('button', { name: 'Example', exact: true }))).toBe(cssColor(tokens.colorNeutralBackground1!.$value))
})

test("Fluent's Disabled story: disabled buttons cannot take focus", { annotation: annotations('Disabled', 'semantic:button', web.id) }, async ({ page }) => {
  await open(page, 'Disabled')
  const buttons = page.getByRole('button', { name: 'Disabled state', exact: true })
  await expect(buttons).toHaveCount(2)
  for (const button of await buttons.all()) {
    await expect(button).toBeDisabled()
    await button.focus()
    await expect(button).not.toBeFocused()
  }
})

test("Fluent's Disabled story: disabledFocusable buttons take focus and report themselves disabled", { annotation: annotations('Disabled', `extension:${web.id.slice('platform:'.length)}.disabledFocusable`) }, async ({ page }) => {
  await open(page, 'Disabled')
  const buttons = page.getByRole('button', { name: 'Disabled focusable state', exact: true })
  await expect(buttons).toHaveCount(2)
  for (const button of await buttons.all()) {
    await button.focus()
    await expect(button).toBeFocused()
    await expect(button).toHaveAttribute('aria-disabled', 'true')
  }
})

function background(locator: ReturnType<Page['locator']>) {
  return locator.evaluate((element) => getComputedStyle(element).backgroundColor)
}

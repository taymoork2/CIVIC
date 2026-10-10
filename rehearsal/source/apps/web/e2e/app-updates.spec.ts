import { expect, test } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHousehold, signUp } from './flows'

test.beforeEach(() => {
  test.skip(process.env.WASHCLOSET_E2E_BUILD !== 'production' || !process.env.WASHCLOSET_E2E_VERSION_FILE, 'Release simulation requires the isolated production build')
})

async function versionFile() {
  const path = resolve(process.env.WASHCLOSET_E2E_VERSION_FILE!)
  expect(path, 'Never change a deployed runtime or another checkout').toBe(resolve(import.meta.dirname, '../dist/client/app-version.json'))
  const original = await readFile(path)
  return { original, write: (build: string) => writeFile(path, JSON.stringify({ build })), restore: () => writeFile(path, original) }
}

test('a release refreshes a clear screen while another tab keeps its garment draft and worker', async ({ context, page }) => {
  const version = await versionFile()
  try {
    await signUp(page, 'updates', 'Update Test')
    await createHousehold(page)
    const { build } = await (await page.request.get('/app-version.json')).json() as { build: string }
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    await page.goto('/laundry')
    const editor = await context.newPage()
    await editor.goto('/closet')
    await editor.getByRole('button', { name: 'Add clothes', exact: true }).click()
    const sheet = editor.getByRole('dialog')
    await sheet.getByRole('button', { name: 'T-shirt', exact: true }).click()
    await sheet.getByRole('button', { name: 'Next: details', exact: true }).click()
    await sheet.getByLabel('Name', { exact: true }).fill('Unfinished update draft')
    const oldWorker = await editor.evaluate(() => navigator.serviceWorker.controller!.scriptURL)
    const next = `${build}-test-${Date.now()}`
    let navigations = 0
    let restored = Promise.resolve()
    page.on('request', (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) { navigations += 1; restored = version.restore() } })
    // WebKit routes SW-controlled requests outside Playwright interception, so change this isolated asset.
    await version.write(next)
    // Reopen checks discover a changed script URL with a real successful SW installation.
    await editor.evaluate(() => window.dispatchEvent(new Event('pageshow')))
    await expect.poll(() => editor.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.scriptURL)).toContain(encodeURIComponent(next))
    await expect(editor.getByText('An update is ready.', { exact: false })).toBeVisible()
    await editor.waitForTimeout(4000)
    await expect(sheet.getByLabel('Name', { exact: true })).toHaveValue('Unfinished update draft')
    await page.bringToFront()
    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Home', exact: true }).click()
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')))
    await expect.poll(() => navigations).toBe(1)
    await restored
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
    await expect(sheet.getByLabel('Name', { exact: true })).toHaveValue('Unfinished update draft')
    expect(await editor.evaluate(() => navigator.serviceWorker.controller!.scriptURL)).toBe(oldWorker)
    await page.waitForTimeout(4000)
    expect(navigations).toBe(1)
    await editor.close()
  } finally { await version.restore() }
})

test('a release discovered on reopen leaves account entry intact until the form is left', async ({ page }) => {
  const version = await versionFile()
  try {
    await page.goto('/sign-in')
    const { build } = await (await page.request.get('/app-version.json')).json() as { build: string }
    await page.getByLabel('Email', { exact: true }).fill('unfinished@example.invalid')
    await version.write(`${build}-form-test`)
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')))
    await expect(page.getByText('An update is ready.', { exact: false })).toBeVisible()
    await page.getByLabel('Email', { exact: true }).blur()
    await page.waitForTimeout(4000)
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue('unfinished@example.invalid')
    await expect(page).toHaveURL(/\/sign-in$/)
  } finally { await version.restore() }
})

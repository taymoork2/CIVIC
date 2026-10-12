import { expect, test } from '@playwright/test'
import { createHousehold, signUp } from './flows'

test('the status-area boundary is opaque and leaves the wordmark clear in both themes', async ({ page }, info) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await signUp(page, 'header', 'Header Test')
  await createHousehold(page)
  await expect(page.locator('.wordmark')).toBeVisible()
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
    const surface = await page.locator('[data-slot="status-area"]').evaluate(e => ({
      position: getComputedStyle(e).position, events: getComputedStyle(e).pointerEvents,
      color: getComputedStyle(e).backgroundColor, height: e.getBoundingClientRect().height,
    }))
    expect(surface.position).toBe('fixed')
    expect(surface.events).toBe('none')
    expect(surface.color).not.toBe('rgba(0, 0, 0, 0)')
    const wordmark = await page.locator('.wordmark').evaluate(e => ({
      filter: getComputedStyle(e).filter, backdrop: getComputedStyle(e).backdropFilter, top: e.getBoundingClientRect().top,
    }))
    expect(wordmark.filter).toBe('none')
    expect(wordmark.backdrop).toBe('none')
    expect(wordmark.top).toBeGreaterThanOrEqual(surface.height)
    await page.screenshot({ path: info.outputPath(`header-${theme}.png`) })
  }
  // Browser emulation cannot establish the native iPhone scroll-edge effect.
})

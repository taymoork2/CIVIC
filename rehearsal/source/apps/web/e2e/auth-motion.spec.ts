import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 393, height: 852 }, locale: 'en-US' })

test('auth screens change immediately without snapshots or entrance animation', async ({ page }) => {
  await page.goto('/sign-in')
  await expect(page.getByLabel('Email', { exact: true })).toBeEnabled()
  await page.evaluate(() => {
    const doc = document as Document & { authSnapshots?: number }
    doc.authSnapshots = 0
    if (!doc.startViewTransition) return
    const start = doc.startViewTransition.bind(doc)
    doc.startViewTransition = (...args) => { doc.authSnapshots! += 1; return start(...args) }
  })
  for (const path of ['/create-account', '/sign-in', '/forgot-password', '/sign-in', '/create-account', '/sign-in']) {
    await page.locator(`a[href="${path}"]`).click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    const motion = await page.evaluate(() => {
      const account = document.querySelector('.account-page')!
      const style = getComputedStyle(account)
      return {
        duration: parseFloat(style.animationDuration),
        animation: style.animationName,
        artAnimations: account.querySelector('[data-welcome-art]')!.getAnimations({ subtree: true }).length,
        snapshots: (document as Document & { authSnapshots?: number }).authSnapshots,
      }
    })
    expect(motion.animation).toBe('none')
    expect(motion.duration).toBe(0)
    expect(motion.artAnimations).toBe(0)
    expect(motion.snapshots).toBe(0)
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.locator('a[href="/create-account"]').click()
  await expect(page).toHaveURL(/\/create-account$/)
  await expect(page.locator('.account-page')).toHaveCSS('animation-name', 'none')
})

import { expect, test, type Page } from '@playwright/test'
import { addClothes, addMachines, addProductAndWasher, createHousehold, planAndStart, signUp } from './flows'

test.use({ locale: 'en-US' })

const tees = 'Synthetic drying tees'

/** Preparation through the wash, stopping once the washer is confirmed finished (before the drying queue). */
async function washUntilFinished(page: Page) {
  const step = page.locator('section.machine-step').first()
  const washing = page.getByRole('heading', { level: 1, name: 'Washing', exact: true })
  const move = page.getByRole('button', { name: 'Move to drying queue', exact: true })
  for (let i = 0; i < 24; i += 1) {
    await expect(step.or(washing).or(move).first()).toBeVisible()
    if (await move.isVisible()) return
    if (await washing.isVisible()) {
      await page.getByRole('button', { name: /has finished$/ }).click()
      await expect(move).toBeVisible()
      return
    }
    const title = ((await step.locator('.machine-step-title').textContent()) ?? '').trim()
    const before = await step.textContent()
    const next = page.getByRole('button', { name: 'Done · next step', exact: true })
    if (await next.isVisible()) await next.click()
    else if (title.startsWith('How full')) await step.getByRole('button', { name: 'Half', exact: true }).click()
    else if (title === 'Press Start') {
      await page.getByLabel(/^Minutes shown on /).fill('40')
      await page.getByRole('button', { name: /^I[’']ve started / }).click()
    } else throw new Error(`Unexpected machine step: ${title}`)
    await expect.poll(async () => await washing.isVisible() || await move.isVisible() || await step.textContent().catch(() => before) !== before).toBe(true)
  }
  throw new Error('The wash did not finish')
}

/** The label's after-drying handling, when the pieces have any, must be acknowledged first. */
async function acknowledgeLabel(page: Page) {
  const label = page.getByRole('checkbox', { name: 'I’ve followed these label instructions', exact: true })
  if (await label.count() > 0) await label.check()
}

// Actual /session and /drying routes. Two matching synthetic tees wash together and dry apart.
test('a partial dryness check survives Back, asks before discarding, and the load stays open until all is put away', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signUp(page, 'drying-continuity', 'Synthetic Drying Continuity')
  await createHousehold(page)
  await addProductAndWasher(page)
  await addMachines(page, { kind: 'Dryer', name: 'Laundry room dryer', count: 1, price: '1.50', minutes: '45', heat: { 'Low heat': 'Delicates' } })
  await addClothes(page, { name: tees, count: 2 })
  const sessionUrl = await planAndStart(page, 2)
  await washUntilFinished(page)

  // The finished wash is a record: "Washed", a Finished time, no countdown or progress bar.
  await expect(page.getByRole('heading', { level: 1, name: 'Washed', exact: true })).toBeVisible()
  const timer = page.getByRole('group', { name: 'Wash timer', exact: true })
  await expect(timer.getByRole('timer')).toHaveText('Finished')
  await expect(timer.getByRole('progressbar')).toHaveCount(0)
  await page.getByRole('button', { name: 'Move to drying queue', exact: true }).click()

  // The drying plan shows the matching pieces as one counted row.
  await expect(page).toHaveURL(/\/drying(?:\?|$)/)
  await expect(page.getByRole('heading', { level: 1, name: 'Drying', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(`^${tees}, `) })).toHaveCount(1)
  await expect(page.getByRole('button', { name: new RegExp(`^${tees}, 2 pieces · `) })).toBeVisible()

  await page.getByRole('button', { name: 'Load into a dryer', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Which dryer?', exact: true })).toBeVisible()
  await page.getByLabel(/^Minutes on /).fill('45')
  await acknowledgeLabel(page)
  await page.getByRole('button', { name: /^I[’']ve started / }).click()
  await expect(page.getByRole('heading', { name: 'Drying now', exact: true })).toBeVisible()

  // Is it dry? One of the two is still damp; Back keeps the unsaved answer.
  const run = page.getByRole('button', { name: /^Laundry room dryer / })
  await run.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Is it dry?', exact: true })).toBeVisible()
  await page.getByRole('button', { name: `Fewer dry ${tees}`, exact: true }).click()
  const oneOfTwo = page.getByText('Dry 1 of 2 · from Laundry room washer', { exact: true })
  await expect(oneOfTwo).toBeVisible()
  await page.getByRole('button', { name: 'Drying', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Drying', exact: true })).toBeVisible()
  await expect(run).toContainText('Unsaved check')
  await run.click()
  await expect(oneOfTwo).toBeVisible()

  // Discarding asks first; keeping the check leaves the count as it was.
  await page.getByRole('button', { name: 'Discard check', exact: true }).click()
  const ask = page.getByRole('alert').filter({ hasText: 'Discard your changes?' })
  await expect(ask).toBeVisible()
  await expect(oneOfTwo).toBeVisible()
  await ask.getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(ask).toHaveCount(0)
  await expect(oneOfTwo).toBeVisible()

  // Put away the dry one; the damp one keeps drying. Before the dryer's end no extra minutes are asked (design 9.3).
  await expect(page.getByLabel('Extra minutes on Laundry room dryer', { exact: true })).toHaveCount(0)
  await acknowledgeLabel(page)
  await page.getByRole('button', { name: 'Put away 1 · keep 1 drying', exact: true }).click()
  await page.getByRole('button', { name: 'Put away 1 piece', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Drying', exact: true })).toBeVisible()
  const putAwayNotice = page.locator('[data-sonner-toast]').filter({ hasText: '1 put away.' })
  await expect(putAwayNotice).toBeVisible()
  await expect(putAwayNotice).toBeHidden({ timeout: 10_000 })
  await expect(page.getByText('1 put away.', { exact: true })).toHaveCount(0)
  await expect(run).not.toContainText('Unsaved check')

  // The wash load is not complete while a piece is still drying.
  await page.goto(sessionUrl)
  await expect(page.getByRole('region', { name: 'This load', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(/, done\.$|^Load complete$/)
  await expect(page.getByRole('heading', { name: /, done\.$|^Load complete$/ })).toHaveCount(0)

  // The second piece is put away separately; only then is the load complete.
  await page.goto('/drying')
  await run.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Is it dry?', exact: true })).toBeVisible()
  await acknowledgeLabel(page)
  await page.getByRole('button', { name: 'Put away 1 dry piece', exact: true }).click()
  await page.getByRole('button', { name: 'Put away 1 piece', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Drying', exact: true })).toBeVisible()
  await page.goto(sessionUrl)
  await expect(page.getByRole('heading', { level: 1, name: /, done\.$|^Load complete$/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'This load', exact: true })).toBeVisible()
})

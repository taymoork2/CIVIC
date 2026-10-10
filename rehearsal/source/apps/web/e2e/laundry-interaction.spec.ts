import { expect, test } from '@playwright/test'
import type { Id } from '@convex/_generated/dataModel'
import { api } from '../src/api'
import { addClothes, addProductAndWasher, convexAs, createHousehold, planAndStart, signUp } from './flows'

// Root runs this against its isolated current-code deployment. All records are synthetic.
test('an accepted preparation step leads to the next task, then recorded Start leads to its timer', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signUp(page, 'laundry-feedback', 'Synthetic Laundry Feedback')
  await createHousehold(page)
  await addProductAndWasher(page)
  await addClothes(page, { name: 'Synthetic feedback tee' })
  const url = await planAndStart(page, 1)
  const { client } = await convexAs(page)
  const sessionId = new URL(url).pathname.split('/').at(-1)! as Id<'sessions'>
  const current = page.locator('section.machine-step')
  const feedback = page.locator('.laundry-accepted-feedback')
  await expect(feedback).toHaveCount(0)
  let checkedTaskHandoff = false
  for (let index = 0; index < 12; index++) {
    const detail = await client.query(api.execution.sessionDetail, { sessionId })
    const action = [...detail.actions].sort((a, b) => a.order - b.order).find((entry) => entry.status === 'pending')!
    if (action.kind === 'task' && action.task === 'start') break
    if (action.kind === 'task' && action.task === 'drum_fullness') {
      await current.getByRole('button', { name: 'Half', exact: true }).click()
    } else {
      const done = page.getByRole('button', { name: 'Done · next step', exact: true })
      await done.focus()
      await done.press('Enter')
    }
    await expect.poll(async () => (await client.query(api.execution.sessionDetail, { sessionId })).actions.find((entry) => entry.id === action.id)?.status).toBe('confirmed')
    await expect(feedback).toContainText('Recorded:')
    await expect(feedback).toContainText('Next:')
    await expect(current.getByRole('heading', { level: 2 })).toBeFocused()
    checkedTaskHandoff = true
  }
  expect(checkedTaskHandoff).toBe(true)
  const minutes = page.getByLabel(/^Minutes shown on /)
  await expect(minutes).toHaveValue('')
  await current.focus()
  await current.press('ArrowLeft')
  await expect(current).toContainText('Done')
  await current.press('ArrowRight')
  await expect(minutes).toHaveValue('')
  // The same task and focus behavior remain available with OS reduced motion.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await minutes.fill('40')
  const start = page.getByRole('button', { name: /^I’ve started / })
  await start.focus()
  await start.press('Enter')
  await expect(feedback).toContainText('Timer: 40 min left.')
  await expect(page.getByLabel('Wash timer', { exact: true })).toBeFocused()
  await expect(page.getByRole('timer')).toContainText('40')
  await expect(page.getByText('From the 40 min you entered', { exact: true })).toBeVisible()
  const accepted = await client.query(api.execution.sessionDetail, { sessionId })
  expect(accepted.machineStartedAt).not.toBeNull()
  expect(accepted.cycleMinutes).toBe(40)
  expect(accepted.status).toBe('running')
  await page.screenshot({ path: testInfo.outputPath('accepted-start-timer-phone.png'), fullPage: true })
  await page.getByRole('button', { name: 'Add time', exact: true }).click()
  const add = page.getByRole('dialog', { name: 'Add time', exact: true })
  await add.getByLabel('Minutes to add', { exact: true }).fill('5')
  await add.getByRole('button', { name: 'Update timer', exact: true }).click()
  await expect(add).toHaveCount(0)
  await expect(page.getByRole('timer')).toContainText('45')
  await page.reload()
  await expect(feedback).toHaveCount(0)
  await expect(page.getByRole('timer')).toContainText('45')
  await expect(page.getByText('From the 45 min you entered', { exact: true })).toBeVisible()
})

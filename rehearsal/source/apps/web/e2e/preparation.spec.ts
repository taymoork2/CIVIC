import { expect, test } from '@playwright/test'
import type { Id } from '@convex/_generated/dataModel'
import { api } from '../src/api'
import { addClothes, addProductAndWasher, convexAs, createHousehold, planAndStart, signUp } from './flows'

test.use({ locale: 'en-US' })

// The actual /session route at Preparation. All records are synthetic.
test('a preparation step keeps one primary action apart from its options and recovery, and cancels record nothing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signUp(page, 'prep-hierarchy', 'Synthetic Preparation')
  await createHousehold(page)
  await addProductAndWasher(page)
  await addClothes(page, { name: 'Synthetic preparation tee' })
  const url = await planAndStart(page, 1)
  const { client } = await convexAs(page)
  const sessionId = new URL(url).pathname.split('/').at(-1)! as Id<'sessions'>
  const detail = () => client.query(api.execution.sessionDetail, { sessionId })
  const pending = async () => [...(await detail()).actions].sort((a, b) => a.order - b.order).find((entry) => entry.status === 'pending')!
  const current = page.locator('section.machine-step')
  const footer = page.locator('[data-slot="task-footer"]')
  const title = current.getByRole('heading', { level: 2 })
  // Every departure and recovery is one row of the "Something different?" sheet (outside the step card).
  const different = current.getByRole('button', { name: 'Something different?', exact: true })
  const choices = page.getByRole('dialog', { name: 'Something different?' })
  const problem = choices.getByRole('button', { name: 'Machine problem?', exact: true })
  const done = page.getByRole('button', { name: 'Done · next step', exact: true })

  let checkedProblemCancel = false
  let action = await pending()
  for (let index = 0; index < 12 && action.kind !== 'treatment'; index++) {
    if (action.kind === 'task' && action.task === 'start') throw new Error('Preparation reached Start without a product step')
    if (action.kind === 'task' && action.task === 'drum_fullness') {
      await current.getByRole('button', { name: 'Half', exact: true }).click()
    } else {
      // The only filled action is the footer's Done; a task step with nothing to offer has no "Something different?" row.
      await expect(footer.getByRole('button')).toHaveCount(1)
      await expect(footer.getByRole('button')).toHaveText('Done · next step')
      if (!checkedProblemCancel && await different.count() > 0) {
        const before = (await title.textContent())!
        await different.click()
        await problem.click()
        const sheet = page.getByRole('dialog', { name: 'Machine problem' })
        await expect(sheet).toBeVisible()
        await sheet.getByRole('button', { name: 'Close', exact: true }).click()
        await expect(sheet).toHaveCount(0)
        await expect(title).toHaveText(before)
        expect((await detail()).actions.find((entry) => entry.id === action.id)?.status).toBe('pending')
        checkedProblemCancel = true
      }
      await done.click()
    }
    const id = action.id
    await expect.poll(async () => (await detail()).actions.find((entry) => entry.id === id)?.status).toBe('confirmed')
    action = await pending()
  }
  expect(action.kind, 'Preparation reaches the detergent step').toBe('treatment')

  // On the product step the primary instruction stands alone; departures and recovery are behind one quiet row.
  await expect(footer.getByRole('button')).toHaveCount(1)
  await expect(footer.getByRole('button')).toHaveText('Done · next step')
  await expect(different).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: 'Used a different amount', exact: true })).toHaveCount(0)
  // Recovery is offered on wash and rinse product steps (stepActions); the record's own stage decides.
  const stage = 'stage' in action ? action.stage : null
  const recovers = stage === 'wash' || stage === 'rinse'
  await different.click()
  await expect(choices).toBeVisible()
  await expect(choices.getByRole('button', { name: 'Used a different amount', exact: true })).toBeVisible()
  await expect(choices.getByRole('button', { name: 'Skip', exact: true })).toBeVisible()
  await expect(choices.getByRole('button', { name: 'I missed it', exact: true })).toHaveCount(action.phase === 'cycle' ? 1 : 0)
  await expect(choices.getByRole('button', { name: 'Ran out? Switch product', exact: true })).toHaveCount(recovers ? 1 : 0)
  await expect(problem).toHaveCount(recovers ? 1 : 0)
  await choices.getByRole('button', { name: 'Close', exact: true }).first().click()
  await expect(choices).toHaveCount(0)

  // Cancelling an amount override submits nothing.
  const stepTitle = (await title.textContent())!
  await different.click()
  await choices.getByRole('button', { name: 'Used a different amount', exact: true }).click()
  await current.getByRole('spinbutton').first().fill('2')
  await current.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(title).toHaveText(stepTitle)
  await expect(different).toBeVisible()
  const afterCancel = await detail()
  expect(afterCancel.actions.find((entry) => entry.id === action.id)?.status).toBe('pending')
  expect(afterCancel.usage.filter((use) => use.actionId === action.id)).toHaveLength(0)

  if (recovers && !checkedProblemCancel) {
    await different.click()
    await problem.click()
    const sheet = page.getByRole('dialog', { name: 'Machine problem' })
    await sheet.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(sheet).toHaveCount(0)
    await expect(title).toHaveText(stepTitle)
    checkedProblemCancel = true
  }
  expect(checkedProblemCancel, 'A Machine problem sheet was opened and cancelled').toBe(true)

  // The primary Done records the planned dose once.
  await done.click()
  const id = action.id
  await expect.poll(async () => (await detail()).actions.find((entry) => entry.id === id)?.status).toBe('confirmed')
  expect((await detail()).usage.filter((use) => use.actionId === id)).toHaveLength(1)
})

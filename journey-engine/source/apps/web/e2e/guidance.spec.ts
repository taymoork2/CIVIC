import { expect, test } from '@playwright/test'
import { api } from '../src/api'
import { addClothes, addMachines, addProductAndWasher, convexAs, createHousehold, email, finishSession, freshPage, password, planAndStart, signUp } from './flows'

test('setup finished from the checklist leaves Home with no resume and the one setup checklist', async ({ browser }) => {
  const page = await freshPage(browser)
  try {
    await signUp(page, 'guidance-setup', 'Sam Setup')
    await createHousehold(page)
    const { client } = await convexAs(page)
    const guidance = (await client.query(api.households.onboardingStatus, {})).households[0]!.guidance!
    expect(guidance.status).toBe('dismissed')
    // The setup card covers what is still unset; Home offers no generic resume or replay.
    await expect(page.getByRole('button', { name: /^Continue |^Finish / })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Replay first-load guidance', exact: true })).toHaveCount(0)
    await page.goto('/setup')
    await expect(page.getByRole('button', { name: /Where you wash/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^I have laundry now/ })).toHaveCount(0)
  } finally {
    await page.context().close()
  }
})

test('first-load guidance names its task, never traps a second client, completes after put-away and replays explicitly', async ({ browser }) => {
  const page = await freshPage(browser)
  const other = await freshPage(browser)
  try {
    await signUp(page, 'guidance', 'Gale Guidance')
    await page.getByRole('button', { name: /Create a household/ }).click()
    await page.getByRole('button', { name: 'Create household', exact: true }).click()
    await page.getByRole('button', { name: /Where you wash/ }).click()
    await page.getByRole('radio', { name: 'Shared laundry room', exact: true }).click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: /^Add clothes/ }).click()
    await expect(page.getByRole('dialog', { name: 'What is it?' })).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    const { client } = await convexAs(page)
    const state = async () => (await client.query(api.households.onboardingStatus, {})).households[0]!.guidance!
    expect(await state()).toMatchObject({ status: 'started', stage: 'clothes' })
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Continue adding clothes', exact: true })).toBeVisible()

    await addProductAndWasher(page)
    await addMachines(page, { kind: 'Dryer', name: 'Laundry room dryer', count: 1, minutes: '45', heat: { 'Low heat': 'Delicates' } })
    await addClothes(page, { name: 'Guided tee', count: 2 })
    // Once Home leads with the hamper, the hero opens the task and the resume row steps aside.
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Continue adding clothes', exact: true })).toHaveCount(0)

    // A second client mid-guidance gets the normal app with its tabs, not a full-screen setup.
    await other.goto('/')
    await other.getByLabel('Email', { exact: true }).fill(email('guidance'))
    await other.getByLabel('Password', { exact: true }).fill(password)
    await other.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(other.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
    expect((await state()).status).toBe('started')
    await planAndStart(other, 2)
    await finishSession(other)
    expect((await state()).status).toBe('completed')
    const completedAt = (await state()).completedAt

    await page.goto('/')
    const replay = page.getByRole('link', { name: 'Replay first-load guidance', exact: true })
    await expect(replay).toBeVisible()
    await replay.click()
    await expect(page).toHaveURL(/\/setup\?replay=true$/)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: /^Add clothes/ }).click()
    expect(await state()).toMatchObject({ status: 'started', stage: 'clothes', completedAt })
    await other.goto('/')
    await expect(other.getByRole('button', { name: 'Continue adding clothes', exact: true })).toBeVisible()
  } finally {
    await page.context().close()
    await other.context().close()
  }
})

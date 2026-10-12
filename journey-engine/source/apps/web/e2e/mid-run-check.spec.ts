import { expect, test, type Page } from '@playwright/test'
import type { Id } from '@convex/_generated/dataModel'
import { api } from '../src/api'
import { convexAs, createHousehold, signUp } from './flows'

test.use({ locale: 'en-US' })

const minute = 60_000

/** No sideways scroll at this width. */
const fits = async (page: Page, width: number) => {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
}

/** A tee and a towel washed through the API and waiting for the dryer, at home or in a shared room. */
async function washedTeeAndTowel(page: Page, who: string, location: 'home' | 'shared') {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signUp(page, who, 'Sam Check')
  await createHousehold(page, location === 'home' ? 'At home' : 'Shared laundry room')
  const { client, householdId } = await convexAs(page)
  const evidence = { source: 'Synthetic machine plate', confidence: 'verified' as const }
  const washer = await client.mutation(api.inventory.createMachine, { householdId, name: location === 'home' ? 'Home washer' : 'Washer 3', applianceType: 'top_load_washer', location, highEfficiency: false,
    capacityUnits: 20, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['direct_to_drum'], cycleMinutes: { normal: 40 }, provenance: evidence })
  // The shared dryer is the owner's room: $0.50 for each 16 minutes.
  const dryer = await client.mutation(api.inventory.createMachine, { householdId, name: location === 'home' ? 'Home dryer' : 'Dryer 7', applianceType: 'tumble_dryer', location,
    capacityUnits: 20, capacityConfidence: 'verified', heatSettings: [{ heat: 'high', label: 'Hot' }, { heat: 'low', label: 'Delicate' }], cycleMinutes: { timed: 60 },
    ...(location === 'shared' ? { pricePerStart: 0.5, blockMinutes: 16 } : {}), provenance: evidence })
  const detergent = await client.mutation(api.inventory.createSupply, { householdId, name: 'Synthetic HE liquid', kind: 'chemical', use: 'detergent',
    safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'HE liquid', form: 'liquid', highEfficiencyCompatible: true }, provenance: evidence })
  await client.mutation(api.inventory.saveRule, { supplyId: detergent, dose: { amount: 30, unit: 'ml' }, stage: 'wash', placement: 'direct_to_drum', timing: 'before loading garments', provenance: evidence })
  const garment = async (name: string, kind: 't_shirt' | 'towel', bulkUnits: number) => {
    const textileId = await client.mutation(api.inventory.createTextile, { householdId, name, color: 'White', colorGroup: 'light', firstWash: false, bulkUnits })
    await client.mutation(api.inventory.updateTextile, { textileId, kind })
    await client.mutation(api.inventory.setCare, { textileId, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, restrictions: [], dryMethod: 'tumble_dry', dryHeat: 'high', provenance: evidence })
    return textileId
  }
  const tee = await garment('Blue tee', 't_shirt', 0.5)
  const towel = await garment('Bath towel', 'towel', 1.5)

  // One wash through the API, then both pieces into the dryer for 50 minutes.
  const textileIds: Id<'textiles'>[] = [tee, towel]
  const { planId } = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: textileIds, clientInputHash: 'mid-run-check' })
  const loadId = (await client.query(api.plans.get, { planId }))!.result.loads[0]!.id
  await client.mutation(api.plans.confirmRecipe, { planId, loadId, machineId: washer })
  const { sessionId } = await client.mutation(api.execution.start, { planId, loadId, idempotencyKey: 'mid-run-check' })
  for (let step = 0; step < 30; step++) {
    const detail = await client.query(api.execution.sessionDetail, { sessionId })
    const action = detail.actions.find((entry) => entry.status === 'pending' && !entry.phase.startsWith('dryer') && entry.phase !== 'hold_out')
    if (action === undefined) break
    if (action.kind === 'task' && action.task === 'drum_fullness') await client.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'medium' })
    else if (action.kind === 'task') await client.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status: 'confirmed', ...(action.task === 'start' ? { minutes: 40 } : {}) })
    else await client.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status: 'skipped' })
  }
  await client.mutation(api.execution.washFinished, { sessionId })
  await client.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  return { client, householdId, dryer }
}

// A tee and a towel share one 50-minute dryer run: the tee comes out at about half and hangs; the towel finishes the run.
test('mid-run check: start, the clock moves on, "Check now", hang the tee, then finish', async ({ page }, testInfo) => {
  const { client, householdId } = await washedTeeAndTowel(page, 'mid-run-check', 'home')
  // The dryer's start time comes from the browser clock: freeze it so every later "minutes since start" is exact.
  await page.clock.setFixedTime(Date.now())
  // At the dryer: once the minutes are typed, the step says what comes out early and when.
  await page.goto('/drying')
  await page.getByRole('button', { name: 'Load into Home dryer' }).click()
  await page.getByLabel(/Minutes on Home dryer/i).fill('50')
  await expect(page.getByText('We’ll remind you in about 25 min to take out the Blue tee.')).toBeVisible()
  await page.setViewportSize({ width: 320, height: 640 })
  await fits(page, 320)
  await page.screenshot({ path: testInfo.outputPath('mid-run-start-320.png'), fullPage: true })
  await page.setViewportSize({ width: 393, height: 852 })
  // Started from the dryer screen's own button: the run carries the planned check.
  await page.getByRole('button', { name: /^I[’']ve started Home dryer/ }).click()
  await expect.poll(async () => (await client.query(api.dryingQueue.queue, { householdId })).runs.length).toBe(1)
  const started = (await client.query(api.dryingQueue.queue, { householdId })).runs[0]!
  expect(started.check).toMatchObject({ atMinute: 25 })
  const { runId, startedAt } = started

  // Before the check: the row counts down to it.
  await page.clock.setFixedTime(startedAt + 5 * minute)
  await page.goto('/drying')
  const row = page.getByRole('button', { name: /Home dryer/ }).filter({ hasText: /Check in \d+ min/ })
  await expect(row).toBeVisible()
  // Nobody has to remember: Home and the Laundry tab each show the dryer's countdown to the check.
  for (const path of ['/', '/laundry']) {
    await page.goto(path)
    const card = page.getByRole('region', { name: 'Home dryer · early check' })
    await expect(card).toContainText(/\d+ min/)
    await expect(card).toContainText('until you take out the Blue tee. Home dryer keeps going for the rest.')
  }
  await page.setViewportSize({ width: 320, height: 640 })
  await fits(page, 320)
  await page.screenshot({ path: testInfo.outputPath('mid-run-countdown-320.png'), fullPage: true })
  await page.setViewportSize({ width: 393, height: 852 })

  // The clock moves on past half: the hub's next step and the row both say "Check now".
  await page.clock.setFixedTime(startedAt + 26 * minute)
  await page.goto('/')
  await expect(page.getByText('Take out the Blue tee now').first()).toBeVisible()
  await expect(page.getByText(/check time/)).toHaveCount(0)
  await page.setViewportSize({ width: 320, height: 640 })
  await fits(page, 320)
  await page.screenshot({ path: testInfo.outputPath('mid-run-home-320.png') })
  await page.goto('/drying')
  await expect(page.getByRole('button', { name: /Home dryer/ }).filter({ hasText: 'Check now: Blue tee' })).toBeVisible()
  await fits(page, 320)
  await page.screenshot({ path: testInfo.outputPath('mid-run-plan-320.png'), fullPage: true })
  await page.setViewportSize({ width: 393, height: 852 })
  await page.getByRole('button', { name: /Home dryer/ }).filter({ hasText: 'Check now: Blue tee' }).click()
  await expect(page.getByRole('heading', { name: 'Take out early' })).toBeVisible()
  // One plain instruction; the tee is already set to hang and the towel is one line, not a choice on every piece.
  await expect(page.getByText('Take out the Blue tee and hang it. Leave the Bath towel in, Home dryer keeps going.')).toBeVisible()
  await expect(page.getByText('Then close the door and press Start on Home dryer.')).toBeVisible()
  await expect(page.getByText('Bath towel stays in')).toBeVisible()
  await expect(page.getByRole('radiogroup')).toHaveCount(0)
  // Change opens the three answers for that piece only.
  await page.getByRole('button', { name: 'Change' }).first().click()
  const teeAnswers = page.getByRole('radiogroup', { name: 'Blue tee: dry, hang it, or not yet' })
  await expect(teeAnswers.getByRole('radio', { name: 'Hang it' })).toBeChecked()
  await expect(page.getByLabel(/Extra minutes/i)).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('mid-run-check-393.png'), fullPage: true })
  await page.setViewportSize({ width: 320, height: 640 })
  await fits(page, 320)
  await page.screenshot({ path: testInfo.outputPath('mid-run-check-320.png'), fullPage: true })
  await page.setViewportSize({ width: 393, height: 852 })
  await page.getByRole('button', { name: 'Done, dryer keeps going' }).click()
  await expect(page.getByText('1 hanging to dry · 1 still in the dryer.')).toBeVisible()

  // The run kept its time; the tee hangs on the rack.
  const after = await client.query(api.dryingQueue.queue, { householdId })
  expect(after.runs.find((run) => run.runId === runId)).toMatchObject({ startedAt, minutes: 50 })
  expect(after.runs.find((run) => run.runId === runId)?.check).toBeUndefined()
  expect(after.runs.some((run) => run.kind === 'air')).toBe(true)

  // Time is up: the towel is dry; then the tee on the rack is dry. Both put away.
  await page.clock.setFixedTime(startedAt + 51 * minute)
  await page.reload()
  await page.getByRole('button', { name: /Home dryer/ }).filter({ hasText: 'Time is up' }).click()
  await expect(page.getByRole('heading', { name: 'Is it dry?' })).toBeVisible()
  await page.getByRole('button', { name: 'Put away 1 dry piece' }).click()
  await page.getByRole('button', { name: 'Drying', exact: true }).click()
  await page.getByRole('button', { name: /Drying rack|Rack or line|Hang/ }).filter({ hasText: 'Blue tee' }).click()
  await page.getByRole('button', { name: 'Put away 1 dry piece' }).click()
  await page.getByRole('button', { name: 'Put away 2 pieces' }).click()
  await expect.poll(async () => (await client.query(api.dryingQueue.queue, { householdId })).pieces.length).toBe(0)
})

// The owner's shared room: a 32-minute run on a dryer paid $0.50 per 16 minutes. The check is at about
// 15 minutes, and taking a piece out early says to pay if the dryer asks when it starts again.
test('mid-run check in a shared room: check at about 15 min, pay if asked', async ({ page }, testInfo) => {
  const { client, householdId } = await washedTeeAndTowel(page, 'mid-run-shared', 'shared')
  await page.goto('/drying')
  await page.getByRole('button', { name: 'Load into a dryer', exact: true }).click()
  await page.getByLabel(/Minutes on Dryer 7/i).fill('32')
  await expect(page.getByText('We’ll remind you in about 15 min to take out the Blue tee.')).toBeVisible()
  await page.setViewportSize({ width: 320, height: 640 })
  await fits(page, 320)
  await page.screenshot({ path: testInfo.outputPath('mid-run-shared-start-320.png'), fullPage: true })
  await page.setViewportSize({ width: 393, height: 852 })
  await page.getByRole('button', { name: /^I[’']ve started Dryer 7/ }).click()
  await expect.poll(async () => (await client.query(api.dryingQueue.queue, { householdId })).runs.length).toBe(1)
  const run = (await client.query(api.dryingQueue.queue, { householdId })).runs[0]!
  expect(run.check).toMatchObject({ atMinute: 15 })

  await page.clock.setFixedTime(run.startedAt + 16 * minute)
  await page.goto('/drying')
  await page.getByRole('button', { name: /Dryer 7/ }).filter({ hasText: 'Check now: Blue tee' }).click()
  await expect(page.getByRole('heading', { name: 'Take out early' })).toBeVisible()
  await expect(page.getByText(/Pay \$0\.50 if asked/)).toBeVisible()
  await page.setViewportSize({ width: 320, height: 640 })
  await fits(page, 320)
  await page.screenshot({ path: testInfo.outputPath('mid-run-shared-check-320.png'), fullPage: true })
})

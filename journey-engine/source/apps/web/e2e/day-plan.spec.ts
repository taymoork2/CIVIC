import { expect, test, type Page } from '@playwright/test'
import type { Id } from '@convex/_generated/dataModel'
import { api } from '../src/api'
import { convexAs, createHousehold, openHousehold, signUp } from './flows'

test.use({ locale: 'en-US' })

type Client = Awaited<ReturnType<typeof convexAs>>['client']

/** A household with one washer (30 min) and one dryer (45 min timed), or a shared room, and a plan of 3 loads. */
async function household(page: Page, who: string, location: 'home' | 'shared') {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signUp(page, who, 'Robin Day')
  await createHousehold(page, location === 'home' ? 'At home' : 'Shared laundry room')
  const { client, householdId } = await convexAs(page)
  const evidence = { source: 'Synthetic machine plate', confidence: 'verified' as const }
  const washer = await client.mutation(api.inventory.createMachine, { householdId, name: 'Washer 1', applianceType: 'top_load_washer', location, highEfficiency: false,
    capacityUnits: 20, capacityConfidence: 'verified', supportedCycles: ['normal', 'delicate'], placements: ['direct_to_drum'], cycleMinutes: { normal: 30, delicate: 30 }, provenance: evidence })
  const dryer = await client.mutation(api.inventory.createMachine, { householdId, name: 'Dryer 1', applianceType: 'tumble_dryer', location,
    capacityUnits: 20, capacityConfidence: 'verified', heatSettings: [{ heat: 'high', label: 'Hot' }, { heat: 'low', label: 'Delicate' }], cycleMinutes: { timed: 45 }, provenance: evidence })
  const detergent = await client.mutation(api.inventory.createSupply, { householdId, name: 'Synthetic HE liquid', kind: 'chemical', use: 'detergent',
    safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'HE liquid', form: 'liquid', highEfficiencyCompatible: true }, provenance: evidence })
  await client.mutation(api.inventory.saveRule, { supplyId: detergent, dose: { amount: 30, unit: 'ml' }, stage: 'wash', placement: 'direct_to_drum', timing: 'before loading garments', provenance: evidence })
  // Whites, new darks and a delicate-cycle piece: 3 loads.
  const garment = async (name: string, color: string, colorGroup: 'white' | 'black', cycle = 'normal') => {
    const textileId = await client.mutation(api.inventory.createTextile, { householdId, name, color, colorGroup, firstWash: colorGroup !== 'white' })
    await client.mutation(api.inventory.setCare, { textileId, material: 'cotton', washMethod: 'machine', cycle, maxTemperatureC: 40, restrictions: [], dryMethod: 'tumble_dry', dryHeat: 'high', provenance: evidence })
    return textileId
  }
  const ids = [await garment('Synthetic white tee', 'White', 'white'), await garment('Synthetic black jeans', 'Black', 'black'), await garment('Synthetic white blouse', 'White', 'white', 'delicate')]
  const { planId } = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: ids, clientInputHash: who })
  expect((await client.query(api.plans.get, { planId }))!.result.loads).toHaveLength(3)
  return { client, householdId, washer, dryer }
}

/**
 * Every load of today's plan washed, dried and put away through the API, one at a time: the day is
 * finished. A load the day plan hung queues on a rack: with `page`, Home is checked to say hang, never
 * the dryer. Returns how many loads were hung.
 */
async function finishDay(client: Client, householdId: Id<'households'>, washer: Id<'machines'>, dryer: Id<'machines'>, key: string, page?: Page): Promise<number> {
  let hung = 0
  for (let round = 0; round < 3; round++) {
    const next = await client.query(api.plans.upNext, { householdId })
    const load = next?.loads.find((entry) => entry.sessionId === null)
    if (next === null || load === undefined) return hung
    await client.mutation(api.plans.confirmRecipe, { planId: next.planId, loadId: load.loadId, machineId: washer })
    const { sessionId } = await client.mutation(api.execution.start, { planId: next.planId, loadId: load.loadId, machineId: washer, idempotencyKey: `${key}-${round}` })
    for (let step = 0; step < 30; step++) {
      const detail = await client.query(api.execution.sessionDetail, { sessionId })
      const action = detail.actions.find((entry) => entry.status === 'pending' && !entry.phase.startsWith('dryer'))
      if (action === undefined) break
      if (action.kind === 'task' && action.task === 'drum_fullness') await client.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'medium' })
      else if (action.kind === 'task') await client.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status: 'confirmed', ...(action.task === 'start' ? { minutes: 30 } : {}) })
      else await client.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status: 'skipped' })
    }
    await client.mutation(api.execution.washFinished, { sessionId })
    await client.mutation(api.dryingQueue.queueFromWasher, { sessionId })
    const queued = (await client.query(api.dryingQueue.queue, { householdId })).pieces.filter((piece) => piece.status === 'queued')
    const pieceIds = queued.map((piece) => piece.pieceId)
    if (queued.every((piece) => piece.method === 'rack_line' && piece.source === 'once')) {
      hung += 1
      if (page !== undefined) {
        await page.goto('/')
        await expect(page.getByText(/washed (piece|pieces) to hang or lay flat/).first()).toBeVisible()
        await expect(page.getByText('Move them to the dryer now')).toHaveCount(0)
      }
      const runId = await client.mutation(api.dryingQueue.startAirDry, { householdId, pieceIds, method: 'rack_line' })
      await client.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: pieceIds })
      await client.mutation(api.dryingQueue.putAway, { householdId, pieceIds })
      continue
    }
    const { runId } = await client.mutation(api.dryingQueue.startDryer, { householdId, pieceIds, dryerId: dryer, minutes: 45 })
    await client.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: pieceIds })
    await client.mutation(api.dryingQueue.putAway, { householdId, pieceIds })
  }
  return hung
}

const noSideScroll = async (page: Page, width: number) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)

// Design 6.1: "All today" with "Home until?". With about 100 minutes, load 1's dryer run ends in time,
// load 2 washes now and hangs (the dryer would run too late), and load 3 waits for tomorrow.
test('All today fits the day before "Home until", hangs or rolls the rest, and the day finishes', async ({ page }, testInfo) => {
  // A fixed mid-morning clock: "Home until" is always the same day and the same 100 minutes away.
  const morning = new Date()
  morning.setHours(10, 0, 0, 0)
  const until = '11:40'
  await page.clock.setFixedTime(morning)
  const { client, householdId, washer, dryer } = await household(page, 'day-all', 'home')
  await page.goto('/laundry')
  const card = page.getByRole('region', { name: 'Plan the day' })
  await expect(card.getByRole('heading', { name: '3 loads' })).toBeVisible()
  // The pace is one pill; today's choices open in a sheet, with the plain facts for each pace.
  await expect(card.getByRole('button', { name: 'All today', exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'All today', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText(/^(Done about \d{1,2}:\d{2} [AP]M|(\d+ of \d+|None) fit before \d{1,2}:\d{2} [AP]M)$/)).toBeVisible()
  await sheet.getByRole('radio', { name: 'Spread out', exact: true }).click()
  await expect(sheet.getByText(/^\d+ a day, done (tomorrow|[A-Z][a-z]+day)$/)).toBeVisible()
  await sheet.getByRole('radio', { name: 'All today', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('day-pick-393.png'), fullPage: true })
  await page.setViewportSize({ width: 320, height: 640 })
  await noSideScroll(page, 320)
  await page.screenshot({ path: testInfo.outputPath('day-pick-320.png'), fullPage: true })

  await sheet.getByLabel('Home until?').fill(until)
  await noSideScroll(page, 320)
  await page.screenshot({ path: testInfo.outputPath('day-until-320.png'), fullPage: true })
  await sheet.getByRole('button', { name: 'Plan today', exact: true }).click()

  const strip = page.getByRole('region', { name: 'Plan the day' })
  // The day at a glance: a row per load with its status, the day's end in one line, and the next step in one tap.
  await expect(strip.getByRole('heading', { level: 2, name: '2 loads' })).toBeVisible()
  await expect(strip.getByText(/^Done about \d{1,2}:\d{2} [AP]M$/)).toBeVisible()
  const rows = page.getByRole('region', { name: 'Loads' }).getByRole('listitem')
  await expect(rows.filter({ hasText: 'Next' })).toHaveCount(1)
  await expect(rows.filter({ hasText: 'Wash now, hang to dry' })).toHaveCount(1)
  await expect(rows.filter({ hasText: 'Tomorrow' })).toHaveCount(1)
  await expect(strip.getByRole('list', { name: 'Today’s loads in order' })).toBeVisible()
  // The Up next row is the one way into the next load; the card adds no button of its own.
  await expect(strip.getByRole('button', { name: /Open .+ load$/ })).toHaveCount(1)
  await expect(strip.getByRole('button', { name: 'Start load 1', exact: true })).toHaveCount(0)
  await expect(page.locator('main')).toContainText(/2 loads fit before \d{1,2}:\d{2} [AP]M\./)
  // Where the minutes came from sits behind one disclosure, not in the rows.
  await expect(page.locator('.day-plan-order')).toBeHidden()
  await page.getByText('Where these times come from').click()
  await expect(page.locator('.day-plan-order li').first()).toContainText(/wash ~30 min, dry ~45 min \(your washer’s time; your dryer’s time\)/)
  await expect(page.locator('.day-plan-order li').nth(1)).toContainText('wash ~30 min, hang to dry (your washer’s time)')
  // The day ends before "Home until": the hung load never goes in the dryer.
  const toMinutes = (text: string) => { const [, h, m, half] = /(\d{1,2}):(\d{2}) ([AP]M)/.exec(text)!; return (Number(h) % 12 + (half === 'PM' ? 12 : 0)) * 60 + Number(m) }
  const [hours, minutes] = until.split(':').map(Number)
  expect(toMinutes((await strip.getByText(/^Done about/).textContent())!)).toBeLessThanOrEqual(hours! * 60 + minutes! + 5)
  await noSideScroll(page, 320)
  await page.screenshot({ path: testInfo.outputPath('day-strip-320.png'), fullPage: true })
  await page.setViewportSize({ width: 393, height: 852 })
  await page.screenshot({ path: testInfo.outputPath('day-strip-393.png'), fullPage: true })

  // The hung load has no dryer run in the plan, and its wash ends on a rack: Home says hang, never the dryer.
  expect((await client.query(api.plans.upNext, { householdId }))!.loads.filter((load) => load.dryer === null)).toHaveLength(1)
  // Finish the day: both of today's loads washed, dried and put away. The rolled load is back in the hamper.
  expect(await finishDay(client, householdId, washer, dryer, 'day-all', page)).toBe(1)
  await page.goto('/laundry')
  await expect(page.getByRole('region', { name: 'Plan the day' })).toHaveCount(0)
  await expect(page.locator('[data-slot=task-footer]').getByRole('button', { name: /^Sort 1 .+ into loads$/ })).toBeVisible()
})

// Design 6.2: "Spread out" at the household's loads a day. One wearer, so no "Whose day is it?".
test('Spread out plans only today’s loads, says when the rest is done, and the day finishes', async ({ page }, testInfo) => {
  const { client, householdId, washer, dryer } = await household(page, 'day-spread', 'home')
  await page.goto('/laundry')
  const card = page.getByRole('region', { name: 'Plan the day' })
  await card.getByRole('button', { name: 'All today', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('radio', { name: 'Spread out', exact: true }).click()
  await expect(sheet.getByText('Whose day is it?')).toHaveCount(0)
  await sheet.getByRole('radiogroup', { name: 'How many loads a day?' }).getByRole('radio', { name: '1', exact: true }).click()
  await expect(sheet.getByRole('radiogroup', { name: 'How many loads a day?' }).getByRole('radio', { name: '1', exact: true })).toBeChecked()
  await page.setViewportSize({ width: 320, height: 640 })
  await noSideScroll(page, 320)
  await page.screenshot({ path: testInfo.outputPath('day-spread-320.png'), fullPage: true })
  await sheet.getByRole('button', { name: 'Plan today', exact: true }).click()

  const strip = page.getByRole('region', { name: 'Plan the day' })
  await expect(strip.getByRole('heading', { level: 2, name: '1 load' })).toBeVisible()
  await expect(strip.getByText(/^The rest by about [A-Z][a-z]+day$/)).toBeVisible()
  expect((await client.query(api.inventory.list, { householdId })).planning.day).toEqual({ loadsPerDay: 1 })
  await noSideScroll(page, 320)
  await page.screenshot({ path: testInfo.outputPath('day-spread-strip-320.png'), fullPage: true })

  await finishDay(client, householdId, washer, dryer, 'day-spread')
  await page.reload()
  await expect(page.getByRole('region', { name: 'Plan the day' })).toHaveCount(0)
  await expect(page.locator('[data-slot=task-footer]').getByRole('button', { name: /^Sort 2 .+ into loads$/ })).toBeVisible()

  // Household settings: loads a day as just answered, and the rack size, one tap each.
  await openHousehold(page, 'Appliances')
  const settings = page.getByRole('region', { name: 'Laundry day' })
  await expect(settings.getByRole('radiogroup', { name: 'Loads a day when spread out' }).getByRole('radio', { name: '1', exact: true })).toBeChecked()
  await settings.getByRole('radiogroup', { name: 'Room to hang clothes' }).getByRole('radio', { name: '2', exact: true }).click()
  await expect(settings.getByRole('radiogroup', { name: 'Room to hang clothes' }).getByRole('radio', { name: '2', exact: true })).toBeChecked()
  expect((await client.query(api.inventory.list, { householdId })).planning.day).toEqual({ loadsPerDay: 1, rackLoads: 2 })
  await settings.scrollIntoViewIfNeeded()
  await noSideScroll(page, 320)
  await page.screenshot({ path: testInfo.outputPath('day-settings-320.png') })
})

// A shared room keeps the order and the counts, never a clock (design 11).
test('in a shared room the day plans show counts and no clock times', async ({ page }, testInfo) => {
  await household(page, 'day-shared', 'shared')
  await page.goto('/laundry')
  const card = page.getByRole('region', { name: 'Plan the day' })
  await expect(card.getByRole('heading', { name: '3 loads' })).toBeVisible()
  await expect(card).not.toContainText(/\d{1,2}:\d{2}/)
  await card.getByRole('button', { name: 'All today', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Plan today', exact: true }).click()
  const strip = page.getByRole('region', { name: 'Plan the day' })
  // Picked: the pace is only a label now.
  await expect(strip.getByRole('button', { name: 'All today', exact: true })).toHaveCount(0)
  await expect(strip.getByRole('heading', { level: 2, name: '3 loads' })).toBeVisible()
  await expect(page.locator('main')).not.toContainText(/about \d{1,2}:\d{2}/)
  await page.setViewportSize({ width: 320, height: 640 })
  await noSideScroll(page, 320)
  await page.screenshot({ path: testInfo.outputPath('day-shared-320.png'), fullPage: true })
})

// Started later than planned: the strip fits the day again before "Home until" and says what waits (invariant 13).
test('a late start fits the day again before "Home until"', async ({ page }) => {
  const start = Date.now()
  const until = await page.evaluate((now) => { const at = new Date(now + 100 * 60_000); return at.getDate() === new Date(now + 20 * 60_000).getDate() && at.getDate() === new Date(now).getDate() ? `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}` : null }, start)
  test.skip(until === null, 'Home until would cross midnight')
  await page.clock.setFixedTime(start)
  await household(page, 'day-late', 'home')
  await page.goto('/laundry')
  const card = page.getByRole('region', { name: 'Plan the day' })
  await card.getByRole('button', { name: 'All today', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Home until?').fill(until!)
  await sheet.getByRole('button', { name: 'Plan today', exact: true }).click()
  const strip = page.getByRole('region', { name: 'Plan the day' })
  await expect(strip.getByRole('heading', { level: 2, name: '2 loads' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('status')).toHaveCount(0)
  // 20 minutes later, nothing started: load 1's dryer run would end after "Home until".
  await page.clock.setFixedTime(start + 20 * 60_000)
  await page.reload()
  await expect(page.getByRole('main').getByRole('status')).toHaveText(/^(1 load fits before \d{1,2}:\d{2} [AP]M\.|.+ won’t fit today\.)$/)
  // The load All today already rolled, plus the one the late start rolls: each shows once.
  await expect(page.getByRole('region', { name: 'Loads' }).getByRole('listitem').filter({ hasText: 'Tomorrow' })).toHaveCount(2)
  await page.setViewportSize({ width: 320, height: 640 })
  await noSideScroll(page, 320)
  await page.clock.setFixedTime(start + 95 * 60_000)
  await page.reload()
  await expect(strip.getByRole('button', { name: /Start/ })).toHaveCount(0)
  await page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Remaining loads wait until tomorrow', exact: true })).toBeVisible()
  await expect(page.getByRole('main').getByRole('button', { name: /^Start/ })).toHaveCount(0)
  await page.getByRole('link', { name: 'Review laundry day', exact: true }).first().click()
  await expect(page).toHaveURL(/\/laundry/)
})

// Design 6.3: with 2 wearers, Spread out asks whose day it is; one tap picks a person.
test('Spread out with two wearers asks whose day it is', async ({ page }, testInfo) => {
  const { client, householdId } = await household(page, 'day-two', 'home')
  await client.mutation(api.inventory.createWearer, { householdId, name: 'Alex', kind: 'adult' })
  await page.goto('/laundry')
  const card = page.getByRole('region', { name: 'Plan the day' })
  await card.getByRole('button', { name: 'All today', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('radio', { name: 'Spread out', exact: true }).click()
  const whose = sheet.getByRole('radiogroup', { name: 'Whose day is it?' })
  await expect(whose.getByRole('radio', { name: 'Anyone', exact: true })).toBeChecked()
  await whose.getByRole('radio', { name: 'Alex', exact: true }).click()
  await expect(whose.getByRole('radio', { name: 'Alex', exact: true })).toBeChecked()
  await page.setViewportSize({ width: 320, height: 640 })
  await noSideScroll(page, 320)
  await page.screenshot({ path: testInfo.outputPath('day-whose-320.png'), fullPage: true })
})

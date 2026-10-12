import { expect, test } from '@playwright/test'
import { api } from '../src/api'
import { addClothes, addMachines, addProductAndWasher, convexAs, createHousehold, finishSession, freshPage, planAndStart, signUp } from './flows'

test('dryer program suggestions can be overridden and remain distinct in completed history', async ({ browser }) => {
  const page = await freshPage(browser)
  try {
    await signUp(page, 'dryer-guidance', 'Dana Dryer')
    await createHousehold(page)
    await addProductAndWasher(page)
    await addMachines(page, { kind: 'Dryer', name: 'Laundry room dryer', count: 1, minutes: '45', heat: { 'Low heat': 'Delicates' } })
    await addClothes(page, { name: 'Dryer guidance tee' })
    await planAndStart(page, 1)
    await finishSession(page, { suggested: '45', shown: '35' })
    const { client, householdId } = await convexAs(page)
    const { textiles } = await client.query(api.inventory.list, { householdId })
    const records = await client.query(api.sessions.washRecordsForTextile, { textileId: textiles[0]!.textileId })
    expect(records[0]?.drying).toMatchObject({ outcome: 'tumble_dried', minutes: 35, durationSuggestion: { version: 1, minutes: 45, basis: 'recorded_program' } })
    const record = records[0]!
    expect(record.activityContext).toMatchObject({ version: 2, independentWashId: record.sessionId, quantity: 1,
      products: [expect.objectContaining({ status: 'confirmed', amount: expect.any(Number), unit: expect.any(String), placement: expect.any(String) })] })
    expect(record.drying.activityContext).toMatchObject({ version: 1, runId: expect.any(String),
      start: { version: 1, products: [], load: { pieceCount: 1 }, machine: { name: 'Laundry room dryer', applianceType: 'tumble_dryer', telemetry: false, cycleProfile: { cycles: { timed: { durationMinutes: 45 } } } } },
      displayedStarts: [{ startedAt: expect.any(Number), minutes: 35 }], checkedAt: expect.any(Number), checkedBy: expect.any(String), telemetry: false })
  } finally {
    await page.context().close()
  }
})

import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api } from './_generated/api'
import { intakeHousehold, newBackend, planFor, signedIn, startLoad } from './harness.testing'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

// Root-owned applyMachineStart integration is required; this regression exposes that seam.
for (const status of ['skipped', 'missed'] as const) test(`a required detergent cannot be ${status} during preparation and then start the machine`, async () => {
  const t = newBackend()
  const as = signedIn(t, `required-detergent-${status}`)
  const home = await intakeHousehold(as)
  const wording = 'Use fragrance-free detergent'
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, expectedInstructions: null,
    instructions: { source: 'Synthetic sewn label', preparation: [], washing: [wording], beforeDrying: [], drying: [], afterDrying: [], ironing: [],
      washingRequirements: [{ wording, checked: true, requirements: [{ kind: 'detergent_fragrance_free' }] }],
    },
  })
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, safety: { bleachKind: 'none', fragrance: 'free', incompatibleSupplyIds: [], incompatibleMaterials: [], factSource: 'Synthetic exact pack' } })
  const planned = await planFor(as, home.householdId, [home.shirt])
  expect(planned.result.status).toBe('ready')
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: status })
  let leftOut = false
  for (let count = 0; count < 20; count += 1) {
    const detail = await as.query(api.execution.sessionDetail, { sessionId })
    const action = detail.actions.find((entry) => entry.status === 'pending')
    if (action === undefined) throw new Error('Start step missing')
    if (action.kind === 'task' && action.task === 'start') {
      expect(leftOut).toBe(true)
      await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status: 'confirmed' })).rejects.toThrow()
      expect((await t.run((ctx) => ctx.db.get(sessionId)))?.machineStartedAt).toBeUndefined()
      break
    }
    if (action.kind === 'treatment') {
      expect(action.supplyId).toBe(home.detergent)
      leftOut = true
      await as.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status })
    } else await as.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status: 'confirmed' })
    if (count === 19) throw new Error('Preparation did not reach Start')
  }
})

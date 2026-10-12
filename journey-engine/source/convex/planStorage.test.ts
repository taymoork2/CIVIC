import { expect, test } from 'vitest'
import { api } from './_generated/api'
import { intakeHousehold, newBackend, planFor, signedIn, startLoad } from './harness.testing'
import { getPlan, writePlanDocuments } from './planStorage'
import { releasePlan } from './plans'

test('large plan documents round-trip Unicode, remain authorized and replace/delete all parts atomically', async () => {
  const t = newBackend()
  const as = signedIn(t, 'large-plan-owner')
  const home = await intakeHousehold(as)
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['worn'], soilLevel: 'normal' })
  const planned = await planFor(as, home.householdId, [home.shirt])
  const original = (await t.run(ctx => ctx.db.get(planned.planId)))!
  const documents = { inputSnapshot: { ...original.inputSnapshot, unicodeEvidence: '🧺漢字é'.repeat(150_000) }, result: original.result }
  expect(new TextEncoder().encode(JSON.stringify(documents)).length).toBeGreaterThan(1_048_576)
  await t.run(ctx => writePlanDocuments(ctx, planned.planId, documents))
  const parts = await t.run(ctx => ctx.db.query('planDocuments').collect())
  expect(parts.length).toBeGreaterThan(1)
  expect(parts.every(part => new TextEncoder().encode(JSON.stringify(part)).length < 128_500)).toBe(true)
  expect(await t.run(ctx => getPlan(ctx, planned.planId))).toMatchObject(documents)
  expect((await as.query(api.plans.get, { planId: planned.planId }))!.result).toEqual(planned.result)
  await expect(signedIn(t, 'outsider').query(api.plans.get, { planId: planned.planId })).rejects.toThrow()
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'large-plan-start' })
  expect((await as.query(api.execution.sessionDetail, { sessionId })).actions.length).toBeGreaterThan(0)
  await t.run(ctx => ctx.db.delete(parts[0]!._id))
  await expect(as.query(api.plans.get, { planId: planned.planId })).rejects.toThrow('incomplete')
  await t.run(ctx => writePlanDocuments(ctx, planned.planId, documents))
  expect(await t.run(ctx => ctx.db.query('planDocuments').collect())).toHaveLength(parts.length)
  await t.run(ctx => writePlanDocuments(ctx, planned.planId, { inputSnapshot: original.inputSnapshot, result: original.result }))
  expect(await t.run(ctx => ctx.db.query('planDocuments').collect())).toHaveLength(0)
  expect(await t.run(ctx => getPlan(ctx, planned.planId))).toMatchObject({ inputSnapshot: original.inputSnapshot, result: original.result })
  await t.run(ctx => writePlanDocuments(ctx, planned.planId, documents))
  await t.run(async ctx => {
    await ctx.db.patch(planned.planId, { status: 'retired' })
    await releasePlan(ctx, planned.planId)
  })
  expect(await t.run(ctx => ctx.db.query('planDocuments').collect())).toHaveLength(parts.length)
  await t.run(async ctx => {
    await ctx.db.patch(sessionId, { status: 'completed' })
    await releasePlan(ctx, planned.planId)
  })
  expect(await t.run(ctx => getPlan(ctx, planned.planId))).toBeNull()
  expect(await t.run(ctx => ctx.db.query('planDocuments').collect())).toHaveLength(0)
})

import { expect, test } from 'vitest'
import { api } from './_generated/api'
import { intakeHousehold, joinHousehold, newBackend, planFor, signedIn, startLoad } from './harness.testing'

test('completed history pages beyond the recent-session window, orders by completion and masks private identities', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'history-owner')
  const home = await intakeHousehold(owner)
  const plan = await planFor(owner, home.householdId, [home.shirt])
  const started = await startLoad(owner, { planId: plan.planId, loadId: plan.result.loads[0]!.id, idempotencyKey: 'history-base', startedAt: 100 })
  const runningIds = await t.run(async ctx => {
    await ctx.db.patch(home.machine, { pricePerStart: 2.5 })
    const base = (await ctx.db.get(started.sessionId))!
    const timeline = (await ctx.db.query('timelines').withIndex('by_session', q => q.eq('sessionId', started.sessionId)).unique())!
    const { _id: timelineId, _creationTime: timelineCreated, ...timelineFields } = timeline
    const { _id, _creationTime, ...fields } = base
    for (let i = 0; i < 31; i++) {
      const sessionId = await ctx.db.insert('sessions', { ...fields, machineStartedAt: 100, status: 'completed', completedAt: 1_000 - i, idempotencyKey: `completed-${i}` })
      if (i === 0) await ctx.db.insert('timelines', { ...timelineFields, sessionId })
    }
    for (let i = 0; i < 25; i++) await ctx.db.insert('sessions', { ...fields, status: 'cancelled', idempotencyKey: `cancelled-${i}` })
    const running = []
    for (let i = 0; i < 25; i++) running.push(await ctx.db.insert('sessions', { ...fields, status: 'running', idempotencyKey: `running-${i}` }))
    return running
  })
  const recent = await owner.query(api.execution.householdSessions, { householdId: home.householdId })
  expect(recent.filter(row => row.status === 'completed')).toHaveLength(0)
  expect(new Set(recent.filter(row => row.status === 'running').map(row => row.sessionId))).toEqual(new Set([started.sessionId, ...runningIds]))
  const first = await owner.query(api.execution.completedHistory, { householdId: home.householdId, paginationOpts: { cursor: null, numItems: 5 } })
  expect(first.page.map(row => row.completedAt)).toEqual([1_000, 999, 998, 997, 996])
  expect(first.isDone).toBe(false)
  expect(first.page[0]?.washPrice).toBe(2.5)
  expect(first.page[1]?.washPrice).toBeNull()
  const second = await owner.query(api.execution.completedHistory, { householdId: home.householdId, paginationOpts: { cursor: first.continueCursor, numItems: 20 } })
  const third = await owner.query(api.execution.completedHistory, { householdId: home.householdId, paginationOpts: { cursor: second.continueCursor, numItems: 20 } })
  expect([...first.page, ...second.page, ...third.page]).toHaveLength(31)
  expect(third.isDone).toBe(true)
  expect(new Set([...first.page, ...second.page, ...third.page].map(row => row.sessionId)).size).toBe(31)
  await owner.mutation(api.inventory.setPrivacy, { textileIds: [home.shirt], private: true })
  const member = await joinHousehold(t, owner, home.householdId, 'history-member', 'Member')
  const masked = await member.query(api.execution.completedHistory, { householdId: home.householdId, paginationOpts: { cursor: null, numItems: 5 } })
  expect(masked.page[0]?.garments).toEqual([{ name: null, color: null }])
  await expect(signedIn(t, 'stranger').query(api.execution.completedHistory, { householdId: home.householdId, paginationOpts: { cursor: null, numItems: 5 } })).rejects.toThrow()
})

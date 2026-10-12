import { expect, test } from 'vitest'
import { api } from './_generated/api'
import { intakeHousehold, newBackend, signedIn } from './harness.testing'

test('guidance is durable across clients, optional for old accounts and scoped to each household member', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'guidance-owner')
  const home = await intakeHousehold(owner)
  expect((await owner.query(api.households.onboardingStatus, {})).households[0]?.guidance).toBeUndefined()
  await owner.mutation(api.households.setGuidance, { householdId: home.householdId, command: 'start', stage: 'clothes' })
  const secondDevice = signedIn(t, 'guidance-owner')
  expect((await secondDevice.query(api.households.onboardingStatus, {})).households[0]?.guidance).toMatchObject({ status: 'started', stage: 'clothes' })
  await secondDevice.mutation(api.households.setGuidance, { householdId: home.householdId, command: 'dismiss' })
  expect((await owner.query(api.households.onboardingStatus, {})).households[0]?.guidance).toMatchObject({ status: 'dismissed', stage: 'clothes' })
  await owner.mutation(api.households.setGuidance, { householdId: home.householdId, command: 'resume' })
  expect((await secondDevice.query(api.households.onboardingStatus, {})).households[0]?.guidance).toMatchObject({ status: 'started', stage: 'clothes' })
  const invite = await owner.mutation(api.households.createInvite, { householdId: home.householdId })
  const member = signedIn(t, 'guidance-member')
  await member.mutation(api.households.joinWithInvite, { code: invite.code })
  expect((await member.query(api.households.onboardingStatus, {})).households[0]?.guidance).toMatchObject({ status: 'started', stage: 'intent' })
  await member.mutation(api.households.setGuidance, { householdId: home.householdId, command: 'start', stage: 'laundry' })
  expect((await owner.query(api.households.onboardingStatus, {})).households[0]?.guidance?.stage).toBe('clothes')
  await expect(signedIn(t, 'outsider').mutation(api.households.setGuidance, { householdId: home.householdId, command: 'dismiss' })).rejects.toThrow('Forbidden')
  await expect(t.mutation(api.households.setGuidance, { householdId: home.householdId, command: 'start' })).rejects.toThrow('Unauthenticated')
})

test('a new guided household records its intent atomically with membership; no client can claim completion', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'guided-new')
  const home = await owner.mutation(api.households.createHousehold, { name: 'Guided home', startGuidance: true })
  expect((await owner.query(api.households.onboardingStatus, {})).households[0]?.guidance).toMatchObject({ status: 'started', stage: 'intent' })
  await expect(owner.mutation(api.households.setGuidance, { householdId: home.householdId, command: 'completed' as never })).rejects.toThrow()
})

test('dismissing never overwrites completed guidance, including after a replay', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'guidance-finished')
  const home = await intakeHousehold(owner)
  await owner.mutation(api.households.setGuidance, { householdId: home.householdId, command: 'start', stage: 'laundry' })
  // Completion comes only from recorded care, so the test writes it as completeGuidance would.
  await t.run(async (ctx) => {
    const member = (await ctx.db.query('memberships').collect()).find((row) => row.householdId === home.householdId)!
    await ctx.db.patch(member._id, { guidance: { ...member.guidance!, status: 'completed', stage: 'laundry', completedAt: 1000, updatedAt: 1000 } })
  })
  const completed = { status: 'completed', completedAt: 1000 }
  await owner.mutation(api.households.setGuidance, { householdId: home.householdId, command: 'dismiss' })
  expect((await owner.query(api.households.onboardingStatus, {})).households[0]?.guidance).toMatchObject({ ...completed, stage: 'laundry', updatedAt: 1000 })
  await owner.mutation(api.households.setGuidance, { householdId: home.householdId, command: 'replay' })
  expect((await owner.query(api.households.onboardingStatus, {})).households[0]?.guidance).toMatchObject({ status: 'started', stage: 'intent', completedAt: 1000 })
  await owner.mutation(api.households.setGuidance, { householdId: home.householdId, command: 'dismiss' })
  expect((await owner.query(api.households.onboardingStatus, {})).households[0]?.guidance).toMatchObject(completed)
})

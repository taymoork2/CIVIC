import { expect, test } from 'vitest'
import { api, internal } from './_generated/api'
import { joinHousehold, label, newBackend, signedIn } from './harness.testing'

test.each([
  { washPlace: 'home' as const, locations: ['home' as const], kinds: ['home'] },
  { washPlace: 'shared' as const, locations: ['shared' as const], kinds: ['shared'] },
  { washPlace: 'laundromat' as const, locations: ['shared' as const], kinds: ['laundromat'] },
  { washPlace: 'both' as const, locations: ['home' as const, 'shared' as const], kinds: ['home', 'shared'] },
  { washPlace: undefined, locations: ['shared' as const, 'home' as const], kinds: ['home', 'shared'] },
  { washPlace: undefined, locations: [], kinds: [] },
])('migration is idempotent for $washPlace / $locations', async ({ washPlace, locations, kinds }) => {
  const t = newBackend()
  const owner = signedIn(t, 'place-owner')
  const { householdId } = await owner.mutation(api.households.createHousehold, { name: 'Family', ...(washPlace === undefined ? {} : { washPlace }) })
  await joinHousehold(t, owner, householdId, 'place-member', 'Sam')
  const water = { zip: '94704', source: 'strip' as const, band: 'hard' as const, setAt: 1, reading: { value: 150, unit: 'mg_l' as const }, mgL: 150 }
  await t.run((ctx) => ctx.db.patch(householdId, { planning: { water } }))
  for (const location of locations) {
    await owner.mutation(api.inventory.createMachine, { householdId, name: location, applianceType: 'top_load_washer', location, provenance: label('plate') })
  }
  const snapshot = () => t.run(async (ctx) => ({
    places: await ctx.db.query('places').withIndex('by_household', (q) => q.eq('householdId', householdId)).collect(),
    machines: await ctx.db.query('machines').withIndex('by_household', (q) => q.eq('householdId', householdId)).collect(),
    memberships: await ctx.db.query('memberships').withIndex('by_household', (q) => q.eq('householdId', householdId)).collect(),
    household: await ctx.db.get(householdId),
  }))
  await t.mutation(internal.inventory.migratePlaces, { householdId })
  const first = await snapshot()
  expect(first.places.map((place) => place.kind)).toEqual(kinds)
  for (const place of first.places) expect(place).toMatchObject({ zip: water.zip, water })
  for (const machine of first.machines) {
    const kind = washPlace === 'laundromat' ? 'laundromat' : machine.location
    expect(machine.placeId).toBe(first.places.find((place) => place.kind === kind)!._id)
    expect(machine.location).toBe(machine.name)
  }
  for (const membership of first.memberships) expect(membership.currentPlaceId).toBe(first.places[0]?._id)
  await t.mutation(internal.inventory.migratePlaces, { householdId })
  expect(await snapshot()).toEqual(first)
})

test('migration preserves an existing place and current choice; an unknown location is not guessed between two places', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'existing-place')
  const { householdId } = await owner.mutation(api.households.createHousehold, { name: 'Home', washPlace: 'both' })
  const machineId = await owner.mutation(api.inventory.createMachine, { householdId, name: 'Unknown', provenance: label('plate') })
  const placeId = await t.run(async (ctx) => {
    const placeId = await ctx.db.insert('places', { householdId, name: 'Dorm', kind: 'shared', createdAt: 1 })
    const membership = await ctx.db.query('memberships').withIndex('by_household', (q) => q.eq('householdId', householdId)).unique()
    await ctx.db.patch(membership!._id, { currentPlaceId: placeId })
    return placeId
  })
  for (let i = 0; i < 2; i++) await t.mutation(internal.inventory.migratePlaces, { householdId })
  await t.run(async (ctx) => {
    expect(await ctx.db.get(placeId)).toMatchObject({ name: 'Dorm', createdAt: 1 })
    expect((await ctx.db.get(machineId))!.placeId).toBeUndefined()
    expect((await ctx.db.query('memberships').withIndex('by_household', (q) => q.eq('householdId', householdId)).unique())!.currentPlaceId).toBe(placeId)
    expect(await ctx.db.query('places').withIndex('by_household', (q) => q.eq('householdId', householdId)).collect()).toHaveLength(2)
  })
})

import { afterEach, beforeEach, expect, test } from 'vitest'

import { clearLanding, clearSessionProjection, loadClosetChips, loadDraft, loadLanding, loadSessionProjection, loadWashPlace, offlineSessionCopies, purgePrivateState, saveClosetChips, saveDraft, saveLanding, saveSessionProjection, saveWashPlace } from './private-state'

class MemoryStorage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
  keys() { return [...this.values.keys()] }
}

let storage: MemoryStorage
beforeEach(() => {
  storage = new MemoryStorage()
  const proxy = new Proxy(storage, { ownKeys: (target) => target.keys(), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) })
  ;(globalThis as any).window = { localStorage: proxy }
})
afterEach(() => { delete (globalThis as any).window })

const detail = (status: string) => ({
  sessionId: 's1',
  householdId: 'h1',
  status,
  revision: 7,
  machineName: 'Washer',
  startedAt: 1,
  machineStartedAt: 2,
  cycleMinutes: 35,
  doorLocks: true,
  estimatedFinishAt: 2 + 35 * 60_000,
  finishConfidence: 'user-supplied',
  textiles: Array.from({ length: 80 }, (_, index) => ({ textileId: `t${index}`, name: 'Tee', careNotes: 'never-stored' })),
  actions: Array.from({ length: 50 }, (_, index) => ({ id: `a${index}`, supplyName: 'Tide', dose: { amount: 30, unit: 'ml' }, placement: 'detergent_compartment', stage: 'wash', timing: null, dueAt: 5, status: 'pending', recordedBy: 'principal:v1:secret', token: 'never-stored' })),
})

test('the active-session projection is bounded and holds no identities or tokens', () => {
  saveSessionProjection(detail('running'))
  const projection = loadSessionProjection('s1')!
  expect(projection.actions).toHaveLength(30)
  expect(projection.textiles).toHaveLength(60)
  expect(projection.revision).toBe(7)
  // Enough to show the load offline: physical order, the door, and when it will be done.
  expect(projection).toMatchObject({ machineStartedAt: 2, doorLocks: true, estimatedFinishAt: 2 + 35 * 60_000, cycleMinutes: 35 })
  expect(projection.actions[3]).toMatchObject({ order: 3, kind: 'treatment' })
  expect(JSON.stringify(projection)).not.toContain('principal:v1')
  expect(JSON.stringify(projection)).not.toContain('never-stored')
  expect(loadSessionProjection('another-session')).toBeNull()
})

test('a finished session removes its projection', () => {
  saveSessionProjection(detail('running'))
  saveSessionProjection(detail('completed'))
  expect(loadSessionProjection()).toBeNull()
})

test('a private piece retains its care offline but never its name, colour or other fields', () => {
  const care = { washMethod: 'machine' as const, cycle: 'delicate', maxTemperatureC: 30, dryMethod: 'do_not_tumble_dry' as const, dryHeat: null, bleach: 'none' as const, restrictions: ['No wringing'], lines: ['Wash inside out'] }
  saveSessionProjection({ ...detail('running'), textiles: [{ textileId: 'private', name: 'Secret garment', color: 'Secret colour', private: true, privateCare: care }] })
  expect(loadSessionProjection('s1')!.textiles).toEqual([{ textileId: 'private', name: null, color: null, private: true, privateCare: care }])
  expect(JSON.stringify(loadSessionProjection('s1'))).not.toContain('Secret')
  saveSessionProjection({ ...detail('running'), textiles: [{ textileId: 'private', name: 'Secret garment', private: true, privateCare: { ...care, lines: null } as never }] })
  expect(loadSessionProjection('s1')!.textiles[0]!.privateCare).toBeNull()
})

test('offline pretreatment keeps the garment, temperature and label directions', () => {
  saveSessionProjection({ ...detail('running'), actions: [{ id: 'pretreat', kind: 'treatment', phase: 'drum', textileId: 't1', textileName: 'Cotton shirt', temperatureC: 20, supplyName: 'Test product', dose: { amount: 10, unit: 'ml' }, placement: 'manual', stage: 'prewash', timing: 'Test label directions', status: 'pending' }] })
  expect(loadSessionProjection('s1')?.actions[0]).toMatchObject({ textileId: 't1', textileName: 'Cotton shirt', temperatureC: 20, timing: 'Test label directions', phase: 'drum' })
})

test('offline optional advice preserves its source, scope and matching pieces without author identity', () => {
  const advice = { tipId: 'inside_out', scope: 'general_graphic', reason: 'Optional general handling', source: 'Synthetic source', policyVersion: '1', recordedBy: 'principal:v1:private' }
  saveSessionProjection({ ...detail('running'), actions: [{ id: 'advice', kind: 'task', task: 'garment_advice', title: 'Inside out (optional)', detail: advice.reason, advice, garments: [{ textileId: 't1' }, { textileId: 't2' }], status: 'pending' }] })
  const action = loadSessionProjection('s1')!.actions[0]!
  expect(action.advice).toEqual({ tipId: 'inside_out', scope: 'general_graphic', reason: advice.reason, source: advice.source, policyVersion: '1' })
  expect(action.garments.map((piece) => piece.textileId)).toEqual(['t1', 't2'])
  expect(JSON.stringify(action)).not.toContain('principal:v1')
})

test('each running load keeps its own copy, so two loads both show offline', () => {
  saveSessionProjection({ ...detail('running'), sessionId: 's1', machineName: 'Washer 1' })
  saveSessionProjection({ ...detail('running'), sessionId: 's2', machineName: 'Washer 2' })
  expect(loadSessionProjection('s1')?.machineName).toBe('Washer 1')
  expect(loadSessionProjection('s2')?.machineName).toBe('Washer 2')
  // Saving one again replaces only its own copy.
  saveSessionProjection({ ...detail('running'), sessionId: 's1', machineName: 'Washer 1', revision: 8 })
  expect(loadSessionProjection('s1')?.revision).toBe(8)
  expect(loadSessionProjection('s2')?.machineName).toBe('Washer 2')
  // A finished load drops only its own copy.
  saveSessionProjection({ ...detail('completed'), sessionId: 's2' })
  expect(loadSessionProjection('s2')).toBeNull()
  expect(loadSessionProjection('s1')?.machineName).toBe('Washer 1')
  saveSessionProjection({ ...detail('cancelled'), sessionId: 's1' })
  expect(loadSessionProjection()).toBeNull()
  expect(storage.getItem('washcloset:private:sessions')).toBeNull()
})

test('only the most recently saved running loads are kept', () => {
  let now = 1_000
  const realNow = Date.now
  Date.now = () => now++
  try {
    for (let index = 0; index < 10; index++) saveSessionProjection({ ...detail('running'), sessionId: `s${index}` })
  } finally {
    Date.now = realNow
  }
  expect(JSON.parse(storage.getItem('washcloset:private:sessions')!)).toHaveLength(8)
  expect(loadSessionProjection('s0')).toBeNull()
  expect(loadSessionProjection('s1')).toBeNull()
  expect(loadSessionProjection('s2')).not.toBeNull()
  // With no load named, the offline notice shows the newest one.
  expect(loadSessionProjection()?.sessionId).toBe('s9')
})

test('offline on a load\'s page shows that load\'s own copy, never the newest one, and lists the others', () => {
  let now = 1_000
  const realNow = Date.now
  Date.now = () => now++
  try {
    saveSessionProjection({ ...detail('running'), sessionId: 'b', machineName: 'Dryer' })
    // Load A was viewed last, so it is the newest copy.
    saveSessionProjection({ ...detail('running'), sessionId: 'a', machineName: 'Washer' })
  } finally {
    Date.now = realNow
  }
  const onB = offlineSessionCopies('b')
  expect(onB.projection?.sessionId).toBe('b')
  expect(onB.others.map((saved) => saved.sessionId)).toEqual(['a'])
  // A load with no copy on this phone shows none of the others' steps, only links to them.
  const unknown = offlineSessionCopies('c')
  expect(unknown.projection).toBeNull()
  expect(unknown.others.map((saved) => saved.sessionId)).toEqual(['a', 'b'])
  // Off a load's page, the newest copy.
  expect(offlineSessionCopies().projection?.sessionId).toBe('a')
  expect(offlineSessionCopies().others.map((saved) => saved.sessionId)).toEqual(['b'])
})

test('the single copy an older version kept is folded in alongside newer loads', () => {
  storage.setItem('washcloset:private:session', JSON.stringify({ ...detail('running'), sessionId: 'old', textiles: [], actions: [], savedAt: 1 }))
  saveSessionProjection({ ...detail('running'), sessionId: 's2' })
  expect(storage.getItem('washcloset:private:session')).toBeNull()
  expect(loadSessionProjection('old')?.sessionId).toBe('old')
  expect(loadSessionProjection('s2')?.sessionId).toBe('s2')
  // A finished copy left by the old version is ignored.
  storage.setItem('washcloset:private:session', JSON.stringify({ ...detail('completed'), sessionId: 'done', textiles: [], actions: [], savedAt: 2 }))
  expect(loadSessionProjection('done')).toBeNull()
})

test('drafts are scoped to one household and everything private is purged together', () => {
  saveDraft({ householdId: 'h1', selectedTextileIds: ['t1'], seenTextileIds: ['t1', 't2'], planId: null, inputHash: null })
  saveSessionProjection(detail('running'))
  storage.setItem('unrelated-app-key', 'kept')
  expect(loadDraft('h1')?.selectedTextileIds).toEqual(['t1'])
  expect(loadDraft('h2')).toBeNull()

  purgePrivateState()
  expect(loadDraft('h1')).toBeNull()
  expect(loadSessionProjection()).toBeNull()
  expect(storage.getItem('unrelated-app-key')).toBe('kept')
  clearSessionProjection('s1')
})

test('corrupt or blocked storage reads as empty instead of failing', () => {
  storage.setItem('washcloset:private:session', '{not json')
  expect(loadSessionProjection()).toBeNull()
  storage.setItem('washcloset:private:sessions', '{not json')
  expect(loadSessionProjection()).toBeNull()
  storage.setItem('washcloset:private:sessions', JSON.stringify([{ sessionId: 's1' }, 'junk']))
  expect(loadSessionProjection('s1')).toBeNull()
  ;(globalThis as any).window = { get localStorage() { throw new Error('blocked') } }
  expect(loadDraft('h1')).toBeNull()
  expect(() => purgePrivateState()).not.toThrow()
})

test('a copy saved before drying existed still loads, reading the new fields as none', () => {
  storage.setItem('washcloset:private:session', JSON.stringify({
    sessionId: 's1', householdId: 'h1', status: 'running', revision: 3, machineName: 'Washer', startedAt: 1, machineStartedAt: 2,
    cycleMinutes: 35, doorLocks: true, estimatedFinishAt: 99, finishConfidence: 'verified', savedAt: 5,
    textiles: [{ textileId: 't1', name: 'Tee' }],
    actions: [{ id: 'a1', kind: 'task', task: 'start', phase: 'start', order: 0, title: 'Start', detail: null, supplyName: null, dose: null, placement: null, stage: null, timing: null, dueAt: null, status: 'pending' }],
  }))
  const projection = loadSessionProjection('s1')!
  expect(projection).toMatchObject({ washFinishedAt: null, drying: null, textiles: [{ textileId: 't1', name: 'Tee', color: null }] })
  expect(projection.actions[0]).toMatchObject({ basis: null, reusable: false, garments: [] })
})

test('a drying load keeps its cap marks and who stays out of the dryer', () => {
  saveSessionProjection({
    ...detail('running'),
    textiles: [{ textileId: 't1', name: 'Tee', color: 'White' }, { textileId: 't2', name: 'Sweater', color: 'Navy' }],
    washFinishedAt: 40,
    drying: {
      status: 'ready', dryerName: 'Dryer 2', heat: 'low', heatLabel: 'Low temp', minutes: 45, minutesConfidence: 'verified',
      startedAt: null, readyAt: 45 * 60_000 + 40, readyEstimated: true, tumbleCount: 1,
      heldOut: [{ textileId: 't2', name: 'Sweater', color: 'Navy', method: 'dry_flat', reason: 'care_label', secret: 'never-stored' }],
    },
    actions: [
      { id: 'a1', kind: 'treatment', phase: 'dispenser', order: 0, supplyName: 'Tide', placement: 'detergent_compartment', stage: 'wash', timing: null, status: 'pending', basis: 'medium load, HE washer',
        dose: { amount: 1, unit: 'cap', mark: 'Line 3', marks: ['Line 1', 'Line 3', 'Line 5'], equivalent: { amount: 39, unit: 'ml' }, measurementCue: null } },
      { id: 'a2', kind: 'task', task: 'hold_out', phase: 'hold_out', order: 1, title: 'Keep 1 out', detail: null, dueAt: 40, status: 'pending', garments: [{ textileId: 't2', method: 'dry_flat' }] },
      { id: 'a3', kind: 'treatment', phase: 'dryer_with_load', order: 2, supplyName: 'Wool balls', placement: 'dryer_drum', stage: 'dry', timing: null, status: 'pending', reusable: true, dose: { amount: 3, unit: 'ball' } },
    ],
  })
  const projection = loadSessionProjection('s1')!
  expect(projection.washFinishedAt).toBe(40)
  expect(projection.drying).toMatchObject({ dryerName: 'Dryer 2', heatLabel: 'Low temp', minutes: 45, heldOut: [{ name: 'Sweater', color: 'Navy', method: 'dry_flat' }] })
  expect(projection.textiles[1]).toEqual({ textileId: 't2', name: 'Sweater', color: 'Navy' })
  expect(projection.actions[0]).toMatchObject({ basis: 'medium load, HE washer', dose: { amount: 1, unit: 'cap', mark: 'Line 3', marks: ['Line 1', 'Line 3', 'Line 5'], equivalent: { amount: 39, unit: 'ml' } } })
  expect(projection.actions[1]).toMatchObject({ task: 'hold_out', dueAt: 40, garments: [{ textileId: 't2', method: 'dry_flat' }] })
  expect(projection.actions[2]).toMatchObject({ reusable: true, dose: { amount: 3, unit: 'ball' } })
  expect(JSON.stringify(projection)).not.toContain('never-stored')
})

test('offline projection preserves partial marks and refuses malformed fractions', () => {
  const action = { id: 'a1', kind: 'treatment', phase: 'dispenser', order: 0, supplyName: 'Tide', placement: 'detergent_compartment', stage: 'wash', timing: null, status: 'pending',
    dose: { amount: 1, unit: 'cap', mark: 'Bar 1', fractionOfMark: 0.8, marks: ['Bar 1'], equivalent: { amount: 39, unit: 'ml' } } }
  saveSessionProjection({ ...detail('running'), actions: [action] })
  expect(loadSessionProjection('s1')?.actions[0]?.dose).toMatchObject({ mark: 'Bar 1', fractionOfMark: 0.8 })
  expect(loadSessionProjection('s1')?.actions[0]?.dose?.equivalent).toBeUndefined()
  saveSessionProjection({ ...detail('running'), actions: [{ ...action, dose: { ...action.dose, fractionOfMark: 1.2 } }] })
  expect(loadSessionProjection('s1')?.actions[0]?.dose).toBeNull()
})

test('offline projection keeps qualitative and approximate native doses without invented equivalents', () => {
  const action = { id: 'a1', kind: 'treatment', phase: 'drum', order: 0, supplyName: 'Synthetic source product', placement: 'direct_to_drum', stage: 'wash', timing: 'before clothes', status: 'pending' }
  for (const dose of [{ amount: 1, unit: 'cap', mark: 'Bar 2', target: 'below', equivalent: { amount: 50, unit: 'ml' } }, { amount: 0.25, unit: 'US_cup', approximate: true, equivalent: { amount: 60, unit: 'ml' } }]) {
    saveSessionProjection({ ...detail('running'), actions: [{ ...action, dose }] })
    const { equivalent: _equivalent, ...native } = dose
    expect(loadSessionProjection('s1')?.actions[0]?.dose).toMatchObject(native)
    expect(loadSessionProjection('s1')?.actions[0]?.dose?.equivalent).toBeUndefined()
  }
  saveSessionProjection({ ...detail('running'), actions: [{ ...action, dose: { amount: 1, unit: 'cap', mark: 'Bar 2', target: 'below', fractionOfMark: 0.8 } }] })
  expect(loadSessionProjection('s1')?.actions[0]?.dose).toBeNull()
})

test('the closet chips survive a reload for their own household only', () => {
  saveClosetChips({ householdId: 'h1', wearer: { wearerId: 'w1' }, occasion: 'work' })
  expect(loadClosetChips('h1')).toEqual({ householdId: 'h1', wearer: { wearerId: 'w1' }, occasion: 'work' })
  expect(loadClosetChips('h2')).toBeNull()
  saveClosetChips({ householdId: 'h1', wearer: 'me', occasion: 'any' })
  expect(loadClosetChips('h1')?.wearer).toBe('me')
  saveClosetChips({ householdId: 'h1', wearer: 'me', occasion: 'any', clothingTypes: ['t_shirt', 'shorts'], tags: ['Everyday', 'Weekend outfit'] })
  expect(loadClosetChips('h1')).toMatchObject({ clothingTypes: ['t_shirt', 'shorts'], tags: ['Everyday', 'Weekend outfit'] })
  storage.setItem('washcloset:private:closet-chips', JSON.stringify({ householdId: 'h1', wearer: 'me', occasion: 'any', clothingTypes: [42] }))
  expect(loadClosetChips('h1')).toBeNull()
  storage.setItem('washcloset:private:closet-chips', JSON.stringify({ householdId: 'h1', wearer: { wearerId: '' }, occasion: 'work' }))
  expect(loadClosetChips('h1')).toBeNull()
  purgePrivateState()
  expect(loadClosetChips('h1')).toBeNull()
})

test('the landing is remembered until cleared, and purged with everything else', () => {
  expect(loadLanding()).toBeNull()
  saveLanding('laundry')
  expect(loadLanding()).toBe('laundry')
  clearLanding()
  expect(loadLanding()).toBeNull()
  saveLanding('laundry')
  purgePrivateState()
  expect(loadLanding()).toBeNull()
  storage.setItem('washcloset:private:landing', '"somewhere"')
  expect(loadLanding()).toBeNull()
})

test('chips and landing tolerate storage that throws', () => {
  ;(globalThis as any).window = { get localStorage() { throw new Error('blocked') } }
  expect(() => saveClosetChips({ householdId: 'h1', wearer: 'everyone', occasion: 'any' })).not.toThrow()
  expect(loadClosetChips('h1')).toBeNull()
  expect(() => saveLanding('laundry')).not.toThrow()
  expect(loadLanding()).toBeNull()
  expect(() => clearLanding()).not.toThrow()
  const throwing = { getItem() { throw new Error('denied') }, setItem() { throw new Error('full') }, removeItem() { throw new Error('denied') } }
  ;(globalThis as any).window = { localStorage: throwing }
  expect(() => saveClosetChips({ householdId: 'h1', wearer: 'me', occasion: 'work' })).not.toThrow()
  expect(loadClosetChips('h1')).toBeNull()
  expect(() => saveLanding('laundry')).not.toThrow()
  expect(loadLanding()).toBeNull()
  expect(() => clearLanding()).not.toThrow()
})

test('where this household washes is remembered for that household only, and purged with everything else', () => {
  expect(loadWashPlace('h1')).toBeNull()
  saveWashPlace('h1', 'shared')
  expect(loadWashPlace('h1')).toBe('shared')
  expect(loadWashPlace('h2')).toBeNull()
  storage.setItem('washcloset:private:wash-place', JSON.stringify({ householdId: 'h1', place: 'garage' }))
  expect(loadWashPlace('h1')).toBeNull()
  saveWashPlace('h1', 'both')
  purgePrivateState()
  expect(loadWashPlace('h1')).toBeNull()
})

test('purging private state also removes the retired Household section preference', () => {
  storage.setItem('washcloset:private:household-section', JSON.stringify('bottles'))
  purgePrivateState()
  expect(storage.getItem('washcloset:private:household-section')).toBeNull()
})

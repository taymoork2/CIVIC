import { expect, test } from 'vitest'

import { newBackend } from './harness.testing'

const provenance = { source: 'label', confidence: 'verified' as const }
const recorded = { order: 0, status: 'pending' as const }

test('rows stored before drying and cap marks still validate beside the new shapes', async () => {
  const t = newBackend()
  const ids = await t.run(async (ctx) => {
    const now = 1_000
    const householdId = await ctx.db.insert('households', { name: 'Home', createdBy: 'owner', createdAt: now, planning: { washerPricePerStart: 2 } })
    const collectionId = await ctx.db.insert('collections', { householdId, ownerPrincipalKey: 'owner', name: 'Closet', createdAt: now })
    const textile = { householdId, collectionId, ownerPrincipalKey: 'owner', name: 'Tee', status: 'dirty' as const, washCount: 0, createdAt: now }
    const legacyTextileId = await ctx.db.insert('textiles', textile)
    const textileId = await ctx.db.insert('textiles', { ...textile, soilLevel: 'heavy' })
    const legacyCareId = await ctx.db.insert('care', { householdId, textileId: legacyTextileId, washMethod: 'machine', cycle: 'normal', restrictions: ['Do not tumble dry'], status: 'confirmed', provenance, createdAt: now })
    const careId = await ctx.db.insert('care', { householdId, textileId, washMethod: 'machine', cycle: 'normal', restrictions: [], dryMethod: 'tumble_dry', dryHeat: 'low', status: 'confirmed', provenance, createdAt: now })

    const legacySupplyId = await ctx.db.insert('supplies', { householdId, ownerPrincipalKey: 'owner', name: 'Tide', kind: 'chemical', provenance, createdAt: now })
    const supplyId = await ctx.db.insert('supplies', {
      householdId, ownerPrincipalKey: 'owner', name: 'Tide cap', kind: 'chemical', provenance, createdAt: now,
      measure: { kind: 'cap', marks: [{ label: '1' }, { label: '3', amount: 39, unit: 'ml' }, { label: '5' }] },
    })
    const sheetsId = await ctx.db.insert('supplies', { householdId, ownerPrincipalKey: 'owner', name: 'Bounce', kind: 'dryer_sheet', provenance, createdAt: now, measure: { kind: 'count', countUnit: 'sheet' } })
    const rule = { householdId, dose: { amount: 30, unit: 'ml' }, stage: 'wash' as const, placement: 'detergent_compartment' as const, timing: 'before cycle start', provenance, createdAt: now }
    const legacyRuleId = await ctx.db.insert('rules', { ...rule, supplyId: legacySupplyId, conditions: { minBulkUnits: 1 } })
    const ruleId = await ctx.db.insert('rules', {
      ...rule, supplyId, row: 2, rowText: 'Large / heavily soiled',
      conditions: { loadSizes: ['large'], soilLevels: ['heavy'], machineClasses: ['he'] },
      dose: { amount: 1, unit: 'cap', mark: '3' },
    })
    const dryerRuleId = await ctx.db.insert('rules', { ...rule, supplyId: sheetsId, conditions: { loadSizes: ['medium'] }, dose: { amount: 1, unit: 'sheet' }, stage: 'dry', placement: 'dryer_drum', timing: 'before starting the dryer' })

    const machine = { householdId, name: 'Washer', pool: 'available' as const, dispensingProfile: { placements: ['detergent_compartment'] }, provenance, createdAt: now }
    const legacyMachineId = await ctx.db.insert('machines', { ...machine, applianceType: 'top_load_washer' })
    const washerId = await ctx.db.insert('machines', { ...machine, applianceType: 'front_load_washer', highEfficiency: true })
    const dryerId = await ctx.db.insert('machines', {
      ...machine, name: 'Dryer', applianceType: 'tumble_dryer', dispensingProfile: { evidence: { status: 'verified' } },
      heatSettings: [{ heat: 'high', label: 'High temp' }, { heat: 'low', label: 'Low temp' }],
      cycleProfile: { cycles: { timed: { durationMinutes: 64, confidence: 'verified' } } },
    })
    await ctx.db.patch(householdId, { planning: { washerPricePerStart: 2, preferredMachineId: washerId, preferredDryerId: dryerId, dryerPricePerStart: 1.5 } })

    const plan = { householdId, createdBy: 'owner', plannerVersion: 'planner-v1', inputHash: 'hash', inputSnapshot: {}, result: {}, status: 'ready' as const, createdAt: now }
    const legacyPlanId = await ctx.db.insert('plans', plan)
    const session = { householdId, planId: legacyPlanId, textileIds: [legacyTextileId], startedBy: 'owner', idempotencyKey: 'key', status: 'running' as const, revision: 0 }
    const legacySessionId = await ctx.db.insert('sessions', session)
    const sessionId = await ctx.db.insert('sessions', { ...session, idempotencyKey: 'dryer', machineStartedAt: now, washFinishedAt: now + 1, dryerStartedAt: now + 2 })

    const washerTask = (task: 'load' | 'close' | 'start') => ({ id: `load-001:task:${task}`, kind: 'task' as const, task, phase: task, title: task, detail: null, ...recorded })
    const treatment = { id: 'load-001:treatment:0', kind: 'treatment' as const, phase: 'dispenser' as const, supplyId, stage: 'wash', placement: 'detergent_compartment', dose: { amount: 30, unit: 'ml', measurementCue: 'fill to line 2' }, timing: 'before cycle start', confidence: 'verified' as const, machineTelemetry: false, offsetMinutes: null, ...recorded }
    const legacyTimelineId = await ctx.db.insert('timelines', { householdId, sessionId: legacySessionId, startedAt: now, actions: [treatment, washerTask('load'), washerTask('close'), washerTask('start')], status: 'pending', revision: 0, createdAt: now })
    const timelineId = await ctx.db.insert('timelines', {
      householdId, sessionId, machineId: washerId, dryerId, startedAt: now, status: 'pending', revision: 0, createdAt: now,
      drying: { status: 'ready', dryerId, heat: 'low', heatLabel: 'Low temp', minutes: 64, minutesConfidence: 'verified', tumbleTextileIds: [textileId], heldOut: [{ textileId: legacyTextileId, method: 'do_not_tumble_dry', reason: 'care_label' }] },
      actions: [
        { ...treatment, dose: { amount: 1, unit: 'cap', mark: '3', marks: ['1', '3', '5'], equivalent: { amount: 39, unit: 'ml' } }, basis: 'large load, heavy soil, HE washer' },
        { id: 'load-001:task:hold_out', kind: 'task', task: 'hold_out', phase: 'hold_out', title: 'Keep 1 out', detail: null, dueAt: now + 60_000, garments: [{ textileId: legacyTextileId, method: 'do_not_tumble_dry' }], ...recorded },
        { id: 'load-001:dryer:treatment:0', kind: 'treatment', phase: 'dryer_with_load', supplyId: sheetsId, stage: 'dry', placement: 'dryer_drum', dose: { amount: 1, unit: 'sheet' }, timing: 'before starting the dryer', confidence: 'verified', machineTelemetry: false, offsetMinutes: null, reusable: false, ...recorded },
        { id: 'load-001:task:dryer_unload', kind: 'task', task: 'dryer_unload', phase: 'dryer_unload', title: 'Collect from the dryer', detail: null, ...recorded },
      ],
    })
    const usage = { householdId, sessionId, supplyId, placement: 'detergent_compartment', usedAt: now, confirmedBy: 'owner' }
    const legacyUsageId = await ctx.db.insert('usage', { ...usage, amount: 30, unit: 'ml' })
    const usageId = await ctx.db.insert('usage', { ...usage, amount: 1, unit: 'cap', mark: '3' })
    return { householdId, legacyCareId, careId, supplyId, legacyRuleId, ruleId, dryerRuleId, legacyMachineId, dryerId, legacyPlanId, sessionId, legacyTimelineId, timelineId, legacyUsageId, usageId, textileId }
  })

  const rows = await t.run(async (ctx) => ({
    household: await ctx.db.get(ids.householdId),
    legacyCare: await ctx.db.get(ids.legacyCareId),
    care: await ctx.db.get(ids.careId),
    supply: await ctx.db.get(ids.supplyId),
    legacyRule: await ctx.db.get(ids.legacyRuleId),
    rule: await ctx.db.get(ids.ruleId),
    dryerRule: await ctx.db.get(ids.dryerRuleId),
    legacyMachine: await ctx.db.get(ids.legacyMachineId),
    dryer: await ctx.db.get(ids.dryerId),
    legacyPlan: await ctx.db.get(ids.legacyPlanId),
    session: await ctx.db.get(ids.sessionId),
    legacyTimeline: await ctx.db.get(ids.legacyTimelineId),
    timeline: await ctx.db.get(ids.timelineId),
    legacyUsage: await ctx.db.get(ids.legacyUsageId),
    usage: await ctx.db.get(ids.usageId),
    textile: await ctx.db.get(ids.textileId),
  }))
  expect(rows.legacyCare?.dryMethod).toBeUndefined()
  expect(rows.care).toMatchObject({ dryMethod: 'tumble_dry', dryHeat: 'low' })
  expect(rows.textile?.soilLevel).toBe('heavy')
  expect(rows.supply?.measure?.marks?.[1]).toEqual({ label: '3', amount: 39, unit: 'ml' })
  expect(rows.legacyRule?.conditions).toEqual({ minBulkUnits: 1 })
  expect(rows.rule).toMatchObject({ row: 2, dose: { mark: '3' }, conditions: { loadSizes: ['large'], soilLevels: ['heavy'], machineClasses: ['he'] } })
  expect(rows.dryerRule).toMatchObject({ stage: 'dry', placement: 'dryer_drum' })
  expect(rows.legacyMachine?.highEfficiency).toBeUndefined()
  expect(rows.dryer?.heatSettings?.map((setting) => setting.label)).toEqual(['High temp', 'Low temp'])
  expect(rows.household?.planning).toMatchObject({ preferredDryerId: ids.dryerId, dryerPricePerStart: 1.5 })
  expect(rows.legacyPlan?.plannerVersion).toBe('planner-v1')
  expect(rows.session).toMatchObject({ washFinishedAt: 1_001, dryerStartedAt: 1_002 })
  expect(rows.legacyTimeline?.actions.map((action) => action.phase)).toEqual(['dispenser', 'load', 'close', 'start'])
  expect(rows.timeline?.drying?.heatLabel).toBe('Low temp')
  expect(rows.timeline?.actions.map((action) => action.phase)).toEqual(['dispenser', 'hold_out', 'dryer_with_load', 'dryer_unload'])
  expect(rows.legacyUsage?.mark).toBeUndefined()
  expect(rows.usage?.mark).toBe('3')
})

test('closet, wearer, heads-up and at-machine shapes validate beside the rows stored before them', async () => {
  const t = newBackend()
  const ids = await t.run(async (ctx) => {
    const now = 1_000
    const householdId = await ctx.db.insert('households', {
      name: 'Home', createdBy: 'owner', createdAt: now,
      planning: { babySeparate: false },
      closet: { hamperDays: 5, wetDays: 1, cleanerDays: 10, notWornDays: 60, laundryPersonKey: 'partner' },
    })
    const collectionId = await ctx.db.insert('collections', { householdId, ownerPrincipalKey: 'owner', name: 'Closet', createdAt: now })
    const wearerId = await ctx.db.insert('wearers', { householdId, name: 'Sam', kind: 'baby', createdAt: now })
    const accountWearerId = await ctx.db.insert('wearers', { householdId, name: 'Alex', kind: 'adult', principalKey: 'partner', createdAt: now })
    const textile = { householdId, collectionId, ownerPrincipalKey: 'owner', name: 'Bodysuit', washCount: 0, createdAt: now }
    const legacyTextileId = await ctx.db.insert('textiles', { ...textile, status: 'clean' })
    const statuses = ['hanging', 'needs_dry_clean', 'at_cleaner', 'needs_refresh'] as const
    for (const status of statuses) await ctx.db.insert('textiles', { ...textile, status, statusSince: now })
    const textileId = await ctx.db.insert('textiles', {
      ...textile, status: 'dirty', soilLevel: 'heavy', kind: 'baby_bodysuit', wearerId, occasions: ['everyday'],
      flag: { reasons: ['baby_mess', 'wet'], stainNote: 'Left knee', neededBy: now + 86_400_000, flaggedBy: 'owner', flaggedAt: now },
      statusSince: now, lastWornAt: now - 1, wearsSinceClean: 2, lastCleanedAt: now - 2,
      cleanerNote: 'Ticket 42', cleanerPickupBy: now + 3, identity: { brand: 'Acme', styleNumber: 'S1', size: '6M', rnNumber: 'RN 123', barcode: '0123' },
    })
    const guestId = await ctx.db.insert('textiles', { ...textile, name: 'Guest shirt', status: 'dirty', flag: { reasons: [], flaggedBy: 'owner', flaggedAt: now }, guest: true })
    const careId = await ctx.db.insert('care', { householdId, textileId, washMethod: 'machine', cycle: 'delicate', maxTemperatureC: 30, restrictions: [], ironSteam: 'not_allowed', status: 'confirmed', provenance: { source: 'tag_taps', confidence: 'observed' }, createdAt: now })
    const supplyId = await ctx.db.insert('supplies', { householdId, ownerPrincipalKey: 'owner', name: 'Tide', kind: 'chemical', use: 'detergent', provenance: { source: 'label_taps', confidence: 'observed' }, createdAt: now })
    const machineId = await ctx.db.insert('machines', {
      householdId, name: 'Laundry room', applianceType: 'front_load_washer', pool: 'available', location: 'shared', pricePerStart: 2.5,
      drumVolume: { amount: 4.5, unit: 'cu_ft' }, capacityUnits: 18, capacityConfidence: 'estimated',
      dispensingProfile: { placements: ['detergent_compartment', 'direct_to_drum'] }, provenance: { source: 'machine_taps', confidence: 'observed' }, createdAt: now,
    })
    const planId = await ctx.db.insert('plans', { householdId, createdBy: 'owner', plannerVersion: 'planner-v2.1', inputHash: 'hash', inputSnapshot: {}, result: {}, mode: 'rush', status: 'ready', createdAt: now })
    const sessionId = await ctx.db.insert('sessions', { householdId, planId, textileIds: [textileId], startedBy: 'owner', idempotencyKey: 'key', status: 'running', revision: 0, drumFullness: 'large', dryerFullness: 'medium' })

    const dose = { amount: 1, unit: 'cap', mark: '3' }
    const context = { soilLevel: 'heavy' as const, unrecordedSoil: false, applianceType: 'front_load_washer', machineClasses: ['front_load_washer', 'he'], washerClassKnown: true, cycles: ['delicate'], materials: [] }
    const timelineId = await ctx.db.insert('timelines', {
      householdId, sessionId, machineId, startedAt: now, status: 'pending', revision: 0, createdAt: now,
      actions: [
        { id: 'load-001:task:load', kind: 'task', task: 'load', phase: 'load', title: 'Load', detail: null, ...recorded },
        { id: 'load-001:task:drum_fullness', kind: 'task', task: 'drum_fullness', phase: 'drum_fullness', title: 'How full is the washer?', detail: null, ...recorded },
        {
          id: 'load-001:treatment:0', kind: 'treatment', phase: 'dispenser', supplyId, stage: 'wash', placement: 'detergent_compartment',
          dose: { amount: 0, unit: 'at_machine' }, timing: 'before starting', confidence: 'observed', machineTelemetry: false, offsetMinutes: null,
          atMachine: {
            machine: 'washer', context,
            candidates: [{ size: 'medium', ruleId: 'rule-1', row: 1, rowText: null, dose }, { size: 'large', ruleId: 'rule-2', row: 2, rowText: 'Large loads', dose: { ...dose, mark: '5' } }],
            resolvedSize: 'large', lineText: 'Large loads',
          },
          ...recorded,
        },
        { id: 'load-001:task:dryer_fullness', kind: 'task', task: 'dryer_fullness', phase: 'dryer_fullness', title: 'How full is the dryer?', detail: null, ...recorded },
      ],
    })

    const stepReminderId = await ctx.db.insert('reminders', { householdId, sessionId, actionId: 'load-001:task:load', status: 'scheduled', dueAt: now })
    const headsUpId = await ctx.db.insert('reminders', {
      householdId, kind: 'urgent_flag', status: 'scheduled', dueAt: now, recipientPrincipalKey: 'partner',
      textileIds: [textileId], flaggedBy: 'owner', flagKey: `${textileId}:${now}`, neededBy: now + 86_400_000, shownAt: now + 5,
    })
    const legacyHistoryId = await ctx.db.insert('history', { householdId, sessionId, textileId, ownerPrincipalKey: 'owner', event: 'washed', occurredAt: now, actorPrincipalKey: 'owner' })
    const closetHistoryId = await ctx.db.insert('history', { householdId, textileId, ownerPrincipalKey: 'owner', event: 'flagged', occurredAt: now, actorPrincipalKey: 'owner', details: { reasons: 'baby_mess,wet', neededBy: now + 1, alerted: true } })
    for (const event of ['worn', 'dropped_at_cleaner', 'picked_up', 'refreshed', 'hung', 'dried'] as const) {
      await ctx.db.insert('history', { householdId, textileId, ownerPrincipalKey: 'owner', event, occurredAt: now, actorPrincipalKey: 'owner' })
    }
    return { householdId, wearerId, accountWearerId, legacyTextileId, textileId, guestId, careId, supplyId, machineId, planId, sessionId, timelineId, stepReminderId, headsUpId, legacyHistoryId, closetHistoryId }
  })

  const rows = await t.run(async (ctx) => ({
    household: await ctx.db.get(ids.householdId),
    wearer: await ctx.db.get(ids.accountWearerId),
    legacyTextile: await ctx.db.get(ids.legacyTextileId),
    textile: await ctx.db.get(ids.textileId),
    guest: await ctx.db.get(ids.guestId),
    care: await ctx.db.get(ids.careId),
    supply: await ctx.db.get(ids.supplyId),
    machine: await ctx.db.get(ids.machineId),
    plan: await ctx.db.get(ids.planId),
    session: await ctx.db.get(ids.sessionId),
    timeline: await ctx.db.get(ids.timelineId),
    stepReminder: await ctx.db.get(ids.stepReminderId),
    headsUp: await ctx.db.get(ids.headsUpId),
    legacyHistory: await ctx.db.get(ids.legacyHistoryId),
    closetHistory: await ctx.db.get(ids.closetHistoryId),
    notReady: await ctx.db.query('textiles').withIndex('by_household_status', (q) => q.eq('householdId', ids.householdId).eq('status', 'hanging')).collect(),
    wearers: await ctx.db.query('wearers').withIndex('by_household', (q) => q.eq('householdId', ids.householdId)).collect(),
    textileHistory: await ctx.db.query('history').withIndex('by_textile', (q) => q.eq('textileId', ids.textileId)).collect(),
    inbox: await ctx.db.query('reminders').withIndex('by_recipient_status', (q) => q.eq('recipientPrincipalKey', 'partner').eq('status', 'scheduled')).collect(),
    byFlag: await ctx.db.query('reminders').withIndex('by_flag_key', (q) => q.eq('householdId', ids.householdId).eq('flagKey', `${ids.textileId}:1000`)).collect(),
  }))
  expect(rows.household).toMatchObject({ planning: { babySeparate: false }, closet: { notWornDays: 60, laundryPersonKey: 'partner' } })
  expect(rows.wearer).toMatchObject({ kind: 'adult', principalKey: 'partner' })
  expect(rows.wearers).toHaveLength(2)
  expect(rows.legacyTextile).not.toHaveProperty('statusSince')
  expect(rows.legacyTextile).not.toHaveProperty('flag')
  expect(rows.textile).toMatchObject({ kind: 'baby_bodysuit', wearerId: ids.wearerId, flag: { reasons: ['baby_mess', 'wet'], stainNote: 'Left knee' }, identity: { rnNumber: 'RN 123' } })
  expect(rows.guest).toMatchObject({ guest: true, flag: { reasons: [] } })
  expect(rows.notReady.map((textile) => textile.status)).toEqual(['hanging'])
  expect(rows.care).toMatchObject({ ironSteam: 'not_allowed', provenance: { source: 'tag_taps', confidence: 'observed' } })
  expect(rows.supply?.use).toBe('detergent')
  expect(rows.machine).toMatchObject({ location: 'shared', pricePerStart: 2.5, drumVolume: { amount: 4.5, unit: 'cu_ft' } })
  expect(rows.plan?.mode).toBe('rush')
  expect(rows.session).toMatchObject({ drumFullness: 'large', dryerFullness: 'medium' })
  expect(rows.timeline?.actions.map((action) => action.phase)).toEqual(['load', 'drum_fullness', 'dispenser', 'dryer_fullness'])
  const atMachine = rows.timeline?.actions.find((action) => action.kind === 'treatment')
  expect(atMachine?.kind === 'treatment' ? atMachine.atMachine : null).toMatchObject({ machine: 'washer', resolvedSize: 'large', candidates: [{ size: 'medium' }, { size: 'large', rowText: 'Large loads' }] })
  expect(rows.stepReminder).not.toHaveProperty('kind')
  expect(rows.stepReminder).toMatchObject({ sessionId: ids.sessionId, actionId: 'load-001:task:load' })
  expect(rows.headsUp).not.toHaveProperty('sessionId')
  expect(rows.inbox.map((reminder) => reminder._id)).toEqual([ids.headsUpId])
  expect(rows.byFlag.map((reminder) => reminder._id)).toEqual([ids.headsUpId])
  expect(rows.legacyHistory).not.toHaveProperty('details')
  expect(rows.closetHistory).not.toHaveProperty('sessionId')
  expect(rows.closetHistory?.details).toEqual({ reasons: 'baby_mess,wet', neededBy: 1_001, alerted: true })
  expect(rows.textileHistory).toHaveLength(8)
})

test('values outside the shared vocabulary are refused', async () => {
  const t = newBackend()
  await t.run(async (ctx) => {
    const householdId = await ctx.db.insert('households', { name: 'Home', createdBy: 'owner', createdAt: 1 })
    const collectionId = await ctx.db.insert('collections', { householdId, ownerPrincipalKey: 'owner', name: 'Closet', createdAt: 1 })
    const textile = { householdId, collectionId, ownerPrincipalKey: 'owner', name: 'Tee', status: 'clean' as const, washCount: 0, createdAt: 1 }
    await expect(ctx.db.insert('textiles', { ...textile, status: 'washing' as never })).rejects.toThrow()
    await expect(ctx.db.insert('textiles', { ...textile, kind: 'hat' as never })).rejects.toThrow()
    await expect(ctx.db.insert('textiles', { ...textile, flag: { reasons: ['spilled' as never], flaggedBy: 'owner', flaggedAt: 1 } })).rejects.toThrow()
    await expect(ctx.db.insert('wearers', { householdId, name: 'Rex', kind: 'dog' as never, createdAt: 1 })).rejects.toThrow()
  })
})

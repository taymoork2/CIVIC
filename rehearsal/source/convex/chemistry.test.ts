import { expect, test, vi } from 'vitest'
import { api } from './_generated/api'
import { canonicalPlannerInput } from './plans'
import { startLoad, intakeHousehold, label, newBackend, planFor, signedIn, finishSteps, washLoad } from './harness.testing'

test('recorded wash-alone and like-color instructions survive real intake and cannot be pinned or rushed together', async () => {
  const t = newBackend()
  const as = signedIn(t, 'care-separation')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateTextile, { textileId: home.towel, color: 'Black', colorGroup: 'black', firstWash: false })
  const selected = [home.shirt, home.towel]
  for (const instruction of ['Wash with like colors', 'Wash alone']) {
    await as.mutation(api.inventory.setCare, { textileId: home.shirt, material: 'cotton', washMethod: 'machine',
      cycle: 'normal', maxTemperatureC: 40, restrictions: [instruction], provenance: label('synthetic restriction label') })
    for (const pass of [{}, { mode: 'rush' as const }, { loadPins: selected.map((textileId) => ({ textileId, group: 1 })) }]) {
      const planned = await planFor(as, home.householdId, selected, pass)
      expect(planned.result.loads).toHaveLength(2)
      expect(planned.result.loads.every((load) => load.textileIds.length === 1)).toBe(true)
      expect(planned.loadStates.every((load) => load.startable)).toBe(true)
    }
  }
})

test('recording no-soak care invalidates a previously chosen soak and refuses both old and recomputed starts', async () => {
  const t = newBackend()
  const as = signedIn(t, 'care-no-soak')
  const home = await intakeHousehold(as)
  const supplyId = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Synthetic soak', kind: 'chemical',
    formulation: { form: 'liquid' }, safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [],
      pretreatment: { stainChemistry: 'surfactant', stainKinds: ['oil_grease'], dose: { amount: 10, unit: 'ml' }, timing: 'Synthetic instructions', safeMaterials: ['cotton'],
        soak: { waterLitres: 2, minimumMinutes: 1, maximumMinutes: 3, maximumTemperatureC: 30, transfer: 'Synthetic transfer' } } }, provenance: label('synthetic product label') })
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['food'], soilLevel: 'normal', stainReport: { kind: 'oil_grease', priorTreatmentAttempts: [] } })
  const pass = { pretreatmentChoices: [{ textileId: home.shirt, supplyId }] }
  const before = await planFor(as, home.householdId, [home.shirt], pass)
  expect(before.loadStates[0]?.startable).toBe(true)
  await as.mutation(api.inventory.setCare, { textileId: home.shirt, material: 'cotton', washMethod: 'machine', cycle: 'normal',
    maxTemperatureC: 40, restrictions: ['Do not soak'], provenance: label('synthetic garment label') })
  await expect(startLoad(as, { planId: before.planId, loadId: before.result.loads[0]!.id, idempotencyKey: 'old-soak' })).rejects.toThrow()
  const after = await planFor(as, home.householdId, [home.shirt], pass)
  expect(after.loadStates.every((load) => !load.startable)).toBe(true)
  expect(after.result.loads.every((load) => load.treatments.every((step) => !step.soak || step.confirmation !== 'confirmed'))).toBe(true)
  await expect(startLoad(as, { planId: after.planId, loadId: after.result.loads[0]!.id, idempotencyKey: 'forbidden-soak' })).rejects.toThrow()
})

test('a stored recipe from before the care-enforcement revision cannot start', async () => {
  const t = newBackend()
  const as = signedIn(t, 'old-planner')
  const home = await intakeHousehold(as)
  const planned = await planFor(as, home.householdId, [home.shirt])
  await t.run((ctx) => ctx.db.patch(planned.planId, { plannerVersion: 'planner-v2.7' }))
  await expect(startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'obsolete-planner' })).rejects.toThrow()
})

test('live stain and label safety intake reach planning, block conflicts, and invalidate earlier plans', async () => {
  const t = newBackend()
  const as = signedIn(t, 'chemistry-intake')
  const home = await intakeHousehold(as)
  const treatment = await as.mutation(api.inventory.createSupply, {
    householdId: home.householdId, name: 'Synthetic treatment fixture', kind: 'chemical', formulation: { form: 'liquid' },
    safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [], pretreatment: {
      stainChemistry: 'protease', stainKinds: ['protein'], dose: { amount: 10, unit: 'ml' }, timing: 'Test label directions', safeMaterials: ['cotton'], maximumTemperatureC: 30, maximumPH: 8,
    } }, provenance: label('synthetic pretreatment label'),
  })
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['food'], soilLevel: 'normal', stainNote: 'collar', stainReport: { kind: 'protein', priorTreatmentAttempts: [] } })
  const input = await t.run((ctx) => canonicalPlannerInput(ctx, home.householdId, [home.shirt], { mode: 'normal', loadPins: [], dismissedQuestions: [], excludedSupplyIds: [] }))
  expect(input.textiles?.[0]?.stainReport).toEqual({ kind: 'protein', priorTreatmentAttempts: [] })
  expect(input.supplies?.find((product) => product.id === treatment)?.applicationRules?.[0]).toMatchObject({ stainChemistry: 'protease', safeMaterials: ['cotton'], maximumPH: 8, placement: 'manual' })
  const choice = { pretreatmentChoices: [{ textileId: home.shirt, supplyId: treatment }] }
  const suggested = await planFor(as, home.householdId, [home.shirt])
  expect(suggested.result.reasons.some((reason) => reason.details.cause === 'pretreatment_choice_needed')).toBe(true)
  const ready = await planFor(as, home.householdId, [home.shirt], choice)
  expect(ready.result.status).toBe('ready')
  expect(ready.result.loads[0]?.treatments.find((step) => step.supplyId === treatment)).toMatchObject({ textileId: home.shirt, confirmation: 'confirmed', dose: { amount: 10, unit: 'ml' } })
  const listed = await as.query(api.inventory.list, { householdId: home.householdId })
  const saved = listed.supplies.find((product) => product.supplyId === treatment)!.safety!
  await as.mutation(api.inventory.updateSupply, { supplyId: treatment, safety: { ...saved, incompatibleSupplyIds: [home.detergent] } })
  expect((await as.query(api.plans.get, { planId: ready.planId }))?.status).toBe('stale')
  const blocked = await planFor(as, home.householdId, [home.shirt], choice)
  expect(blocked.result.reasons.some((reason) => reason.details.cause === 'chemical_combination_conflict')).toBe(true)
  expect(blocked.loadStates.every((load) => !load.startable)).toBe(true)
  const pair = blocked.result.reasons.find((reason) => reason.details.cause === 'chemical_combination_conflict')!
  const conflictItems = blocked.loadStates.flatMap((load) => load.blockedItems).filter((item) => item.reasonId === pair.id)
  expect(conflictItems.map((item) => item.source).sort((left, right) => left.id.localeCompare(right.id))).toEqual([{ kind: 'product', id: home.detergent }, { kind: 'product', id: treatment }].sort((left, right) => left.id.localeCompare(right.id)))
  expect(conflictItems.every((item) => item.kind === 'conflict' && item.blocking && item.supplyIds?.length === 2 && item.supplyIds.includes(treatment) && item.supplyIds.includes(home.detergent) && item.textileIds?.includes(home.shirt))).toBe(true)
  await as.mutation(api.inventory.updateSupply, { supplyId: treatment, safety: saved })
  const restored = await planFor(as, home.householdId, [home.shirt], choice)
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['food'], soilLevel: 'normal', stainNote: 'collar', stainReport: { kind: 'protein', priorTreatmentAttempts: ['Earlier cleaner'] } })
  expect((await as.query(api.plans.get, { planId: restored.planId }))?.status).toBe('stale')
  expect((await planFor(as, home.householdId, [home.shirt])).result.reasons.some((reason) => reason.details.cause === 'unknown_stain_report')).toBe(true)
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['food'], soilLevel: 'normal', stainReport: { kind: 'protein', priorTreatmentAttempts: [] } })
  const final = await planFor(as, home.householdId, [home.shirt], choice)
  const { sessionId } = await startLoad(as, { planId: final.planId, loadId: final.result.loads[0]!.id, idempotencyKey: 'pretreatment-order' })
  const detail = await as.query(api.execution.sessionDetail, { sessionId })
  expect(detail.actions[0]).toMatchObject({ kind: 'treatment', phase: 'drum', textileId: home.shirt, textileName: 'White tee', temperatureC: 20, timing: 'Cold rinse first. Test label directions' })
  expect(detail.actions.findIndex((action) => action.kind === 'task' && action.task === 'load')).toBeGreaterThan(0)
})

test('unknown product chemistry asks a resolvable label question; names never provide the answer', async () => {
  const t = newBackend()
  const as = signedIn(t, 'unknown-chemistry')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, name: 'Oxi chlorine oxygen bleach', safety: { bleachKind: 'unknown', incompatibleSupplyIds: [], incompatibleMaterials: [] } })
  const pending = await planFor(as, home.householdId, [home.shirt])
  expect(await as.query(api.plans.questions, { planId: pending.planId })).toMatchObject([{ kind: 'product_safety', product: { supplyId: home.detergent } }])
  expect(pending.loadStates.every((load) => !load.startable)).toBe(true)
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] } })
  expect((await planFor(as, home.householdId, [home.shirt])).result.status).toBe('ready')
})

test('safety boundaries reject cross-household references, self references and invalid chemistry limits', async () => {
  const t = newBackend()
  const as = signedIn(t, 'chemistry-boundaries')
  const home = await intakeHousehold(as)
  const other = await intakeHousehold(signedIn(t, 'other-household'))
  for (const id of [other.detergent, home.detergent]) {
    await expect(as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, safety: { bleachKind: 'none', incompatibleSupplyIds: [id], incompatibleMaterials: [] } })).rejects.toThrow('another product in this household')
    await expect(as.mutation(api.inventory.saveRule, { supplyId: home.detergent, dose: { amount: 1, unit: 'ml' }, stage: 'wash', placement: 'direct_to_drum', timing: 'Test', incompatibleSupplyIds: [id], provenance: label('test') })).rejects.toThrow('another product in this household')
  }
  await expect(as.mutation(api.inventory.saveRule, { supplyId: home.detergent, dose: { amount: 1, unit: 'ml' }, stage: 'prewash', placement: 'manual', timing: 'Test', maximumPH: 15, provenance: label('test') })).rejects.toThrow('between 0 and 14')
  await expect(as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['worn'], soilLevel: 'normal', stainReport: { kind: 'protein', priorTreatmentAttempts: [] } })).rejects.toThrow('stain reason')
})

test('lipase needs exact-pack evidence; generic enzymes and renamed formulations cannot authorize it', async () => {
  const t = newBackend()
  const as = signedIn(t, 'lipase-evidence')
  const home = await intakeHousehold(as)
  const safety = { bleachKind: 'none' as const, incompatibleSupplyIds: [], incompatibleMaterials: [], ingredients: ['enzymes'], pretreatment: { stainChemistry: 'lipase' as const, stainKinds: ['oil_grease' as const], dose: { amount: 10, unit: 'ml' }, timing: 'Synthetic label directions', safeMaterials: ['cotton'] } }
  const product = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Synthetic enzyme pack', kind: 'chemical', formulation: { form: 'liquid' }, safety, provenance: label('synthetic label') })
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['food'], soilLevel: 'normal', stainReport: { kind: 'oil_grease', priorTreatmentAttempts: [] } })
  const choices = { pretreatmentChoices: [{ textileId: home.shirt, supplyId: product }] }
  expect((await planFor(as, home.householdId, [home.shirt], choices)).result.status).not.toBe('ready')
  await expect(as.mutation(api.inventory.updateSupply, { supplyId: product, safety: { ...safety, lipase: { status: 'present', formulation: '', source: '' } } })).rejects.toThrow('exact formulation')
  await as.mutation(api.inventory.updateSupply, { supplyId: product, safety: { ...safety, lipase: { status: 'present', formulation: 'Synthetic pack v1 / US / test-code', source: 'Synthetic manufacturer ingredient record' } } })
  expect((await planFor(as, home.householdId, [home.shirt], choices)).result.status).toBe('ready')
  await as.mutation(api.inventory.updateSupply, { supplyId: product, name: 'Different enzyme pack' })
  expect((await planFor(as, home.householdId, [home.shirt], choices)).result.status).not.toBe('ready')
})

test('a soak records measured water once, enforces time and temperature, and preserves applied facts', async () => {
  vi.useFakeTimers()
  try {
    const t = newBackend()
    const as = signedIn(t, 'measured-soak')
    const home = await intakeHousehold(as)
    const product = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Synthetic soak v1', kind: 'chemical', formulation: { form: 'liquid' }, safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [], pretreatment: { stainChemistry: 'surfactant', stainKinds: ['oil_grease'], dose: { amount: 10, unit: 'ml' }, timing: 'Synthetic soak label', safeMaterials: ['cotton'], soak: { waterLitres: 2, minimumMinutes: 1, maximumMinutes: 3, maximumTemperatureC: 30, transfer: 'Synthetic transfer directions' } } }, provenance: label('synthetic label') })
    await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['food'], soilLevel: 'normal', stainReport: { kind: 'oil_grease', priorTreatmentAttempts: [] } })
    const planned = await planFor(as, home.householdId, [home.shirt], { pretreatmentChoices: [{ textileId: home.shirt, supplyId: product }] })
    const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'soak' })
    const action = (await as.query(api.execution.sessionDetail, { sessionId })).actions[0]!
    const start = (waterLitres: number, temperatureC = 20) => as.mutation(api.actions.beginSoak, { sessionId, actionId: action.id, waterLitres, temperatureC })
    await expect(signedIn(t, 'soak-outsider').mutation(api.actions.beginSoak, { sessionId, actionId: action.id, waterLitres: 4, temperatureC: 20 })).rejects.toThrow()
    await expect(start(0)).rejects.toThrow('water volume')
    await expect(start(4, 31)).rejects.toThrow('temperature limit')
    await start(4)
    await start(4)
    await expect(start(3)).rejects.toThrow('already has recorded measurements')
    const finish = () => as.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status: 'confirmed', usage: { supplyId: product, amount: 20, unit: 'ml', placement: 'manual' } })
    await expect(finish()).rejects.toThrow('minimum soak time')
    await as.mutation(api.inventory.updateSupply, { supplyId: product, name: 'Renamed after use' })
    vi.setSystemTime(Date.now() + 60_000)
    await finish()
    await finishSteps(as, sessionId)
    await as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'soak' })
    const records = await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt })
    expect(records[0]!.products.filter((entry) => entry.placement === 'manual')).toEqual([{ name: 'Synthetic soak v1', amount: 20, unit: 'ml', placement: 'manual' }])
    expect(records[0]!.soaks).toMatchObject([{ productName: 'Synthetic soak v1', waterLitres: 4, temperatureC: 20, amount: 20, minimumMinutes: 1, maximumMinutes: 3, transfer: 'Synthetic transfer directions', status: 'confirmed' }])
    expect(records[0]!.activityContext?.products.find((entry) => entry.supplyId === product)?.context)
      .toMatchObject({ formulation: { form: 'liquid' }, safety: { pretreatment: { soak: { waterLitres: 2, minimumMinutes: 1, maximumMinutes: 3 } } } })
    const uses = await t.run((ctx) => ctx.db.query('usage').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).collect())
    expect(uses.filter((use) => use.supplyId === product)).toHaveLength(1)
    await as.mutation(api.closet.flagDirty, { textileIds: [home.towel], reasons: ['food'], soilLevel: 'normal', stainReport: { kind: 'oil_grease', priorTreatmentAttempts: [] } })
    const second = await planFor(as, home.householdId, [home.towel], { pretreatmentChoices: [{ textileId: home.towel, supplyId: product }] })
    const { sessionId: nextSessionId } = await startLoad(as, { planId: second.planId, loadId: second.result.loads[0]!.id, idempotencyKey: 'overdue-soak' })
    const next = { sessionId: nextSessionId }
    const nextAction = (await as.query(api.execution.sessionDetail, next)).actions[0]!
    await as.mutation(api.actions.beginSoak, { ...next, actionId: nextAction.id, waterLitres: 2, temperatureC: 20 })
    vi.setSystemTime(Date.now() + 4 * 60_000)
    await expect(as.mutation(api.actions.recordAction, { ...next, actionId: nextAction.id, status: 'confirmed', usage: { supplyId: product, amount: 10, unit: 'ml', placement: 'manual' } })).rejects.toThrow('maximum soak time')
    await as.mutation(api.actions.recordAction, { ...next, actionId: nextAction.id, status: 'missed' })
    expect((await as.query(api.execution.sessionDetail, next)).actions[0]!.status).toBe('missed')
    expect((await t.run((ctx) => ctx.db.query('usage').withIndex('by_session', (q) => q.eq('sessionId', next.sessionId)).collect()))[0]!.amount).toBe(10)
  } finally { vi.useRealTimers() }
})

test('observations survive stain review and washing; outcomes are household-scoped and do not mutate recipes', async () => {
  const t = newBackend()
  const as = signedIn(t, 'wash-observations')
  const home = await intakeHousehold(as)
  const observation = { problem: 'waxy' as const, timing: 'during_storage' as const, recurring: true, previousWash: 'Synthetic softener history and slow drying' }
  await as.mutation(api.closet.flagDirty, { textileIds: [home.towel], reasons: ['food'], soilLevel: 'heavy', observation, neededBy: Date.now() + 86_400_000, stainReport: { kind: 'oil_grease', priorTreatmentAttempts: [] } })
  await as.mutation(api.closet.flagDirty, { textileIds: [home.towel], reasons: [], soilLevel: 'light', stainOnly: true, stainReport: { kind: 'protein', priorTreatmentAttempts: [] } })
  expect((await as.query(api.inventory.list, { householdId: home.householdId })).textiles.find((entry) => entry.textileId === home.towel)).toMatchObject({ soilLevel: 'heavy', flag: { observation, reasons: ['food'] } })
  await as.mutation(api.closet.flagDirty, { textileIds: [home.towel], reasons: [], soilLevel: 'light', stainOnly: true, clearObservation: true, stainReport: { kind: 'protein', priorTreatmentAttempts: [] } })
  expect((await as.query(api.inventory.list, { householdId: home.householdId })).textiles.find((entry) => entry.textileId === home.towel)?.flag?.observation).toBeUndefined()
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['smell'], soilLevel: 'normal', observation })
  await washLoad(as, home.householdId, [home.shirt])
  const record = (await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt }))[0]!
  expect(record.observation).toEqual(observation)
  const plansBefore = await t.run((ctx) => ctx.db.query('plans').collect())
  const assessment = { recordId: record._id, dimension: 'overall' as const, result: 'worse' as const, checkedWhen: 'after_wearing' as const, expectedRevision: 0, receiptId: 'chemistry-reassessment' }
  await expect(signedIn(t, 'outsider').mutation(api.outcomeAssessments.save, assessment)).rejects.toThrow()
  await as.mutation(api.outcomeAssessments.save, { ...assessment, note: 'Synthetic reassessment' })
  const after = (await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt }))[0]!
  expect(after.assessments).toEqual([expect.objectContaining({ dimension: 'overall', result: 'worse', checkedWhen: 'after_wearing' })])
  expect(after.products).toEqual(record.products)
  expect(await t.run((ctx) => ctx.db.query('plans').collect())).toEqual(plansBefore)
})

test('wash context preserves identity, care, machine and applied formulation after later edits', async () => {
  const t = newBackend()
  const as = signedIn(t, 'historical-context')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateTextile, { textileId: home.shirt, kind: 't_shirt', identity: { brand: 'Generic', styleNumber: 'pack-A', size: 'L' } })
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['worn'], soilLevel: 'heavy', observation: { problem: 'odor', timing: 'after_wearing', recurring: true } })
  const planned = await planFor(as, home.householdId, [home.shirt, home.towel])
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'history-context' })
  await finishSteps(as, sessionId)
  await as.mutation(api.inventory.updateTextile, { textileId: home.shirt, name: 'Renamed tee', identity: { brand: 'Different brand' } })
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, name: 'Replacement formula', formulation: { name: 'New formula', form: 'powder' } })
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, name: 'Renamed washer', model: 'Different model' })
  await as.mutation(api.inventory.setCare, { textileId: home.shirt, material: 'polyester', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, restrictions: [], provenance: label('Later care correction') })
  await as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'history-context' })
  const records = await t.run((ctx) => ctx.db.query('washRecords').collect())
  const shirt = records.find((record) => record.textileId === home.shirt)!
  expect(shirt.activityContext).toMatchObject({ version: 2, independentWashId: sessionId, quantity: 1,
    garment: { name: 'White tee', kind: 't_shirt', colorGroup: 'light', soilLevel: 'heavy', observation: { problem: 'odor', timing: 'after_wearing', recurring: true }, identity: { brand: 'Generic', styleNumber: 'pack-A', size: 'L' },
      care: { material: 'cotton', maxTemperatureC: 40, provenance: label('care label read at intake') } },
    washer: { name: 'Top loader', model: 'SWNNX2', applianceType: 'top_load_washer', capacityUnits: 8, cycleProfile: { cycles: { normal: { durationMinutes: 40 } } }, telemetry: false },
    products: [{ supplyId: home.detergent, amount: 30, unit: 'ml', placement: 'detergent_compartment', status: 'confirmed', context: { formulation: { name: 'HE liquid', form: 'liquid' }, provenance: label('Tide bottle label') } }],
    treatments: [{ supplyId: home.detergent, placement: 'detergent_compartment', dose: { amount: 30, unit: 'ml' }, status: 'confirmed' }], washGoals: ['ordinary'], advice: [],
  })
  expect(shirt.washerName).toBe('Top loader')
  expect(shirt.products[0]!.name).toBe('Tide HE liquid')
  expect(records).toHaveLength(2)
  expect(new Set(records.map((record) => record.activityContext!.independentWashId)).size).toBe(1)
  await as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'history-context' })
  expect(await t.run((ctx) => ctx.db.query('washRecords').collect())).toHaveLength(2)
  await expect(signedIn(t, 'outside-history').query(api.sessions.washRecordsForTextile, { textileId: home.shirt })).rejects.toThrow()
})

test('a stain that stayed gets one more try with a different product, never the same one, and silk goes to a cleaner', async () => {
  const t = newBackend()
  const as = signedIn(t, 'stain-second-try')
  const home = await intakeHousehold(as)
  const pretreat = (name: string, stainChemistry: 'protease' | 'oxygen_bleach') => as.mutation(api.inventory.createSupply, { householdId: home.householdId, name, kind: 'chemical',
    formulation: { form: 'liquid' }, safety: { bleachKind: stainChemistry === 'oxygen_bleach' ? 'oxygen' : 'none', incompatibleSupplyIds: [], incompatibleMaterials: [], pretreatment: {
      stainChemistry, stainKinds: ['protein'], dose: { amount: 10, unit: 'ml' }, timing: 'Test label directions', safeMaterials: ['cotton'], maximumTemperatureC: 30, maximumPH: 8,
    } }, provenance: label(`${name} label`) })
  const enzyme = await pretreat('Enzyme spray', 'protease')
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['food'], soilLevel: 'normal', stainReport: { kind: 'protein', priorTreatmentAttempts: [] } })
  const first = await planFor(as, home.householdId, [home.shirt], { pretreatmentChoices: [{ textileId: home.shirt, supplyId: enzyme }] })
  const { sessionId } = await startLoad(as, { planId: first.planId, loadId: first.result.loads[0]!.id, idempotencyKey: 'first-try' })
  await finishSteps(as, sessionId)
  await as.mutation(api.sessions.complete, { sessionId, planInputHash: first.inputHash, idempotencyKey: 'first-try' })
  // The wash records what it tried as the product and its chemistry, not only a name.
  const tried = [{ name: 'Enzyme spray', supplyId: enzyme, chemistry: 'protease' as const, washedOut: true as const }]
  expect((await t.run(async (ctx) => (await ctx.db.get(home.shirt))!.stainCheck))?.tried).toEqual(tried)
  await as.mutation(api.closet.answerStainCheck, { textileIds: [home.shirt], answer: 'still_there' })
  await t.run(async (ctx) => ctx.db.patch(home.shirt, { status: 'clean' }))
  await as.mutation(api.closet.resolveStain, { textileIds: [home.shirt], choice: 'try_again' })
  expect((await t.run(async (ctx) => (await ctx.db.get(home.shirt))!.flag))?.stainReport).toEqual({ kind: 'protein', priorTreatmentAttempts: tried })
  // Only the product already tried: cotton may try again, but nothing on the shelf is a safe different try.
  const nothingLeft = await planFor(as, home.householdId, [home.shirt])
  expect(nothingLeft.result.reasons.map((reason) => reason.details.cause)).toContain('stain_retry_unavailable')
  expect(nothingLeft.result.reasons.map((reason) => reason.details.cause)).not.toContain('unknown_stain_report')
  const oxygen = await pretreat('Oxygen soak', 'oxygen_bleach')
  const second = await planFor(as, home.householdId, [home.shirt])
  expect(second.result.reasons.find((reason) => reason.details.cause === 'pretreatment_choice_needed')?.supplyId).toBe(oxygen)
  // A person can keep the app's record on a stain review, but never write one.
  await expect(as.mutation(api.closet.flagDirty, { textileIds: [home.towel], reasons: ['food'], soilLevel: 'normal', stainReport: { kind: 'protein', priorTreatmentAttempts: tried } })).rejects.toThrow('in words')
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['food'], soilLevel: 'normal', stainOnly: true, stainReport: { kind: 'protein', priorTreatmentAttempts: tried } })
  // A general re-save of the same flag may keep the record too.
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['food'], soilLevel: 'heavy', stainReport: { kind: 'protein', priorTreatmentAttempts: tried } })
  // The client's echo may order its keys differently; the record is still the same.
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['food'], soilLevel: 'normal', stainOnly: true, stainReport: { kind: 'protein', priorTreatmentAttempts: [{ washedOut: true, chemistry: 'protease', supplyId: enzyme, name: 'Enzyme spray' }] } })

  // Silk gets no second home try: the cleaner is the next step.
  await as.mutation(api.inventory.setCare, { textileId: home.towel, material: 'silk', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, restrictions: [], provenance: label('silk label') })
  await t.run(async (ctx) => ctx.db.patch(home.towel, { stainCheck: { reason: 'food', kind: 'protein', tried, washes: 1, washedAt: Date.now(), answer: 'still_there' } }))
  await expect(as.mutation(api.closet.resolveStain, { textileIds: [home.towel], choice: 'try_again' })).rejects.toThrow('had its tries')
})

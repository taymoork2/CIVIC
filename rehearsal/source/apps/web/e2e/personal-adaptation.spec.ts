import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import type { Id } from '@convex/_generated/dataModel'
import { api } from '../src/api'
import { convexAs, createHousehold, freshPage, joinWithCode, signUp } from './flows'

test('authenticated personal matching and prospective choices respect corrections, sessions and private controls', async ({ browser }, testInfo) => {
  const page = await freshPage(browser), member = await freshPage(browser)
  try {
    await signUp(page, 'personal-matching', 'Synthetic Personal')
    await createHousehold(page)
    const { client, householdId } = await convexAs(page)
    const evidence = { source: 'synthetic test label', confidence: 'verified' as const }
    const textileId = await client.mutation(api.inventory.createTextile, { householdId, name: 'Synthetic matching tee', color: 'White', colorGroup: 'light', firstWash: false, soilLevel: 'normal' })
    await client.mutation(api.inventory.updateTextile, { textileId, kind: 't_shirt', status: 'dirty', soilLevel: 'normal' })
    await client.mutation(api.inventory.setCare, { textileId, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, restrictions: [], provenance: evidence })
    await client.mutation(api.garmentAdvice.setDecoration, { textileIds: [textileId], facts: { kind: 'none', method: 'unknown', manufacturer: '', source: 'synthetic inspection', confidence: 'observed' }, expectedRevisions: [{ textileId, revision: 0 }] })
    const supplyId = await client.mutation(api.inventory.createSupply, { householdId, name: 'Synthetic exact detergent', kind: 'chemical', use: 'detergent',
      formulation: { name: 'Synthetic formula', form: 'liquid' }, provenance: evidence,
      safety: { bleachKind: 'none', incompatibleMaterials: [], incompatibleSupplyIds: [], capabilities: [{ kind: 'soil_dispersal', status: 'present',
        variant: 'Synthetic formula', market: 'US', formulationRevision: 'fixture-1', source: 'synthetic disclosure', retrievedAt: Date.now(), scope: 'ingredient_disclosure' }] } })
    await client.mutation(api.inventory.saveRule, { supplyId, stage: 'wash', placement: 'detergent_compartment', timing: 'before cycle start', dose: { amount: 30, unit: 'ml' }, provenance: evidence })
    const evidenceOnlyId = await client.mutation(api.inventory.createSupply, { householdId, name: 'Synthetic evidence-only addition', kind: 'chemical', use: 'booster',
      formulation: { name: 'Synthetic unreported formula', form: 'liquid' }, provenance: evidence,
      safety: { bleachKind: 'none', incompatibleMaterials: [], incompatibleSupplyIds: [], capabilities: [{ kind: 'soil_dispersal', status: 'present',
        variant: 'Synthetic unreported formula', market: 'US', formulationRevision: 'fixture-1', source: 'synthetic unreported disclosure', retrievedAt: Date.now(), scope: 'ingredient_disclosure' }] } })
    await client.mutation(api.inventory.saveRule, { supplyId: evidenceOnlyId, stage: 'wash', placement: 'direct_to_drum', timing: 'before loading garments', dose: { amount: 20, unit: 'ml' }, provenance: evidence })
    const additionId = await client.mutation(api.inventory.createSupply, { householdId, name: 'Synthetic optional addition', kind: 'chemical', use: 'booster',
      formulation: { name: 'Synthetic addition formula', form: 'liquid' }, provenance: evidence,
      safety: { bleachKind: 'none', incompatibleMaterials: [], incompatibleSupplyIds: [], capabilities: [{ kind: 'soil_dispersal', status: 'present',
        variant: 'Synthetic addition formula', market: 'US', formulationRevision: 'fixture-1', source: 'synthetic addition disclosure', retrievedAt: Date.now(), scope: 'ingredient_disclosure' }] } })
    await client.mutation(api.inventory.saveRule, { supplyId: additionId, stage: 'wash', placement: 'direct_to_drum', timing: 'before loading garments', dose: { amount: 20, unit: 'ml' }, provenance: evidence })
    const machineId = await client.mutation(api.inventory.createMachine, { householdId, name: 'Synthetic washer', model: 'fixture-1', applianceType: 'top_load_washer', highEfficiency: false,
      capacityUnits: 8, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['detergent_compartment', 'direct_to_drum'], cycleMinutes: { normal: 40 }, provenance: evidence })
    const records: Id<'washRecords'>[] = []
    for (let wash = 0; wash < 3; wash++) {
      await client.mutation(api.inventory.updateTextile, { textileId, status: 'dirty', soilLevel: 'normal' })
      const { planId } = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: [textileId], optionalSupplyIds: [additionId], washGoals: ['odor'], clientInputHash: 'synthetic-personal-draft' })
      const planned = await client.query(api.plans.get, { planId })
      const loadId = planned!.result.loads[0]!.id
      await client.mutation(api.plans.confirmRecipe, { planId, loadId, machineId })
      const idempotencyKey = `personal-browser-wash-${wash}`
      const { sessionId } = await client.mutation(api.execution.start, { planId, loadId, idempotencyKey })
      for (let stepNumber = 0; stepNumber < 30; stepNumber++) {
        const detail = await client.query(api.execution.sessionDetail, { sessionId })
        const step = detail.actions.find((action) => action.status === 'pending')
        if (step === undefined) break
        if (step.kind === 'task' && step.task === 'drum_fullness') await client.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'medium' })
        else if (step.kind === 'task') await client.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed', ...(step.task === 'start' ? { minutes: 40 } : {}) })
        else await client.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: step.dose.amount > 0 ? 'confirmed' : 'skipped',
          ...(step.dose.amount > 0 ? { usage: { supplyId: step.supplyId as Id<'supplies'>, amount: step.dose.amount, unit: step.dose.unit, placement: step.placement } } : {}) })
      }
      await client.mutation(api.sessions.complete, { sessionId, planInputHash: planned!.inputHash, idempotencyKey })
      const recordId = (await client.query(api.sessions.washRecordsForTextile, { textileId }))[0]!._id
      records.push(recordId)
      await client.mutation(api.outcomeAssessments.save, { recordId, dimension: 'odor', checkedWhen: 'after_wash', result: 'improved', expectedRevision: 0, receiptId: `personal-browser-result-${wash}` })
    }
    const args = { recordId: records[2]!, supplyId, dimension: 'odor' as const, checkedWhen: 'after_wash' as const, selectedTextileIds: [textileId] }
    const historyStarted = performance.now()
    await client.query(api.sessions.washRecordsForTextile, { textileId })
    const baselineHistoryMs = performance.now() - historyStarted
    const summaryStarted = performance.now()
    const summary = await client.query(api.personalAdaptation.forRecord, args)
    const matchingSummaryMs = performance.now() - summaryStarted
    await client.mutation(api.inventory.updateTextile, { textileId, status: 'dirty', soilLevel: 'normal' })
    const { planId: upcomingId } = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: [textileId], washGoals: ['odor'], clientInputHash: 'synthetic-personal-upcoming' })
    const upcoming = (await client.query(api.plans.get, { planId: upcomingId }))!
    const proposalArgs = { planId: upcomingId, loadId: upcoming.result.loads[0]!.id, supplyIds: [additionId], dimension: 'odor' as const, checkedWhen: 'after_wash' as const }
    const prospectiveStarted = performance.now()
    const prospective = await client.query(api.personalSuggestions.forPlan, proposalArgs)
    const prospectiveMatchingMs = performance.now() - prospectiveStarted
    expect(prospective.candidates[0]).toMatchObject({ eligible: true, guidance: { direction: 'reported_improvement' } })
    expect(prospective.candidates[0]!.summaries[0]).toMatchObject({ counts: { independentWashes: 3, improved: 3 } })
    const previewStarted = performance.now()
    const privatePlanner = await client.query(api.personalSuggestions.plannerPreview, proposalArgs)
    const privatePlannerMs = performance.now() - previewStarted
    expect(privatePlanner.result.inputSnapshot.personalSuggestions).toMatchObject({ evidenceInputHash: upcoming.inputHash, comparisonInputHash: prospective.inputHash })
    expect(privatePlanner.result.loads[0]!.personalSuggestions!.choices[0]).toMatchObject({ supplyId: additionId, selected: false, suppressed: false, guidance: { direction: 'reported_improvement' } })
    expect(privatePlanner.result.loads[0]!.treatments).toEqual(upcoming.result.loads[0]!.treatments)
    const savedStarted = performance.now()
    const savedArgs = { ...proposalArgs, previewInputHash: privatePlanner.result.inputHash, expectedRevision: 0 }
    const saved = await client.mutation(api.personalSuggestions.savePreview, savedArgs)
    expect(saved).toMatchObject({ revision: 1, replay: false })
    expect(await client.mutation(api.personalSuggestions.savePreview, savedArgs)).toEqual({ ...saved, replay: true })
    await page.reload()
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Laundry', exact: true })).toBeVisible()
    const reloadedClient = (await convexAs(page)).client
    const restored = await reloadedClient.query(api.personalSuggestions.savedForPlan, { planId: upcomingId, loadId: proposalArgs.loadId })
    expect(restored).toMatchObject({ status: 'current', guidanceId: saved.guidanceId, inputHash: privatePlanner.result.inputHash })
    if (restored?.status !== 'current') throw new Error('Expected restored private guidance')
    expect(restored.result).toEqual(privatePlanner.result)
    const savedGuidanceRoundTripMs = performance.now() - savedStarted
    expect((await client.query(api.plans.get, { planId: upcomingId }))!.pass.optionalSupplyIds).toEqual([])
    expect(summary).toMatchObject({ status: 'repeated_pattern', counts: { independentWashes: 3, improved: 3 }, recordsConsidered: 3 })
    expect(await client.query(api.personalAdaptation.forRecord, args)).toEqual(summary)
    // Exercise the actual caller-private interface without changing the execution plan.
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto(`/laundry?plan=${upcomingId}`)
    const benefits = page.getByRole('region', { name: 'Optional product benefit', exact: true })
    await expect(benefits).toContainText('Current saved private guidance orders optional suggestions only.')
    await expect(benefits).toContainText('Reported improvement')
    expect(await benefits.getByRole('checkbox').evaluateAll((elements) => elements.map((element) => element.closest('label')?.textContent?.trim()))).toEqual([
      'Use Synthetic optional addition', 'Use Synthetic evidence-only addition',
    ])
    await expect(benefits.getByRole('checkbox', { name: 'Use Synthetic evidence-only addition', exact: true })).not.toBeChecked()
    await expect(benefits.getByRole('checkbox', { name: 'Use Synthetic optional addition', exact: true })).not.toBeChecked()
    await benefits.getByText('Why these private suggestions?', { exact: true }).focus()
    await page.keyboard.press('Enter')
    const savedComparison = benefits.getByRole('region', { name: 'Private comparison: Synthetic optional addition', exact: true })
    await savedComparison.getByText('Influencing observations and limits', { exact: true }).click()
    await expect(savedComparison).toContainText('3 independent washes')
    await expect(savedComparison).toContainText('Independent wash 1')
    const disclosure = page.getByText('Your private product guidance', { exact: true })
    await disclosure.focus()
    await page.keyboard.press('Enter')
    const guidance = page.getByRole('region', { name: 'Private product guidance', exact: true })
    await expect(guidance).toContainText('Private guidance saved.')
    await guidance.getByLabel('What result should this comparison use?').selectOption('odor')
    await guidance.getByRole('checkbox', { name: 'Compare Synthetic optional addition', exact: true }).click()
    await expect(guidance).toContainText('Reported improvement')
    await guidance.getByText('Influencing observations and limits', { exact: true }).click()
    await expect(guidance).toContainText('3 independent washes')
    await expect(guidance).toContainText('Independent wash 1')
    await expect(guidance).toContainText('Not selected for this wash.')
    const saveGuidance = guidance.getByRole('button', { name: 'Save private guidance', exact: true })
    await expect(saveGuidance).toBeDisabled()
    await guidance.getByRole('button', { name: 'Review current guidance', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(saveGuidance).toBeEnabled()
    await saveGuidance.click()
    await expect(guidance).toContainText('Your wash choices and recipe are unchanged.')
    await guidance.getByLabel('When was the result checked?').selectOption('after_drying')
    // An unsaved comparison draft does not replace the saved main recommendation.
    await expect(benefits).toContainText('Reported improvement')
    await expect(saveGuidance).toBeDisabled()
    await expect(guidance).toContainText('Comparison or saved guidance changed.')
    await expect(guidance).toContainText('No influencing observations for this comparison.')
    await guidance.getByLabel('When was the result checked?').selectOption('after_wash')
    await page.getByText('Personal influence controls', { exact: true }).click()
    const globalControl = page.getByRole('region', { name: 'Personal influence: All my clothing in this household', exact: true })
    const globalEnabled = globalControl.getByRole('checkbox')
    await globalEnabled.focus()
    await page.keyboard.press('Space')
    await expect(globalEnabled).not.toBeChecked()
    await expect(benefits).toContainText('Showing recorded product evidence.')
    await expect(benefits).not.toContainText('Reported improvement')
    await expect(benefits).not.toContainText('Independent wash 1')
    await expect(guidance).toContainText('Saved guidance is stale.')
    await expect(globalControl).toContainText('Personal influence disabled')
    await expect(guidance).not.toContainText('Independent wash 1')
    await guidance.getByRole('button', { name: 'Review current guidance', exact: true }).click()
    await saveGuidance.click()
    await expect(benefits).toContainText('Personal influence is disabled. Showing recorded product evidence.')
    await expect(benefits).not.toContainText('Why these private suggestions?')
    await globalEnabled.click()
    await expect(globalEnabled).toBeChecked()
    await expect(guidance).toContainText('3 independent washes')
    // Restore a reviewed current saved result after changing the controls.
    await guidance.getByRole('button', { name: 'Review current guidance', exact: true }).click()
    await saveGuidance.click()
    await expect(benefits).toContainText('Current saved private guidance orders optional suggestions only.')
    await expect(benefits).toContainText('Reported improvement')
    const comparisonPanel = guidance.getByRole('region', { name: 'Private comparison: Synthetic optional addition', exact: true })
    if (!await comparisonPanel.locator('details').evaluate((element) => (element as HTMLDetailsElement).open)) await comparisonPanel.getByText('Influencing observations and limits', { exact: true }).click()
    await expect(comparisonPanel.getByText('Independent wash 1', { exact: false })).toBeVisible()
    for (const [name, width, scale, theme] of [['phone', 390, 1, 'light'], ['narrow-dark-large', 320, 2, 'dark'], ['wide', 1024, 1, 'light']] as const) {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
      expect(await guidance.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      expect(await benefits.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      for (const control of await benefits.locator('select:visible, summary:visible, label:has([role="checkbox"]):visible').all()) {
        expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44)
      }
      await benefits.screenshot({ path: testInfo.outputPath(`personal-main-suggestions-${name}.png`) })
      for (const control of await guidance.locator('button:visible, select:visible, summary:visible, label:has([role="checkbox"]):visible').all()) {
        const bounds = await control.boundingBox()
        expect(bounds?.height).toBeGreaterThanOrEqual(44)
      }
      await guidance.getByLabel('What result should this comparison use?').scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath(`personal-guidance-${name}.png`) })
      await comparisonPanel.screenshot({ path: testInfo.outputPath(`personal-guidance-${name}-observations.png`) })
      const lastReport = comparisonPanel.getByText('Independent wash 3', { exact: false })
      // Playwright's default treats content behind a fixed footer as in view.
      // Center this report to verify that normal scrolling can clear the action.
      await lastReport.evaluate((element) => element.scrollIntoView({ block: 'center' }))
      const reportBounds = (await lastReport.boundingBox())!
      const actionBounds = (await page.getByRole('button', { name: 'I’m at the laundry room', exact: true }).boundingBox())!
      expect(reportBounds.y + reportBounds.height).toBeLessThanOrEqual(actionBounds.y)
      await page.screenshot({ path: testInfo.outputPath(`personal-guidance-${name}-reports.png`) })
    }
    expect((await client.query(api.plans.get, { planId: upcomingId }))!.result).toEqual(upcoming.result)
    const querySamplePath = testInfo.outputPath('personal-matching-query-sample.json')
    await writeFile(querySamplePath, JSON.stringify({ baselineHistoryMs, matchingSummaryMs, prospectiveMatchingMs, privatePlannerMs, savedGuidanceRoundTripMs,
      personalPlannerPolicyVersion: privatePlanner.result.loads[0]!.personalSuggestions!.policyVersion, plannerVersion: privatePlanner.result.plannerVersion, proposalPolicyVersion: prospective.proposalPolicyVersion,
      recordsConsidered: summary.recordsConsidered, policyVersion: summary.policyVersion, historyTruncated: summary.historyTruncated, negativeHistoryTruncated: summary.negativeHistoryTruncated }))
    await testInfo.attach('personal-matching-query-sample', { path: querySamplePath, contentType: 'application/json' })
    // A later report is relevant to repeating comparable wash use, even before
    // finishing context is captured. It is not another after-wash efficacy trial.
    await client.mutation(api.outcomeAssessments.save, { recordId: records[0]!, dimension: 'damage', checkedWhen: 'after_wearing', result: 'damage', expectedRevision: 0, receiptId: 'personal-browser-later-negative' })
    await expect(benefits).toContainText('Saved private suggestions are stale.')
    await expect(benefits).not.toContainText('Reported improvement')
    await expect(guidance).toContainText('Suggestion withheld')
    expect(await client.query(api.personalAdaptation.forRecord, args)).toMatchObject({ status: 'reassess', suppressOptionalSuggestion: true, negativeHistoryTruncated: false, counts: { independentWashes: 3, improved: 3, worse: 0 } })
    expect((await client.query(api.personalSuggestions.forPlan, proposalArgs)).candidates[0]!.guidance.direction).toBe('withhold')
    const held = await client.query(api.personalSuggestions.plannerPreview, proposalArgs)
    expect(held.result.loads[0]!.productRecommendations!.some((decision) => decision.supplyId === additionId)).toBe(false)
    expect(held.result.loads[0]!.withheldProductRecommendations!.map((decision) => decision.supplyId)).toContain(additionId)
    expect(held.result.loads[0]!.treatments).toEqual(upcoming.result.loads[0]!.treatments)
    expect(held.result.inputHash).not.toBe(privatePlanner.result.inputHash)
    const savedAfterDamage = await client.query(api.personalSuggestions.savedForPlan, { planId: upcomingId, loadId: proposalArgs.loadId })
    expect(savedAfterDamage).toMatchObject({ status: 'stale' })
    expect(savedAfterDamage).not.toHaveProperty('result')
    await expect(client.mutation(api.personalSuggestions.savePreview, savedArgs)).rejects.toThrow('latest preview')
    await guidance.getByRole('button', { name: 'Review current guidance', exact: true }).click()
    await saveGuidance.click()
    const withheldSuggestions = benefits.locator('details').filter({ has: page.getByText('Withheld optional suggestions (1)', { exact: true }) })
    await expect(withheldSuggestions).toBeVisible()
    await expect(withheldSuggestions.getByRole('checkbox', { name: 'Use Synthetic optional addition', exact: true })).not.toBeVisible()
    await withheldSuggestions.getByText('Withheld optional suggestions (1)', { exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(withheldSuggestions).toContainText('Suggestion withheld')
    await expect(withheldSuggestions.getByRole('checkbox', { name: 'Use Synthetic optional addition', exact: true })).not.toBeChecked()
    expect((await client.query(api.plans.get, { planId: upcomingId }))!.result).toEqual(upcoming.result)
    await client.mutation(api.outcomeAssessments.save, { recordId: records[0]!, dimension: 'damage', checkedWhen: 'after_wearing', result: null, expectedRevision: 1, receiptId: 'personal-browser-later-clear' })
    expect(await client.query(api.personalAdaptation.forRecord, args)).toMatchObject({ status: 'repeated_pattern', suppressOptionalSuggestion: false })
    await client.mutation(api.outcomeAssessments.save, { recordId: records[0]!, dimension: 'odor', checkedWhen: 'after_wash', result: 'irritation', expectedRevision: 1, receiptId: 'personal-browser-correction' })
    expect(await client.query(api.personalAdaptation.forRecord, args)).toMatchObject({ status: 'reassess', suppressOptionalSuggestion: true, counts: { independentWashes: 3, improved: 2, worse: 1 } })
    const { code } = await client.mutation(api.households.createInvite, { householdId })
    await signUp(member, 'personal-matching-member', 'Synthetic Member')
    await joinWithCode(member, code)
    const { client: other } = await convexAs(member)
    expect(await other.query(api.personalSuggestions.savedForPlan, { planId: upcomingId, loadId: proposalArgs.loadId })).toBeNull()
    expect((await other.query(api.personalAdaptation.forRecord, args)).observations).toEqual([])
    expect((await other.query(api.personalSuggestions.forPlan, proposalArgs)).candidates[0]!.summaries[0]!.observations).toEqual([])
    const otherPlanner = await other.query(api.personalSuggestions.plannerPreview, proposalArgs)
    expect(otherPlanner.result.loads[0]!.withheldProductRecommendations).toBeUndefined()
    expect(otherPlanner.result.inputHash).not.toBe(held.result.inputHash)
    await other.mutation(api.personalAdaptation.change, { householdId, textileId, expectedRevision: 0, action: { kind: 'set_enabled', enabled: false } })
    expect((await other.query(api.personalAdaptation.forRecord, args)).status).toBe('disabled')
    expect((await client.query(api.personalAdaptation.forRecord, args)).status).toBe('reassess')
    // Identical pieces share one control, named "<Name> ×n" when the load has several.
    const garmentControl = page.getByRole('region', { name: /^Personal influence: Synthetic matching tee( ×\d+)?$/ })
    const resetGarment = garmentControl.getByRole('button', { name: /^Reset influence for Synthetic matching tee( ×\d+)?$/ })
    await resetGarment.click()
    await expect(garmentControl).toContainText('Wash and assessment history stays available.')
    await garmentControl.getByRole('button', { name: 'Keep influence', exact: true }).click()
    expect((await client.query(api.personalAdaptation.controls, { householdId, textileId })).scope.revision).toBe(0)
    await resetGarment.click()
    // A second client changes the scope while its reset confirmation is open.
    await client.mutation(api.personalAdaptation.change, { householdId, textileId, expectedRevision: 0, action: { kind: 'set_enabled', enabled: false } })
    await garmentControl.getByRole('button', { name: 'Confirm reset influence', exact: true }).click()
    await expect(garmentControl).toContainText('Personal result controls changed')
    await expect(benefits).not.toContainText('Reported improvement')
    expect((await client.query(api.personalAdaptation.controls, { householdId, textileId })).scope.resetAt).toBe(0)
    await garmentControl.getByRole('checkbox').click()
    await expect(garmentControl.getByRole('checkbox')).toBeChecked()
    await resetGarment.click()
    await garmentControl.getByRole('button', { name: 'Confirm reset influence', exact: true }).click()
    await expect(garmentControl).toContainText('Earlier washes excluded from guidance. Actual history is retained.')
    await expect(benefits).not.toContainText('Reported improvement')
    await expect(benefits).not.toContainText('Independent wash 1')
    expect((await client.query(api.personalAdaptation.forRecord, args)).observations).toEqual([])
    await client.mutation(api.outcomeAssessments.save, { recordId: records[0]!, dimension: 'odor', checkedWhen: 'after_wash', result: 'damage', expectedRevision: 2, receiptId: 'personal-browser-post-reset-correction' })
    expect((await client.query(api.personalAdaptation.forRecord, args)).observations).toEqual([])
    expect((await client.query(api.outcomeAssessments.forRecord, { recordId: records[0]! }))[0]?.result).toBe('damage')
    const membership = (await client.query(api.households.members, { householdId })).find((row) => row.displayName === 'Synthetic Member')!
    await client.mutation(api.households.removeMember, { membershipId: membership.membershipId })
    await expect(other.query(api.personalAdaptation.forRecord, args)).rejects.toThrow('Forbidden')
    await page.reload()
    expect((await client.query(api.personalAdaptation.controls, { householdId, textileId })).scope.resetAt).toBeGreaterThan(0)
    await page.setViewportSize({ width: 390, height: 900 })
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.getByText('Your private product guidance', { exact: true }).click()
    await expect(guidance).toContainText('Saved guidance is stale.')
    const useAddition = benefits.getByRole('checkbox', { name: 'Use Synthetic optional addition', exact: true })
    await useAddition.click()
    await expect(useAddition).toBeChecked()
    await useAddition.focus()
    await page.keyboard.press('Space')
    await expect(useAddition).not.toBeChecked()
    await expect(benefits).toContainText('Added only when selected')
  } finally { await page.context().close(); await member.context().close() }
})

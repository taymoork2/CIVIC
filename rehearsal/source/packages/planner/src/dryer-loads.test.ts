import assert from 'node:assert/strict'

import { dryerContextSuggestion, dryerShare, fitInDryer, midRunCheck, labelFromCeiling, methodEvidence, pieceMethod, planDryerLoads, type ComparableDryerOutcome, type DryerStartingContext, type QueuedPiece } from './dryer-loads.ts'
import { dryerTimeSuggestion, tumbleCeiling } from './drying.ts'

for (const baseline of [null, undefined, { durationMinutes: 45, confidence: 'unknown' }, { durationMinutes: 0, confidence: 'verified' }, { durationMinutes: 301, confidence: 'observed' }, { durationMinutes: 2.5, confidence: 'observed' }]) {
  assert.equal(dryerTimeSuggestion(baseline).minutes, null, 'no time is invented from absent, unchecked or invalid program evidence')
}
for (const confidence of ['observed', 'verified']) {
  const suggestion = dryerTimeSuggestion({ durationMinutes: 45, confidence })
  assert.equal(suggestion.minutes, 45)
  assert.equal(suggestion.basis, 'recorded_program')
  assert.match(suggestion.uncertainty, /remaining moisture/)
  assert.match(suggestion.uncertainty, /check for dryness/)
}

const piece = (id: string, maxHeat: QueuedPiece['maxHeat'], source: string, extra: Partial<QueuedPiece> = {}): QueuedPiece => ({ id, bulkUnits: 1, maxHeat, source, ...extra })

// Compatible pieces from different washers share a load; heats stay apart unless combined.
const queue = [piece('tee', 'medium', 'Washer 3'), piece('towel', 'medium', 'Washer 5'), piece('silk', 'low', 'Washer 3'), piece('wool', null, 'Washer 5', { hold: { method: 'dry_flat', reason: 'care_label' } })]
const split = planDryerLoads(queue)
assert.deepEqual(split.loads.map((load) => [load.heat, load.pieceIds, load.sources]), [['low', ['silk'], ['Washer 3']], ['medium', ['tee', 'towel'], ['Washer 3', 'Washer 5']]], 'by heat, across washers')
assert.deepEqual(split.natural, [{ pieceId: 'wool', method: 'flat' }], 'a dry-flat tag dries flat')
assert.equal(split.mixedHeats, true)
const combined = planDryerLoads(queue, { combine: true })
assert.deepEqual(combined.loads.map((load) => [load.heat, load.pieceIds]), [['low', ['tee', 'towel', 'silk']]], 'All on low heat: one group at the most limiting tag')

// Unknown capacity: never unlimited, the fit is not checked.
assert.deepEqual(split.loads.map((load) => [load.capacityUnits, load.fit]), [[null, 'not_checked'], [null, 'not_checked']])

// A known capacity splits a heat group; one wash load can split across dryer loads.
const towels = ['t1', 't2', 't3', 't4'].map((id) => piece(id, 'high', 'Washer 2', { bulkUnits: 2 }))
const byCapacity = planDryerLoads(towels, { capacityUnits: 6 })
assert.deepEqual(byCapacity.loads.map((load) => [load.pieceIds, load.bulkUnits, load.fit]), [[['t1', 't2', 't3'], 6, 'fits'], [['t4'], 2, 'fits']])

// The person's choices: Air dry moves a piece out; Own dryer load gives it a load alone; Merge back undoes it.
const chosen = planDryerLoads([piece('a', 'medium', 'W1'), piece('b', 'medium', 'W1', { own: true }), piece('c', 'medium', 'W2', { method: 'rack_line' }), piece('d', 'medium', 'W2')])
assert.deepEqual(chosen.loads.map((load) => load.pieceIds), [['a', 'd'], ['b']])
assert.deepEqual(chosen.natural, [{ pieceId: 'c', method: 'rack_line' }])
assert.deepEqual(planDryerLoads([piece('a', 'medium', 'W1'), piece('b', 'medium', 'W1')]).loads.map((load) => load.pieceIds), [['a', 'b']], 'merged back')

// At the machine: a dryer that holds 2 of 3 towels takes 2, and 1 stays queued.
assert.deepEqual(fitInDryer(['t1', 't2', 't3'].map((id) => ({ id, bulkUnits: 2 })), 4), { going: ['t1', 't2'], staying: ['t3'], fit: 'fits' })
assert.deepEqual(fitInDryer([{ id: 'quilt', bulkUnits: 9 }], 4), { going: ['quilt'], staying: [], fit: 'over' }, 'a lone big piece still goes, said to be over')
assert.deepEqual(fitInDryer([{ id: 'a', bulkUnits: 1 }, { id: 'b', bulkUnits: 30 }], null), { going: ['a', 'b'], staying: [], fit: 'not_checked' }, 'unknown capacity takes all and says so')

// The ceiling comes from confirmed care only.
const care = (dryMethod: string, dryHeat?: string) => ({ washMethod: 'machine', cycle: 'normal', dryMethod, ...(dryHeat === undefined ? {} : { dryHeat }), status: 'confirmed' }) as never
assert.deepEqual(tumbleCeiling({ id: 'x', bulkUnits: 1, material: null, care: care('tumble_dry', 'low') }), { maxHeat: 'low' })
assert.equal('maxHeat' in tumbleCeiling({ id: 'x', bulkUnits: 1, material: null, care: care('line_dry') }), false)
assert.equal('maxHeat' in tumbleCeiling({ id: 'x', bulkUnits: 1, material: null, care: null }), false, 'unknown care hangs')

// Drying method evidence: only tumbling conflicts, and only with do-not-tumble; natural drying is
// never recorded as forbidden; a heated hanging dryer's compatibility is never established by a label.
assert.equal(methodEvidence('tumble', 'do_not_tumble_dry'), 'conflict')
assert.equal(methodEvidence('tumble', 'line_dry'), 'not_specified')
assert.equal(methodEvidence('tumble', 'tumble_dry'), 'allowed')
assert.equal(methodEvidence('rack_line', 'tumble_dry'), 'not_specified')
assert.equal(methodEvidence('flat', 'do_not_tumble_dry'), 'not_specified')
assert.equal(methodEvidence('flat', 'dry_flat'), 'allowed')
assert.equal(methodEvidence('heated_hanging', 'do_not_tumble_dry'), 'not_established')
assert.equal(methodEvidence('heated_hanging', 'tumble_dry'), 'not_established')
assert.equal(methodEvidence('tumble', 'unknown'), 'tag_unknown')
assert.deepEqual(pieceMethod('do_not_tumble_dry'), { method: 'rack_line', source: 'label', evidence: 'not_specified' })
assert.deepEqual(pieceMethod('do_not_tumble_dry', { preference: 'heated_hanging', once: 'tumble' }), { method: 'tumble', source: 'once', evidence: 'conflict' }, 'this time only wins')
assert.deepEqual(pieceMethod('do_not_tumble_dry', { preference: 'heated_hanging' }), { method: 'heated_hanging', source: 'preference', evidence: 'not_established' })
assert.deepEqual(pieceMethod('unknown'), { method: null, source: null, evidence: null }, 'no label, no method')
// A stain outranks every choice: no dryer or cabinet heat until someone checks it is gone.
assert.deepEqual(pieceMethod('tumble_dry', { once: 'tumble', routine: 'tumble', preference: 'heated_hanging', stained: true }), { method: 'rack_line', source: 'stain', evidence: 'not_specified' })
assert.deepEqual(pieceMethod('dry_flat', { stained: true }), { method: 'flat', source: 'stain', evidence: 'allowed' }, 'a flat label stays flat')
assert.deepEqual(pieceMethod('unknown', { stained: true }), { method: 'rack_line', source: 'stain', evidence: 'tag_unknown' }, 'even an unknown label air dries')
assert.deepEqual(pieceMethod('line_dry', { preference: 'flat', stained: true }), { method: 'flat', source: 'stain', evidence: 'not_specified' }, 'a remembered flat preference stays flat')
assert.deepEqual(pieceMethod('unknown', { routine: 'flat', stained: true }), { method: 'flat', source: 'stain', evidence: 'tag_unknown' }, 'My routine flat stays flat')
assert.equal(labelFromCeiling({ method: 'do_not_tumble_dry', reason: 'care_label' }), 'do_not_tumble_dry')
assert.equal(labelFromCeiling({ method: 'unknown', reason: 'drying_unknown' }), 'unknown')
assert.equal(labelFromCeiling({ maxHeat: 'low' }), 'tumble_dry')

// Do-not-tumble chosen for the tumble dryer is never given an assumed low heat: it plans apart, even with "All on low heat".
const dnt = piece('knit', null, 'W1', { hold: { method: 'do_not_tumble_dry', reason: 'care_label' }, method: 'tumble' })
const noHeat = planDryerLoads([piece('tee', 'low', 'W1'), dnt], { combine: true })
assert.deepEqual(noHeat.loads.map((load) => [load.heat, load.pieceIds]), [['low', ['tee']], [null, ['knit']]])
assert.deepEqual(planDryerLoads([piece('blank', null, 'W1')]).unset, ['blank'], 'no label and no choice: needs a method')
assert.deepEqual(planDryerLoads([dnt, piece('h', null, 'W2', { method: 'heated_hanging' }), piece('f', 'low', 'W2', { method: 'flat' })]).natural.map((entry) => entry.method).length, 2)

// "Needed by" orders pieces and loads; it never changes the grouping.
const urgent = planDryerLoads([piece('a', 'medium', 'W1'), piece('b', 'low', 'W1'), piece('c', 'medium', 'W1', { need: '2h' })])
assert.deepEqual(urgent.loads.map((load) => [load.heat, load.pieceIds, load.need]), [['medium', ['c', 'a'], '2h'], ['low', ['b'], null]])

console.log('dryer load checks passed')

const now = Date.UTC(2026, 9, 5)
const context: DryerStartingContext = { key: 'checked-context', pieceCount: 3, bulkUnits: 3, capacityUnits: 6, capacityConfidence: 'observed',
  extraction: [{ washerId: 'washer', cycle: 'normal', source: 'checked washer guide', spinRpm: 800, spinMinutes: 4 }] }
const outcomes: ComparableDryerOutcome[] = [35, 40, 45].map((minutes, index) => ({ runId: `run-${index}`, washIds: [`wash-${index}`],
  contextKey: context.key, minutes, completedAt: now - 1000, result: 'unchanged' }))
const options = { enabled: true, resetAt: 0, historyTruncated: false, negativeHistoryTruncated: false, now }
const program = { durationMinutes: 60, confidence: 'observed', mode: 'fixed' as const }
const refine = (rows = outcomes, changes = {}, target = context) => dryerContextSuggestion(program, target, rows, { ...options, ...changes })
assert.equal(refine().minutes, 40)
assert.equal(refine().independentWashes, 3)
assert.equal(refine().baselineMinutes, 60)
assert.equal(refine().basis, 'comparable_outcomes')
assert.match(refine().explanation, /does not predict dryness/)
assert.equal(refine([...outcomes, { ...outcomes[0]!, runId: 'split', contextKey: 'different-setting' }]).basis, 'baseline_only', 'incomparable correlated split still reserves its wash')
assert.equal(refine(outcomes.map((row) => ({ ...row, washIds: ['one-wash'] }))).basis, 'baseline_only')
assert.equal(refine(outcomes.map((row) => ({ ...row, runId: 'one-run' }))).basis, 'baseline_only')
assert.equal(refine([...outcomes, { ...outcomes[0]!, result: 'unknown' }]).basis, 'baseline_only', 'unknown in a correlated run cannot be dropped')
assert.equal(refine(outcomes.map((row) => ({ ...row, completedAt: now - 181 * 86400000 }))).basis, 'baseline_only')
assert.equal(refine(outcomes.map((row) => ({ ...row, contextKey: 'changed-program' }))).basis, 'baseline_only')
for (const result of ['worse', 'damage', 'irritation'] as const) {
  assert.equal(refine([...outcomes, { ...outcomes[0]!, result }]).minutes, null)
  assert.equal(refine([...outcomes, { ...outcomes[0]!, result, completedAt: now - 181 * 86400000 }]).minutes, null, 'old negative evidence remains visible until corrected')
}
assert.equal(refine(outcomes, { enabled: false }).basis, 'baseline_only')
assert.equal(refine(outcomes, { resetAt: now }).basis, 'baseline_only')
assert.equal(refine(outcomes, { historyTruncated: true }).basis, 'baseline_only')
assert.equal(refine(outcomes, { negativeHistoryTruncated: true }).minutes, null)
for (const target of [{ ...context, key: null }, { ...context, capacityConfidence: 'unknown' }, { ...context, capacityUnits: null }, { ...context, extraction: [{ ...context.extraction[0]!, spinRpm: null }] }]) assert.equal(refine(outcomes, {}, target).basis, 'baseline_only')
assert.equal(dryerContextSuggestion({ ...program, mode: 'sensor' }, context, outcomes, options).minutes, null)
assert.equal(dryerContextSuggestion({ ...program, mode: 'unknown' }, context, outcomes, options).minutes, 60)
assert.equal(dryerContextSuggestion(undefined, context, outcomes, options).minutes, null)
console.log('dryer context checks passed')

// Dryer sharing line (design 8.2, 8.3): counted with the planner both ways, offered only when it saves a run.
{
  const tees = [piece('tee1', 'low', 'W1', { bulkUnits: 0.5 }), piece('tee2', 'low', 'W1', { bulkUnits: 0.5 })]
  const towels = [piece('towel1', 'medium', 'W1', { bulkUnits: 1 }), piece('towel2', 'medium', 'W1', { bulkUnits: 1 })]
  const knit = new Set(['tee1', 'tee2'])
  const share = dryerShare([...tees, ...towels], { capacityUnits: 6, knit })
  assert.deepEqual(share, { separate: 2, together: 1, heat: 'low', knitIds: ['tee1', 'tee2'] }, 'tees plus towels: 1 run instead of 2 on the lowest tag heat; the tees are named')
  assert.equal(dryerShare(tees, { capacityUnits: 6, knit }), null, 'one heat: nothing to offer')
  assert.equal(dryerShare([...towels, piece('jeans', 'high', 'W1', { bulkUnits: 1.5 })], { capacityUnits: 6, knit })?.knitIds.length, 0, 'no knit kinds: no hang offer')
  assert.equal(dryerShare([...tees, ...towels], { capacityUnits: 2 }), null, 'sharing that still needs 2 runs is not offered')
  // Unheated and own-load pieces are their own runs both ways, and still counted.
  const counted = dryerShare([...tees, ...towels, piece('bare', null, 'W1', { method: 'tumble', hold: { method: 'unknown', reason: 'care_label' } }), piece('mine', 'medium', 'W1', { own: true })], { capacityUnits: 6 })
  assert.deepEqual([counted?.separate, counted?.together], [4, 3], 'unheated and own-load pieces count as their own runs in both')
  // A My routine heat never joins the shared run.
  const routine = planDryerLoads([...tees, piece('jacket', 'high', 'W1', { routine: true }), ...towels], { combine: true })
  assert.deepEqual(routine.loads.map((load) => [load.heat, load.pieceIds]), [['low', ['tee1', 'tee2', 'towel1', 'towel2']], ['high', ['jacket']]], 'a routine heat keeps its own run')
  // Property: the shared heat never passes any sharing piece's tag heat.
  const heats = ['no_heat', 'delicate', 'low', 'medium', 'high'] as const
  for (let seed = 1; seed <= 200; seed += 1) {
    const pieces = Array.from({ length: 1 + (seed % 7) }, (_, index) => piece(`p${seed}-${index}`, heats[(seed * 7 + index * 3) % heats.length]!, 'W1', { bulkUnits: 0.25 + ((seed + index) % 4) * 0.5 }))
    for (const load of planDryerLoads(pieces, { combine: true, capacityUnits: 4 }).loads) {
      for (const id of load.pieceIds) assert.ok(heats.indexOf(load.heat!) <= heats.indexOf(pieces.find((entry) => entry.id === id)!.maxHeat!), 'shared heat is at or below every tag')
    }
  }
}

{
  // The mid-run check (design 8.4, 8.5): about half the run, rounded to 5 minutes.
  const tee = { id: 'tee', bulkUnits: 0.5, kind: 't_shirt', labelHeat: 'low' as const }
  const towel = { id: 'towel', bulkUnits: 1.5, kind: 'towel', labelHeat: 'low' as const }
  const towel2 = { ...towel, id: 'towel2' }
  assert.deepEqual(midRunCheck([tee, towel, towel2], 50), { atMinute: 25, pieceIds: ['tee'], reasons: ['knit'] }, 'tee plus towels: the tee at about half')
  assert.equal(midRunCheck([tee, towel], 32)?.atMinute, 15, '16 rounds to 15')
  assert.equal(midRunCheck([tee, towel], 44)?.atMinute, 20, '22 rounds to 20')
  assert.deepEqual(midRunCheck([{ id: 'sweater', bulkUnits: 1.5, kind: 'sweater', labelHeat: 'low' }, towel], 60)?.pieceIds, ['sweater'], 'a sweater is named whatever its bulk')
  assert.equal(midRunCheck([tee, { ...tee, id: 'tee2' }], 40), null, 'tees only: nothing heavier beside them')
  assert.equal(midRunCheck([towel, towel2], 60), null, 'towels only')
  assert.equal(midRunCheck([tee, towel], null), null, 'unknown minutes: no check')
  assert.equal(midRunCheck([tee, towel], 5), null, 'half a short run rounds to its end')
  assert.deepEqual(midRunCheck([towel, { id: 'socks', bulkUnits: 0.25, kind: 'socks', labelHeat: 'low' }], 40)?.reasons, ['light'], 'a light piece beside heavy ones')
  assert.deepEqual(midRunCheck([towel, { id: 'bare', bulkUnits: 1, kind: 'other', labelHeat: null }], 40), { atMinute: 20, pieceIds: ['bare'], reasons: ['heat_not_on_tag'] }, 'no label set its heat')
  assert.deepEqual(midRunCheck([towel, { id: 'mine', bulkUnits: 1, kind: 'pants', labelHeat: 'high', routine: true }], 40)?.pieceIds, ['mine'], 'a My routine heat gets the check')
}

import { expect, test } from 'vitest'
import { renderWithConvex } from '@/test/markup'
import type { GarmentRecord } from '@/closet/garment-record'
import { assessmentFor, assessmentLines, OutcomeAssessment } from '@/laundry/outcome-assessment'

const wash: GarmentRecord['washes'][number] = { recordId: 'wash' as never, at: 1791150000000, washerName: 'Washer', cycle: 'Delicates', drying: { outcome: 'queued' }, observation: undefined, products: [] }
const slot = { assessmentId: 'assessment' as never, dimension: 'overall' as const, checkedWhen: 'after_wash' as const, revision: 3, recordedAt: wash.at }

test('unanswered, saved unknown and cleared result have distinct presentation', () => {
  expect(assessmentFor(wash, 'overall', 'after_wash')).toMatchObject({ result: null, recorded: false, revision: 0 })
  const unknown = { ...wash, assessments: [{ ...slot, result: 'unknown' as const }] }
  expect(assessmentFor(unknown, 'overall', 'after_wash')).toMatchObject({ result: 'unknown', recorded: true, revision: 3 })
  const clear = { ...wash, assessments: [{ ...slot, result: null }] }
  expect(assessmentFor(clear, 'overall', 'after_wash')).toMatchObject({ result: null, recorded: false, revision: 3 })
  expect(renderWithConvex(<OutcomeAssessment washes={[wash]} />)).toContain('No assessment yet.')
  expect(renderWithConvex(<OutcomeAssessment washes={[unknown]} />)).toContain('Your result: Not sure')
  expect(renderWithConvex(<OutcomeAssessment washes={[clear]} />)).toContain('Your result was cleared.')
})

test('an assessment belongs only to its selected dimension and stage', () => {
  const assessed = { ...wash, assessments: [{ ...slot, checkedWhen: 'after_drying' as const, result: 'worse' as const, note: 'Own observation' }] }
  expect(assessmentFor(assessed, 'overall', 'after_drying')).toMatchObject({ result: 'worse', note: 'Own observation', revision: 3 })
  expect(assessmentFor(assessed, 'odor', 'after_drying').recorded).toBe(false)
  expect(assessmentFor(assessed, 'overall', 'after_wash').recorded).toBe(false)
  const cleared = { ...wash, assessments: [{ ...slot, checkedWhen: 'after_drying' as const, result: null }] }
  expect(assessmentFor(cleared, 'overall', 'after_drying').recorded).toBe(false)
  expect(assessmentLines(cleared)).toEqual([])
})

test('history retains separate dimensions and stages', () => {
  const assessed = { ...wash, assessments: [
    { ...slot, result: 'unknown' as const },
    { ...slot, dimension: 'odor' as const, checkedWhen: 'after_wearing' as const, result: 'improved' as const, note: 'Private note' },
  ] }
  expect(assessmentLines(assessed)).toEqual(['Your result: Overall · Not sure · After washing', 'Your result: Odor · Improved · After wearing · Private note'])
  expect(renderWithConvex(<OutcomeAssessment washes={[assessed, { ...wash, recordId: 'older' as never, at: wash.at - 86400000 }]} />)).toContain('value="older"')
})

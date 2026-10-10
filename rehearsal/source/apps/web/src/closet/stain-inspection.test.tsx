import { expect, test } from 'vitest'
import { renderToStaticMarkup } from '@/test/markup'
import { FlagSheet, draftFromFlag, flagArgs } from '@/closet/flag-sheet'
import { stainInspectionArgs } from '@/closet/stain-inspection'
import type { Textile } from '@/household/inventory-types'

test('inspection preserves exact flag scheduling and separate unchanged prior attempts', () => {
  const now = Date.UTC(2026, 9, 3)
  const garment = { textileId: 'shirt', name: 'White shirt', dryCleanOnly: false }
  const textile: Pick<Textile, 'flag' | 'soilLevel'> = { soilLevel: 'heavy', flag: {
    reasons: ['food', 'worn'], flaggedAt: now - 1000, flaggedBy: 'owner', neededBy: now + 12345,
    stainReport: { kind: 'protein', priorTreatmentAttempts: ['Product A', 'Product B'] },
  } }
  const draft = draftFromFlag(textile.flag, textile.soilLevel, now)
  const args = stainInspectionArgs(textile, flagArgs([garment], { ...draft, stainKind: 'tannin', stainNote: 'collar' }, now))
  expect(args).toMatchObject({ reasons: ['food', 'worn'], soilLevel: 'heavy', neededBy: textile.flag!.neededBy,
    stainNote: 'collar', stainReport: { kind: 'tannin', priorTreatmentAttempts: ['Product A', 'Product B'] } })
  expect(stainInspectionArgs(textile, flagArgs([garment], { ...draft, priorTreatment: 'none' }, now)).stainReport?.priorTreatmentAttempts).toEqual([])
})

test('inspection is one stain step with a save action and no hamper or earlier-step navigation', () => {
  const markup = renderToStaticMarkup(<FlagSheet garments={[{ textileId: 'shirt', name: 'White shirt', dryCleanOnly: false }]} now={0}
    flag={async () => { throw new Error('unused') }} onClose={() => undefined} onDone={() => undefined}
    start="stain" stainOnly saveLabel="Save stain details" initial={{ reasons: ['food'], soil: 'heavy', needed: 'none', day: '', stainNote: '' }} />)
  expect(markup).toContain('Save stain details')
  expect(markup).toContain('What caused the stain?')
  expect(markup).not.toContain('Put in hamper')
  expect(markup).not.toContain('aria-label="Back"')
})

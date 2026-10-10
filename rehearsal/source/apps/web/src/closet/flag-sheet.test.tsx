import { renderToStaticMarkup } from '@/test/markup'
import { expect, test } from 'vitest'

import { FlagSheet, dayInputEnd, flagDraftChanged, dayInputValue, draftFromFlag, endOfDay, flagArgs, flagSteps, flagToast, type FlagDraft, type FlagGarment, type FlagStep } from '@/closet/flag-sheet'
import { assertPlainCopy } from '@/kit/test-copy'
import { WashedSheet, backInClosetToast } from '@/closet/washed-sheet'

const now = new Date(2026, 8, 27, 15).getTime()
const jersey: FlagGarment = { textileId: 't1', name: 'Soccer jersey', dryCleanOnly: false }
const blazer: FlagGarment = { textileId: 't2', name: 'Navy blazer', dryCleanOnly: true }
const draft = (overrides: Partial<FlagDraft> = {}): FlagDraft => ({ reasons: [], soil: null, needed: 'none', day: '', stainNote: '', ...overrides })

test('needed-by days are stored as the local day’s end', () => {
  expect(endOfDay(now)).toBe(new Date(2026, 8, 27, 23, 59, 59, 999).getTime())
  expect(endOfDay(now, 1)).toBe(new Date(2026, 8, 28, 23, 59, 59, 999).getTime())
  expect(dayInputEnd('2026-10-02')).toBe(new Date(2026, 9, 2, 23, 59, 59, 999).getTime())
  expect(dayInputEnd('')).toBeNull()
  expect(dayInputValue(now)).toBe('2026-09-27')
})

test('the steps: a stain asks where, dry clean only asks only what happened', () => {
  expect(flagSteps(['worn'], false)).toEqual(['reasons', 'soil', 'needed'])
  expect(flagSteps(['sweat', 'mud_grass'], false)).toEqual(['reasons', 'soil', 'needed', 'stain'])
  expect(flagSteps(['food'], true)).toEqual(['reasons'])
})

test('how dirty is preselected from the heaviest reason and can be changed', () => {
  expect(flagArgs([jersey], draft({ reasons: ['worn'] }), now).soilLevel).toBe('light')
  expect(flagArgs([jersey], draft({ reasons: ['worn', 'sweat'] }), now).soilLevel).toBe('normal')
  expect(flagArgs([jersey], draft({ reasons: ['worn', 'mud_grass'] }), now).soilLevel).toBe('heavy')
  expect(flagArgs([jersey], draft({ reasons: ['mud_grass'], soil: 'light' }), now).soilLevel).toBe('light')
  expect(flagArgs([jersey], draft(), now).soilLevel).toBe('normal')
  // The preselect shows on the How dirty step.
  const markup = renderToStaticMarkup(<FlagSheet garments={[jersey]} now={now} flag={async () => { throw new Error('unused') }} onClose={() => undefined} onDone={() => undefined} initial={draft({ reasons: ['food'] })} start="soil" />)
  expect(markup).toContain('aria-pressed="true">Very dirty</button>')
  expect(markup).toContain('aria-pressed="false">A little</button>')
})

test('each garment can receive its own reason, soil level, day, and stain note', () => {
  expect(flagArgs([jersey], draft({ reasons: ['mud_grass', 'worn'], needed: 'tomorrow', stainNote: ' left knee ' }), now)).toEqual({
    textileIds: ['t1'],
    reasons: ['worn', 'mud_grass'],
    soilLevel: 'heavy',
    neededBy: endOfDay(now, 1),
    stainNote: 'left knee',
    stainReport: { kind: 'unknown', priorTreatmentAttempts: 'unknown' },
  })
  expect(flagArgs([jersey], draft({ reasons: ['sweat'], needed: 'today', stainNote: 'collar' }), now)).toEqual({ textileIds: ['t1'], reasons: ['sweat'], soilLevel: 'normal', neededBy: endOfDay(now) })
  expect(flagArgs([{ ...jersey, textileId: 't3' }], draft({ reasons: ['sweat'], soil: 'light' }), now)).toEqual({ textileIds: ['t3'], reasons: ['sweat'], soilLevel: 'light' })
  expect(flagArgs([jersey], draft({ needed: 'pick', day: '2026-10-02' }), now).neededBy).toBe(dayInputEnd('2026-10-02'))
  expect(flagArgs([jersey], draft({ needed: 'pick', day: '' }), now).neededBy).toBeUndefined()
})

test('Change how dirty starts from the garment’s own flag', () => {
  expect(draftFromFlag({ reasons: ['food'], neededBy: endOfDay(now, 1), stainNote: 'sleeve' }, 'heavy', now)).toEqual({ reasons: ['food'], soil: 'heavy', needed: 'tomorrow', day: '', stainNote: 'sleeve', stainKind: 'unknown', priorTreatment: 'unknown', treatmentNote: '' })
  expect(draftFromFlag({ reasons: [], neededBy: dayInputEnd('2026-10-02')! }, null, now)).toMatchObject({ needed: 'pick', day: '2026-10-02' })
  expect(draftFromFlag(null, 'light', now)).toMatchObject({ reasons: [], soil: 'light', needed: 'none' })
})

test('stain intake preserves explicit type and history, without treating a blank history as no treatment', () => {
  const args = flagArgs([jersey], draft({ reasons: ['food'], stainKind: 'protein', priorTreatment: 'none' }), now)
  expect(args.stainReport).toEqual({ kind: 'protein', priorTreatmentAttempts: [] })
  expect(flagArgs([jersey], draft({ reasons: ['food'], stainKind: 'protein', priorTreatment: 'yes', treatmentNote: '' }), now).stainReport?.priorTreatmentAttempts).toBe('unknown')
  const reopened = draftFromFlag({ reasons: ['food'], stainReport: { kind: 'tannin', priorTreatmentAttempts: ['Soap'] } }, 'normal', now)
  expect(reopened).toMatchObject({ stainKind: 'tannin', priorTreatment: 'yes', treatmentNote: 'Soap' })
  // A treatment the app recorded stays a record on re-save, until the note is changed to words.
  const recorded = [{ name: 'Enzyme spray', supplyId: 's1', chemistry: 'protease' as const, washedOut: true as const }]
  const retry = draftFromFlag({ reasons: ['food'], stainReport: { kind: 'protein', priorTreatmentAttempts: recorded } }, 'normal', now)
  expect(flagArgs([jersey], retry, now).stainReport?.priorTreatmentAttempts).toEqual(recorded)
  expect(flagArgs([jersey], { ...retry, treatmentNote: 'Enzyme spray, dish soap' }, now).stainReport?.priorTreatmentAttempts).toEqual(['Enzyme spray, dish soap'])
})

test('toasts: in the hamper, the dry-cleaning list, and the heads-up when the laundry person is known', () => {
  const result = { changed: 1, skipped: 0, toDryClean: [], alerted: false }
  expect(flagToast([jersey], result)).toBe('Soccer jersey is waiting to wash in Laundry.')
  expect(flagToast([jersey, { ...jersey, textileId: 't3' }], { ...result, changed: 2 })).toBe('2 laundry items are waiting to wash in Laundry.')
  expect(flagToast([jersey], { ...result, alerted: true }, 'Alex')).toBe('Soccer jersey is waiting to wash in Laundry. Alex will get a heads-up.')
  expect(flagToast([jersey], { ...result, alerted: true }, null)).toBe('Soccer jersey is waiting to wash in Laundry.')
  expect(flagToast([blazer], { ...result, toDryClean: ['t2' as never] })).toBe('Navy blazer is dry clean only. It’s on the dry cleaning list.')
  expect(flagToast([jersey], { ...result, changed: 0, skipped: 1 })).toBeNull()
})

test('each step asks one question, with Back and Cancel at the bottom', () => {
  const render = (start: FlagStep, initial: FlagDraft = draft(), garments = [jersey]) =>
    renderToStaticMarkup(<FlagSheet garments={garments} now={now} flag={async () => { throw new Error('unused') }} onClose={() => undefined} onDone={() => undefined} initial={initial} start={start} />)
  const reasons = render('reasons')
  expect(reasons).toContain('What happened?</h2>')
  for (const word of ['Worn or used', 'Sweaty / gym', 'Food or drink', 'Grass or mud', 'Spit-up or diaper', 'Wet', 'Smells', 'Other stain']) expect(reasons).toContain(`>${word}</button>`)
  expect(reasons).not.toContain('sheet-back')
  expect(reasons).toContain('>Next</button>')
  const needed = render('needed', draft({ reasons: ['worn'] }))
  expect(needed).toContain('Needed by?</h2>')
  for (const word of ['No rush', 'Today', 'Tomorrow', 'Pick a day']) expect(needed).toContain(`>${word}</button>`)
  expect(needed).toContain('>Put in the hamper</button>')
  expect(needed).toContain('sheet-back')
  expect(render('needed', draft({ reasons: ['food'] }))).toContain('>Next</button>')
  const picking = render('needed', draft({ reasons: ['worn'], needed: 'pick' }))
  expect(picking).toContain('type="date"')
  expect(picking).toMatch(/disabled="">Put in the hamper/)
  const stain = render('stain', draft({ reasons: ['food'] }))
  expect(stain).toContain('placeholder="Left knee"')
  expect(stain).toContain('maxLength="80"')
  expect(stain).toContain('>Put in the hamper</button>')
  // Dry clean only: what happened is the only question.
  expect(render('reasons', draft(), [blazer])).toContain('>Add to dry cleaning</button>')
  for (const markup of [reasons, needed, picking, stain]) assertPlainCopy(markup)
})

test('a multi-item selection names the current garment and saves before the next one', () => {
  const markup = renderToStaticMarkup(<FlagSheet garments={[jersey, blazer]} now={now} flag={async () => { throw new Error('unused') }} onClose={() => undefined} onDone={() => undefined} initial={draft({ reasons: ['worn'] })} start="needed" />)
  expect(markup).toContain('Soccer jersey · 1 of 2')
  expect(markup).toContain('>Save and next item</button>')
  expect(markup).not.toContain('Navy blazer · 2 of 2')
})

test('Washed it another way: by hand or somewhere else', () => {
  const markup = renderToStaticMarkup(<WashedSheet garments={[jersey]} washed={async () => ({ changed: 1, skipped: 0 })} onClose={() => undefined} onDone={() => undefined} />)
  expect(markup).toContain('How was it washed?</h2>')
  expect(markup).toContain('By hand</span></button>')
  expect(markup).toContain('Somewhere else</span></button>')
  assertPlainCopy(markup)
  expect(backInClosetToast(['Soccer jersey'], 1)).toBe('Soccer jersey is back in the closet.')
  expect(backInClosetToast(['Sock', 'Sock'], 2)).toBe('2 laundry items are back in the closet.')
  expect(backInClosetToast(['Sock'], 0)).toBeNull()
})

test('closing asks only once this garment has answers that are not saved yet', () => {
  const start = draft({ reasons: ['worn'] })
  expect(flagDraftChanged(start, start)).toBe(false)
  expect(flagDraftChanged(start, { ...start })).toBe(false)
  expect(flagDraftChanged(start, { ...start, reasons: ['worn', 'food'] })).toBe(true)
  expect(flagDraftChanged(start, { ...start, stainNote: 'Coffee on the cuff' })).toBe(true)
  // A field added and left blank is not an answer.
  expect(flagDraftChanged(start, { ...start, stainKind: undefined })).toBe(false)
})

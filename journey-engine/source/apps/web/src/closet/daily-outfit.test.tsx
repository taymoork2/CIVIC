import { expect, test } from 'vitest'
import { outfitGroupKey } from '@washcloset/planner'
import { dailyOutfitActionLabel, OutfitPickerSheet, outfitWearPieces } from '@/closet/daily-outfit'
import type { Textile } from '@/household/inventory-types'
import type { Id } from '@convex/_generated/dataModel'
import { renderToStaticMarkup } from '@/test/markup'

test('the Home action reflects your saved outfit, not a loading result or another person’s suggestion', () => {
  const item = { key: 'tee', name: 'Tee', kind: 't_shirt' as const, color: 'White', colorGroup: 'white', brand: null, wearerId: null, quantity: 1 }
  const pick = { planId: 'test-plan' as Id<'dailyOutfits'>, signature: 'test-version', wearRecorded: false, isYou: true, authorName: 'Me', items: [item] }
  expect(dailyOutfitActionLabel(undefined)).toBe('Open today’s outfit')
  expect(dailyOutfitActionLabel([])).toBe('Choose today’s outfit')
  expect(dailyOutfitActionLabel([pick])).toBe('View today’s outfit')
  expect(dailyOutfitActionLabel([{ ...pick, items: [] }])).toBe('Choose today’s outfit')
  expect(dailyOutfitActionLabel([{ ...pick, isYou: false }])).toBe('Choose today’s outfit')
})

test('wearing an outfit reuses matching ready pieces worn today and excludes busy or other-person clothes', () => {
  const piece = { textileId: 'ready', name: 'Tee', kind: 't_shirt', color: 'White', colorGroup: 'white', wearerId: null, identity: null, guest: false, status: 'clean', inLoad: null, lastWornAt: null } as Textile
  const worn = { ...piece, textileId: 'worn', lastWornAt: new Date(2026, 9, 2, 9).getTime() } as Textile
  const choices = outfitWearPieces([{ key: outfitGroupKey(piece), name: 'Tee', kind: 't_shirt', color: 'White', colorGroup: 'white', brand: null, wearerId: null, quantity: 2 }], [
    piece, { ...piece, textileId: 'busy', inLoad: 'load' } as Textile,
    { ...piece, textileId: 'other', wearerId: 'other' } as Textile,
    { ...piece, textileId: 'guest', guest: true } as Textile, worn,
  ], '2026-10-02')
  expect(choices.map((item) => item.textileId)).toEqual(['worn', 'ready'])
})

test('the pure outfit picker retains quantity limits and pending/stale save guards', () => {
  const props = {
    choices: [['tee', { textile: { name: 'Tee', color: 'White', colorGroup: 'white' }, count: 25 }]] as const,
    tags: ['Work'], tag: null, draft: { tee: 20 }, dirty: true, pending: false, staleDraft: false,
    selectedCount: 20, hasOutfit: true, error: 'Local rejected save',
    onClose: () => {}, onSave: () => {}, onTag: () => {}, onChange: () => {},
  }
  const markup = renderToStaticMarkup(<OutfitPickerSheet {...props} />)
  expect(markup).toMatch(/<button[^>]*aria-label="More Tee, White"[^>]*disabled/)
  expect(markup).toMatch(/<button[^>]*aria-label="Fewer Tee, White"(?![^>]*disabled)/)
  expect(markup).toContain('20 of 25')
  expect(markup).toContain('Local rejected save')
  const pending = renderToStaticMarkup(<OutfitPickerSheet {...props} pending />)
  expect(pending).toMatch(/<button[^>]*disabled[^>]*>Saving…<\/button>/)
  expect(pending).toMatch(/<button[^>]*aria-label="Choose Tee, White"[^>]*disabled/)
  const stale = renderToStaticMarkup(<OutfitPickerSheet {...props} staleDraft />)
  expect(stale).toContain('Some clothes are no longer ready. Close and choose again.')
  expect(stale).toMatch(/<button[^>]*disabled[^>]*>Save outfit<\/button>/)
})

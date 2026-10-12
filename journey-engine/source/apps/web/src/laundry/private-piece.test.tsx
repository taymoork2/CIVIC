import { expect, test } from 'vitest'
import { renderToStaticMarkup } from '@/test/markup'
import type { PrivateCare } from '@convex/access'
import { privateCareWords, PrivatePieceRows } from './private-piece'
import { garmentLabel, loadPieces, LoadSummary } from './load-summary'
import { GarmentList, stepView } from './machine-step'
import { sessionModel, type SessionDetail } from './session-view'
import { loadReviewModel } from './load-review'

const care: PrivateCare = { washMethod: 'machine', cycle: 'delicate', maxTemperatureC: 30, dryMethod: 'do_not_tumble_dry', dryHeat: null, bleach: 'none', restrictions: ['Wash inside out'], lines: ['Do not wring'] }
const privatePieces = [{ textileId: 'p1', private: true, privateCare: care }, { textileId: 'p2', private: true, privateCare: care }]

test('private rows count matching care together and show every instruction without an identity', () => {
  const markup = renderToStaticMarkup(<ul><PrivatePieceRows pieces={privatePieces} /></ul>)
  expect(markup).toContain('2 private pieces')
  expect(markup).toContain('up to 30°C')
  expect(markup).toContain('Do not tumble dry')
  expect(markup).toContain('No bleach')
  expect(markup).toContain('Wash inside out')
  expect(markup).toContain('Do not wring')
  expect(markup).not.toContain('<img')
  expect(markup).not.toContain('<button')
})

test('different care is never merged, and unknown care stays unknown with recorded restrictions', () => {
  const markup = renderToStaticMarkup(<ul><PrivatePieceRows pieces={[...privatePieces, { textileId: 'p3', private: true, privateCare: { ...care, maxTemperatureC: 20 } }, { textileId: 'p4', private: true, privateCare: null }]} /></ul>)
  expect(markup).toContain('2 private pieces')
  expect(markup.match(/>1 private piece</g)).toHaveLength(2)
  expect(markup).toContain('up to 20°C')
  expect(markup).toContain('Care not recorded; check the label')
  expect(privateCareWords({ ...care, washMethod: 'unknown' })).toContain('Do not wring')
})

test('a load summary masks even an accidentally supplied name and photo-like colour', () => {
  const pieces = privatePieces.map((piece) => ({ ...piece, name: 'Secret lingerie', color: 'Secret colour' }))
  expect(garmentLabel(pieces[0])).toBe('1 private piece')
  expect(loadPieces(pieces)[0]).toMatchObject({ label: '2 private pieces', private: true, count: 2 })
  const markup = renderToStaticMarkup(<LoadSummary stage="washing" origins={['Washer']} pieces={pieces} />)
  expect(markup).toContain('2 private pieces')
  expect(markup).toContain('No bleach')
  expect(markup).not.toContain('Secret')
  expect(markup).not.toContain('×2')
})

test('step garment rows use the private care response, never a private name callback', () => {
  const markup = renderToStaticMarkup(<GarmentList garments={[{ textileId: 'p1' }, { textileId: 'p2' }, { textileId: 'public' }]} privatePieces={privatePieces} name={(id) => id === 'public' ? 'Towel' : 'Secret lingerie'} />)
  expect(markup).toContain('2 private pieces')
  expect(markup).toContain('Do not wring')
  expect(markup).toContain('Towel')
  expect(markup).not.toContain('Secret')
})

test('a garment pretreatment step uses the private count and care, including recorded-step review', () => {
  const model = sessionModel({ textiles: [{ ...privatePieces[0], name: null, color: null }], actions: [{ kind: 'treatment', phase: 'drum', textileId: 'p1', textileName: 'Secret name', supplyName: 'Soap', dose: { amount: 1, unit: 'ml' } }] } as unknown as SessionDetail)
  const view = stepView(model.actions[0]!, { washerName: 'Washer', doorLocks: false, cycle: null, cycleMinutes: null, drying: null })
  expect(view.note).toContain('1 private piece')
  expect(view.note).toContain('No bleach')
  expect(view.note).not.toContain('Secret')
})

test('load review includes private pieces missing from inventory, scoped to this load', () => {
  const review = loadReviewModel({ load: { textileIds: ['p1'], treatments: [] }, textiles: new Map(), wearers: [], supplies: [], outIds: [], excludedSupplyIds: [], first: true, otherKeys: new Set(), privatePieces })
  expect(review.garments).toEqual([expect.objectContaining({ name: '1 private piece', private: true, textileIds: ['p1'], candidates: [], kind: null, color: null, wash: privateCareWords(care) })])
})

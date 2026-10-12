import { expect, test } from 'vitest'
import type { Textile } from '@/household/inventory-types'
import { AdviceExplanation, AdviceReminderControls, GarmentPrintDetails, ConstructionSummary, ConstructionSheet, factGroups } from '@/closet/garment-advice'
import { renderToStaticMarkup, renderWithConvex } from '@/test/markup'

const piece = (enabled?: boolean) => ({ textileId: 'test-piece', name: 'Test tee', ...(enabled === undefined ? {} : { adviceReminder: { enabled, recordedAt: 1, recordedBy: 'private' } }) }) as unknown as Textile

test('advice reason is visible and its source disclosure is keyboard accessible and initially collapsed', () => {
  const markup = renderToStaticMarkup(<AdviceExplanation advice={{ reason: 'Optional general graphic tip; exact method unknown.', source: '<script>example</script>' }} />)
  expect(markup).toContain('exact method unknown')
  expect(markup).toContain('aria-expanded="false"')
  expect(markup).toContain('Advice source')
  expect(markup).not.toContain('<script>')
})

test('construction summaries distinguish unknown, absence, observation and verification with exact fact sources', () => {
  const markup = renderToStaticMarkup(<ConstructionSummary facts={{
    zipper: { presence: 'present', confidence: 'observed', source: 'Checked on this piece' },
    hooks: { presence: 'absent', confidence: 'verified', source: 'Exact garment reference' },
    delicateTrim: { presence: 'unknown', confidence: 'unknown', source: '' },
  }} />)
  expect(markup).toContain('Zippers: present · observed · Source: Checked on this piece')
  expect(markup).toContain('Hooks and eyes: not present · verified · Source: Exact garment reference')
  expect(markup).toContain('Buttons: not recorded or unclear')
  expect(markup).toContain('Delicate trim (such as lace, beads or sequins): not recorded or unclear')
})

test('construction editor starts with no selected pieces or inferred facts and requires explicit confirmation', () => {
  const markup = renderWithConvex(<ConstructionSheet textiles={[{ ...piece(), name: 'Embroidered zip lace dress' }, { ...piece(), textileId: 'second-piece' } as Textile]} onClose={() => undefined} />)
  expect(markup).toContain('Construction details')
  expect(markup).toContain('Unknown does not mean absent.')
  expect(markup).toContain('the care label still controls washing and settings.')
  expect(markup).toContain('Select all matching pieces')
  expect(markup).toContain('I’ve checked these construction facts for these 0 pieces.')
  expect(markup).not.toContain('checked=""')
  expect(markup).toContain('disabled=""')
  expect(markup).not.toContain('Verified from an exact garment reference') // no known features by name
})

test('future-advice preference names its piece scope and reset without changing label care', () => {
  const standard = renderWithConvex(<AdviceReminderControls textiles={[piece()]} />)
  expect(standard).toContain('this piece')
  expect(standard).toContain('shown when supported · default')
  expect(standard).toContain('Required label instructions remain visible.')
  expect(standard).not.toContain('Reset advice preference')
  const hidden = renderWithConvex(<AdviceReminderControls textiles={[piece(false), piece(false)]} disabled />)
  expect(hidden).toContain('these 2 pieces: hidden · remembered')
  expect(hidden).toContain('Show optional advice')
  expect(hidden).toContain('Reset advice preference')
  expect(hidden).toContain(' disabled=""')
})

test('print details stay collapsed until the care list row expands them', () => {
  expect(renderWithConvex(<GarmentPrintDetails textiles={[piece()]} expanded={false} />)).not.toContain('Record print details')
  expect(renderWithConvex(<GarmentPrintDetails textiles={[piece()]} expanded />)).toContain('Record print details')
})

test('matching pieces with the same facts form one unlabelled group; differing pieces are named by count and fact', () => {
  const pieces = [{ ...piece(), textileId: 'a', fact: { kind: 'printed', method: 'dtg' } }, { ...piece(), textileId: 'b', fact: { method: 'dtg', kind: 'printed' } }, { ...piece(), textileId: 'c', fact: { kind: 'embroidered' } }] as unknown as (Textile & { fact: { kind: string } })[]
  const fact = (entry: Textile) => (entry as (typeof pieces)[number]).fact
  const same = factGroups(pieces.slice(0, 2), fact, (entry) => fact(entry).kind)
  expect(same).toHaveLength(1)
  expect(same[0]!.label).toBeUndefined()
  expect(same[0]!.members.map((entry) => entry.textileId)).toEqual(['a', 'b'])
  expect(factGroups(pieces, fact, (entry) => fact(entry).kind).map((group) => group.label)).toEqual(['2 pieces · printed', '1 piece · embroidered'])
  // Different facts that read alike stay distinguishable without falling back to a position.
  expect(factGroups(pieces, fact, () => 'recorded').map((group) => group.label)).toEqual(['2 pieces · recorded', '1 piece · recorded, recorded differently'])
})

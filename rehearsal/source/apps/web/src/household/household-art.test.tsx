import { renderToStaticMarkup } from '@/test/markup'
import { expect, test } from 'vitest'

import { designIconPaths } from '@/kit/design-icons'
import { ProductArt } from '@/household/household-art'
import type { Supply } from '@/household/inventory-types'

const supply = (overrides: Partial<Supply> = {}): Supply => ({
  supplyId: 's1' as Supply['supplyId'],
  name: 'Tide Original',
  kind: 'chemical',
  use: 'detergent',
  formulation: { name: 'Tide Original', form: 'liquid' },
  measure: { kind: 'cap', marks: [{ label: '1' }] },
  archived: false,
  provenance: { source: 'label_taps', confidence: 'observed' },
  rules: [],
  ...overrides,
} as Supply)

test('a dryer sheet is drawn as a sheet, never as the detergent-sheets photo', () => {
  const markup = renderToStaticMarkup(<ProductArt supply={supply({ name: 'Bounce', kind: 'dryer_sheet', use: 'dryer_sheets', measure: { kind: 'count', countUnit: 'sheet' }, formulation: null })} />)
  expect(markup).not.toContain('detergent-sheets')
  expect(markup).toContain(designIconPaths.dryerSheet)
  expect(renderToStaticMarkup(<ProductArt supply={supply()} />)).toContain('detergent-photo.webp')
})

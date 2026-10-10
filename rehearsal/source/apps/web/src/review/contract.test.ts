import { expect, test } from 'vitest'
import { alignment, contractDimensions, coverage } from './contract'

const towelFabric = { id: 'intake.towel.fabric', component: 'apps/web/src/closet/add-clothes.tsx', preview: 'working-synthetic', implementation: 'present', designCoverage: 'rules/bounded specimen; full scenario unverified', reference: 'missing', behavior: 'not verified by this inventory; see scoped checks', native: 'missing', device: 'unverified' }

test('a working web screen without native, behavior or device evidence is not reported as aligned', () => {
  const dimensions = contractDimensions(towelFabric)
  expect(dimensions.find((d) => d.label === 'Web preview')!.tone).toBe('proven')
  expect(dimensions.find((d) => d.label === 'Native (iOS, Android)')!.tone).toBe('missing')
  expect(dimensions.find((d) => d.label === 'Design intent')!.tone).toBe('partial')
  expect(alignment(dimensions, 0)).toBe('Unknown / evidence stale')
})

test('an open review is unreviewed drift, even when every dimension is proven', () => {
  const proven = { ...towelFabric, designCoverage: 'missing', reference: 'source-current; static only', behavior: 'scoped local behavior passed; other conditions unverified', native: 'present', device: 'accepted' }
  const dimensions = contractDimensions(proven).map((d) => ({ ...d, tone: 'proven' as const }))
  expect(alignment(dimensions, 0)).toBe('Aligned')
  expect(alignment(dimensions, 1)).toBe('Unreviewed drift')
})

test('stale references and partial specimens count as partial, never proven', () => {
  const rows = coverage([towelFabric, { ...towelFabric, id: 'legacy.home-one', preview: 'visual-or-partial', reference: 'stale' }])
  expect(rows.find((row) => row.label === 'Web preview')).toMatchObject({ proven: 1, partial: 1, total: 2 })
  expect(rows.find((row) => row.label === 'Design reference')).toMatchObject({ proven: 0, partial: 1 })
})

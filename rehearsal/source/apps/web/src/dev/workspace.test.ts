import { expect, test } from 'vitest'

import { evidenceLevels, treatmentPhase } from '@washcloset/planner'

test('the shared planner vocabulary resolves through Vite', () => {
  expect(evidenceLevels).toContain('verified')
  expect(treatmentPhase({ placement: 'detergent_compartment', timing: null }, { applianceType: 'front_load_washer' })).toBe('dispenser')
})

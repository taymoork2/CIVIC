import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'

import { TrialNote } from '@/laundry/laundry-ui'

afterEach(() => { vi.unstubAllEnvs() })

test('trial notes show only in a build that asks for them', () => {
  vi.stubEnv('VITE_TRIAL_NOTES', '')
  expect(renderToStaticMarkup(<TrialNote>Doses read the label row you recorded.</TrialNote>)).toBe('')
  vi.stubEnv('VITE_TRIAL_NOTES', '1')
  const markup = renderToStaticMarkup(<TrialNote>Doses read the label row you recorded.</TrialNote>)
  expect(markup).toContain('Trial note · ')
  expect(markup).toContain('Doses read the label row you recorded.')
})

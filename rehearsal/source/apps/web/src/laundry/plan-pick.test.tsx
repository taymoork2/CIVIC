import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'

import { TodayCard } from '@/laundry/plan-pick'

test('large days show the count and next task without an unreadable miniature timeline', () => {
  const timeline = Array.from({ length: 50 }, (_, index) => ({ key: String(index), name: `Load ${index + 1}`, when: null, weight: 1, next: index === 12 }))
  const markup = renderToStaticMarkup(<TodayCard headline="50 loads" timeline={timeline} upNext={{ title: 'Start load 13', onOpen: () => {} }} />)
  expect(markup).toContain('50 loads')
  expect(markup).not.toContain('<ol')
  expect(markup).toContain('Start load 13')
  expect(markup).not.toContain('Load 50')
})

test('small days keep every timeline entry and unknown times stay unknown', () => {
  const markup = renderToStaticMarkup(<TodayCard headline="2 loads" timeline={[
    { key: 'a', name: 'Whites', when: 'Now', weight: 1, next: true },
    { key: 'b', name: 'Darks', when: null, weight: 2, next: false },
  ]} upNext={null} />)
  expect(markup.match(/<li /g)).toHaveLength(2)
  expect(markup).toContain('Whites')
  expect(markup).toContain('Darks')
  expect(markup).toContain('Now')
  expect(markup).not.toContain('more loads')
})

import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChemistryScreen } from '@/laundry/chemistry-view'

const screen = (place?: { name: string; number: number; count: number } | null) => renderToStaticMarkup(
  <ChemistryScreen groups={[]} settings={[]} pieces={[]} washer="Washer 3" unrecorded={false} startAmounts={false} onContinue={() => undefined} continueLabel="Go" disabled={false} back={null} {...(place === undefined ? {} : { place })} />,
)

test('What goes in shows the load\'s place in the day over the title only when it was kept', () => {
  expect(screen({ name: 'Whites', number: 1, count: 3 })).toContain('Load 1 of 3 · Whites')
  expect(screen(null)).not.toContain('Load 1 of')
  expect(screen()).toContain('What goes in')
})

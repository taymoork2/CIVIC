import { expect, test } from 'vitest'
import { semanticMarkup } from './markup'

test('semantic markup removes presentation and retains identifiers and behavioral attributes', () => {
  expect(semanticMarkup('<button data-slot="button" data-size="default" class="flex px-3 text-ink chip aria-pressed:bg-muted" type="button" aria-pressed="true" disabled="">Wash</button>')).toBe('<button type="button" class="chip" aria-pressed="true" disabled="">Wash</button>')
  expect(semanticMarkup('<p class="text-button text-sm [&_svg]:size-4">primary-dock</p>')).toBe('<p class="text-button">primary-dock</p>')
})

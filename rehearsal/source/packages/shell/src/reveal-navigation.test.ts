import { expect, test, vi } from 'vitest'
import { revealNavigation } from './reveal-navigation'

test('following a screen scrolls only its outline containers, without moving the page', () => {
  let offset = 0
  const list = { getBoundingClientRect: () => ({ left: 0, right: 200, top: 60, bottom: 104 }), scrollBy: vi.fn(({ left }) => { offset += left }) }
  const button = { closest: () => list, getBoundingClientRect: () => ({ left: 400 - offset, right: 440 - offset, top: 60, bottom: 104 }) }
  const aside = { querySelector: () => button, getBoundingClientRect: () => ({ left: 0, right: 220, top: 0, bottom: 90 }), scrollBy: vi.fn() }
  revealNavigation(aside as unknown as HTMLElement)
  expect(list.scrollBy).toHaveBeenCalledWith({ left: 240, top: 0, behavior: 'instant' })
  expect(aside.scrollBy).toHaveBeenCalledWith({ left: 0, top: 14, behavior: 'instant' })
})

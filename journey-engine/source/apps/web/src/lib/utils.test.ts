import { expect, test } from 'vitest'
import { cn } from './utils'

test('a WashCloset font-size class and a theme colour class are unrelated, and both survive', () => {
  expect(cn('text-step-1', 'text-ink')).toBe('text-step-1 text-ink')
})

test('a WashCloset theme colour still wins over a plain Tailwind colour in the same group', () => {
  expect(cn('bg-primary', 'bg-sig')).toBe('bg-sig')
})

test('two WashCloset radii conflict like any other Tailwind rounded-* pair - the later one wins', () => {
  expect(cn('rounded-card', 'rounded-control')).toBe('rounded-control')
})

test('font sizes preserve independently chosen line heights and still merge conflicting sizes', () => {
  expect(cn('leading-[1.2]', 'text-[length:var(--step-1)]')).toBe('leading-[1.2] text-[length:var(--step-1)]')
  expect(cn('text-step-1', 'text-step-2', 'leading-snug')).toBe('text-step-2 leading-snug')
  expect(cn('leading-snug', 'text-base/7')).toBe('text-base/7')
})

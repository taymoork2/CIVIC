import { renderToStaticMarkup } from '@/test/markup'
import { expect, test } from 'vitest'

import { IconChoiceGrid } from '@/kit/icon-choice-grid'

const options = [
  { value: 'liquid', label: 'Liquid', art: <svg data-art="liquid" /> },
  { value: 'pods', label: 'Pods', art: <svg data-art="pods" /> },
  { value: 'powder', label: 'Powder', art: <svg data-art="powder" /> },
] as const

test('each tile is one button named by its visible label, with its art', () => {
  const markup = renderToStaticMarkup(<IconChoiceGrid label="Product type" options={options} value={null} onPick={() => undefined} />)
  expect(markup.match(/<button/g)).toHaveLength(3)
  expect(markup).toContain('data-art="pods"')
  expect(markup).toContain('<span>Pods</span>')
  expect(markup).toContain('role="group"')
  expect(markup).toContain('Product type')
})

test('the picked tile is pressed: tinted with a thicker outline, not only a color', () => {
  const markup = renderToStaticMarkup(<IconChoiceGrid label="Product type" options={options} value="pods" onPick={() => undefined} />)
  expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1)
  expect(markup.match(/aria-pressed="false"/g)).toHaveLength(2)
})

test('a step heading can name the group instead of a second visible label', () => {
  const markup = renderToStaticMarkup(<IconChoiceGrid labelledBy="step-title" options={options} value={null} onPick={() => undefined} columns={4} />)
  expect(markup).toContain('aria-labelledby="step-title"')
  expect(markup).not.toContain('icon-choice-legend')
  expect(markup).toContain('--icon-choice-columns:4')
})

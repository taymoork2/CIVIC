import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from '@/test/markup'
import { beforeEach, expect, test, vi } from 'vitest'
import { GarmentPrivacy } from './garment-privacy'

const switches = vi.hoisted(() => [] as ComponentProps<typeof import('@/components/ui/button').Button>[])
vi.mock('@/components/ui/button', async (original) => {
  const actual = await original<typeof import('@/components/ui/button')>()
  return { ...actual, Button: (props: ComponentProps<typeof actual.Button>) => {
    if (props.role === 'switch') switches.push(props)
    return <actual.Button {...props} />
  } }
})
beforeEach(() => { switches.length = 0 })

test.each([false, true])('the Private switch reports %s and stages the opposite value', async (on) => {
  const change = vi.fn()
  const markup = renderToStaticMarkup(<GarmentPrivacy on={on} onChange={change} disabled={false} />)
  expect(markup).toContain('role="switch"')
  expect(markup).toContain(`aria-checked="${on}"`)
  expect(markup).toContain('aria-label="Private"')
  expect(markup).toContain("Others in your household won&#x27;t see it; care still applies")
  expect(switches[0]!.disabled).toBe(false)
  switches[0]!.onClick!({} as never)
  expect(change).toHaveBeenCalledWith(!on)
})

test('a member cannot toggle another person’s public garment or a mixed-ownership group', () => {
  const change = vi.fn()
  renderToStaticMarkup(<GarmentPrivacy on={false} onChange={change} disabled />)
  expect(switches[0]!.disabled).toBe(true)
  switches[0]!.onClick!({} as never)
  expect(change).not.toHaveBeenCalled()
})

test('a preview without a mutation shows a disabled switch', () => {
  const markup = renderToStaticMarkup(<GarmentPrivacy on onChange={() => {}} disabled />)
  expect(markup).toContain('aria-checked="true"')
  expect(switches[0]!.disabled).toBe(true)
})

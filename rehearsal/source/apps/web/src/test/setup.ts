import { cloneElement, createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { vi } from 'vitest'

/**
 * Base UI portals only mount in a browser, so a static render would drop every sheet. Tests render
 * the sheet inline instead: the same popup element and attributes, without the portal and scrim.
 * Focus, Escape and outside-press behavior belong to Base UI and the Playwright journeys.
 */
vi.mock('@/components/ui/sheet', () => {
  const pass = ({ children }: { children?: ReactNode }) => children ?? null
  const strip = ({ initialFocus: _i, finalFocus: _f, render: _r, ...props }: Record<string, unknown>) => props
  return {
    SheetRoot: pass,
    SheetPortal: pass,
    SheetBackdrop: () => null,
    SheetContent: (props: Record<string, unknown>) => createElement('div', props),
    SheetPopup: (props: Record<string, unknown>) => createElement('div', { role: 'dialog', 'aria-modal': 'true', ...strip(props) }),
    SheetTitle: (props: Record<string, unknown>) => createElement('h2', strip(props)),
    SheetDescription: (props: Record<string, unknown>) => createElement('p', strip(props)),
    SheetClose: (props: Record<string, unknown>) => createElement('button', { type: 'button', ...strip(props) }),
  }
})

/** Popover panels portal too; tests read them inline after their trigger. */
const floating = () => {
  const pass = ({ children }: { children?: ReactNode }) => children ?? null
  const strip = ({ render: _r, align: _a, side: _s, sideOffset: _o, closeOnClick: _c, ...props }: Record<string, unknown>) => props
  const trigger = ({ render, children, ...props }: { render?: unknown; children?: ReactNode } & Record<string, unknown>) =>
    isValidElement(render) ? cloneElement(render as ReactElement<Record<string, unknown>>, props, children) : createElement('button', { type: 'button', ...props }, children)
  return { pass, trigger, content: (props: Record<string, unknown>) => createElement('div', strip(props)) }
}
vi.mock('@/components/ui/popover', () => {
  const f = floating()
  return { Popover: f.pass, PopoverTrigger: f.trigger, PopoverContent: f.content }
})

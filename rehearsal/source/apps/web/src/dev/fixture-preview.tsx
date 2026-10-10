import { ConvexProvider, type ConvexReactClient } from 'convex/react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { previewUnavailable } from '@/dev/preview-calls'

/**
 * Dev-only plumbing for the design specimens: a Convex client that answers the presenters' own
 * queries from fixture data and refuses every save, a seed for values a presenter keeps on the phone,
 * and taps that open a step the presenter holds in its own state. Nothing reaches the backend.
 */

/** Queries by function name ("dryingQueue:queue"); anything else stays loading. Every mutation and action is refused. */
export function FixtureConvex({ data, children }: { data: Readonly<Record<string, unknown>>; children: ReactNode }) {
  const [client] = useState(() => ({
    watchQuery: (query: FunctionReference<'query'>) => ({ localQueryResult: () => data[getFunctionName(query)], onUpdate: () => () => {}, journal: () => undefined }),
    mutation: previewUnavailable('save to the household'),
    action: previewUnavailable('run a server action'),
  }) as unknown as ConvexReactClient)
  return <ConvexProvider client={client}>{children}</ConvexProvider>
}

export type PhoneSeed = { readonly key: string; readonly event: string; readonly value: unknown }

/**
 * Puts values in this phone's storage while the specimen is open, as the presenter would have saved
 * them, and puts back what was there before when it closes.
 */
export function SeedPhone({ seeds }: { seeds: readonly PhoneSeed[] }) {
  useEffect(() => {
    const before = seeds.map(({ key, event, value }) => {
      let previous: string | null = null
      try {
        previous = window.localStorage.getItem(key)
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // Blocked storage: the specimen shows the presenter's empty state.
      }
      window.dispatchEvent(new Event(event))
      return { key, event, previous }
    })
    return () => {
      for (const { key, event, previous } of before) {
        try {
          if (previous === null) window.localStorage.removeItem(key)
          else window.localStorage.setItem(key, previous)
        } catch {
          // Nothing was stored.
        }
        window.dispatchEvent(new Event(event))
      }
    }
  }, [seeds])
  return null
}

/** One step a person would take: tap the button whose text starts with `tap`, type into `type`'s input, or open a `<details>`. */
export type PreviewStep = { readonly tap: string } | { readonly click: string } | { readonly type: string; readonly value: string } | { readonly open: string }

/**
 * Takes `steps` once after the specimen mounts, in order, to show a state the presenter only reaches
 * by a tap. Each tap runs the presenter's own handler; the chosen steps never save anything.
 */
export function PreviewSteps({ steps }: { steps: readonly PreviewStep[] }) {
  // Steps already taken survive a remount, so none is taken twice.
  const taken = useRef(0)
  useEffect(() => {
    let frames = 0
    let frame = 0
    // A step waits for its control: a presenter that reads the phone's storage renders it a moment later.
    const next = () => {
      while (taken.current < steps.length) {
        const step = steps[taken.current]!
        const target = 'tap' in step ? [...document.querySelectorAll('button')].find((button) => button.textContent?.trim().startsWith(step.tap))
          : document.querySelector<HTMLElement>('click' in step ? step.click : 'open' in step ? step.open : step.type)
        if (target === undefined || target === null) {
          if (++frames < 120) frame = requestAnimationFrame(next)
          return
        }
        if ('tap' in step || 'click' in step) target.click()
        else if ('open' in step) target.setAttribute('open', '')
        else {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, step.value)
          target.dispatchEvent(new Event('input', { bubbles: true }))
        }
        taken.current++
      }
    }
    next()
    return () => cancelAnimationFrame(frame)
  }, [steps])
  return null
}

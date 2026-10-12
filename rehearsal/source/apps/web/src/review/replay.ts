import type { MapScreen } from './app-map'

// Replay from start (roadmap step 6): walk a journey's declared paths from its first screen to
// a selected one in a fresh run, through the app's own controls. Only declared paths are
// replayed, one step at a time, and a step that misses stops the replay visibly; nothing a
// replay didn't reach is claimed. Deterministic, with no model calls.

export type ReplayStep = { from: string; action: string; to: string }
export type ReplayResult = { steps: ReplayStep[]; done: number; miss?: string }

/** The shortest chain of declared paths from start to target, or null when none reaches it. */
export function replayPath(screens: MapScreen[], start: string, target: string): ReplayStep[] | null {
  const known = new Map(screens.map((screen) => [screen.id, screen]))
  if (!known.has(start) || !known.has(target)) return null
  const via = new Map<string, ReplayStep | null>([[start, null]])
  const queue = [start]
  while (queue.length > 0) {
    const at = queue.shift()!
    if (at === target) break
    for (const edge of known.get(at)!.edges) {
      if (!known.has(edge.destination) || via.has(edge.destination)) continue
      via.set(edge.destination, { from: at, action: edge.action, to: edge.destination })
      queue.push(edge.destination)
    }
  }
  if (!via.has(target)) return null
  const steps: ReplayStep[] = []
  for (let step = via.get(target); step; step = via.get(step.from)) steps.unshift(step)
  return steps
}

/** A button or link whose accessible name is exactly the action, as a person would find it. */
export function findControl(doc: Document, name: string): HTMLElement | null {
  const label = (element: Element) => (element.getAttribute('aria-label') ?? element.textContent ?? '').replace(/\s+/g, ' ').trim()
  return [...doc.querySelectorAll<HTMLElement>('button, a[href], [role="button"], [role="link"]')].find((element) => label(element) === name && !(element as HTMLButtonElement).disabled) ?? null
}

export interface ReplayFrame {
  document(): Document | undefined
  /** The screen the adapter reports it is on. */
  screen(): string | undefined
}

/** Plays each step by clicking its control and waiting for the adapter to land on the next screen. */
export async function replay(frame: ReplayFrame, steps: ReplayStep[], label: (id: string) => string, options = { timeout: 5000, interval: 50 }): Promise<ReplayResult> {
  const reached = async (screen: string) => {
    for (let waited = 0; waited <= options.timeout; waited += options.interval) {
      if (frame.screen() === screen) return true
      await new Promise((done) => setTimeout(done, options.interval))
    }
    return false
  }
  if (steps.length > 0 && !(await reached(steps[0]!.from))) return { steps, done: 0, miss: `The run didn't start at ${label(steps[0]!.from)}.` }
  for (const [index, step] of steps.entries()) {
    const doc = frame.document()
    const control = doc && findControl(doc, step.action)
    if (!control) return { steps, done: index, miss: `Replay stopped at ${label(step.from)}: no control named “${step.action}”.` }
    control.click()
    if (!(await reached(step.to))) {
      const now = frame.screen()
      return { steps, done: index, miss: `Replay stopped at ${label(step.from)}: “${step.action}” ${now && now !== step.from ? `led to ${label(now)}` : 'stayed here'}, not ${label(step.to)}.` }
    }
  }
  return { steps, done: steps.length }
}

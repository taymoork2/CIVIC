import { whyText } from '@/copy'

/**
 * "Why?" at the machine: one short, sourced reason behind a tap, collapsed until asked, open by
 * itself only the first time a given product meets a given machine kind on this device, then quiet.
 * Never a tutorial that blocks the step: the reason only ever explains a rule that is easy to get
 * wrong by habit — detergent going in the empty tub before the clothes, or a rinse product added
 * mid-cycle instead of at the wash. Content lives with the rule it explains (the label's own timing,
 * or the machine's own door), so a new trigger reads its "why" from facts already on the step.
 */

export type WhyLine = { readonly text: string; readonly source: string }

/** The step facts a why-line reads: the label's placement and stage, the machine phase, and the product name. */
export type WhyStep = { readonly phase: string; readonly stage?: string; readonly placement: string; readonly supplyName: string | null }

/**
 * The one short reason for this step, sourced, or null when there is nothing worth teaching here.
 * Two moments earn a "why": a product going into the empty tub before the clothes (no dispenser), and
 * a rinse-stage product added mid-cycle instead of with the load.
 */
export function whyLine(step: WhyStep): WhyLine | null {
  const product = step.supplyName ?? whyText.product
  if (step.placement === 'direct_to_drum' && step.phase === 'drum') {
    return {
      text: whyText.emptyTub(product),
      source: whyText.machineManual,
    }
  }
  if (step.stage === 'rinse' && step.phase === 'cycle') {
    return { text: whyText.rinseOnly(product), source: whyText.productLabel }
  }
  return null
}

// ---- Remembering the first time, per device ----------------------------------------------------

const prefix = 'washcloset:private:'
const seenKey = `${prefix}why-seen`
const maxEntries = 200

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function readSeen(): string[] {
  try {
    const raw = storage()?.getItem(seenKey)
    if (raw === null || raw === undefined) return []
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

/** A product paired with a machine kind, keyed by the fact that actually changes the "why": whether the door locks. */
export function whyKey(supplyId: string, doorLocks: boolean): string {
  return `${supplyId}:${doorLocks ? 'locked' : 'unlocked'}`
}

/** Whether this key has opened its "why" before on this device; false the first time, so it opens by itself. */
export function whySeen(key: string): boolean {
  return readSeen().includes(key)
}

/** Marks a key seen. Wrapped in try/catch: storage may be full, private-mode blocked, or absent. */
export function markWhySeen(key: string): void {
  try {
    const seen = readSeen()
    if (seen.includes(key)) return
    storage()?.setItem(seenKey, JSON.stringify([...seen, key].slice(-maxEntries)))
  } catch {
    // Best effort only: a "why" that opens again next time is not worth surfacing as a failure.
  }
}

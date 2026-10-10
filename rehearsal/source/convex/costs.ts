import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel'
import { query } from './_generated/server'
import { authorize } from './access'

/** How many of the newest records a household's cost list reads. */
const limit = 500

export type CostMissing = 'no_machine' | 'no_price' | 'no_block' | 'no_minutes'

/** One machine start. `price` is null when the machine's recorded facts do not give one: never estimated. */
export type CostEntry = {
  readonly id: string
  readonly kind: 'washer' | 'dryer'
  readonly machineName: string | null
  readonly at: number
  readonly price: number | null
  readonly missing: CostMissing | null
  /** Dryers: the minutes the dryer showed, and the time blocks they are billed in. */
  readonly minutes: number | null
  readonly blocks: number | null
  readonly blockMinutes: number | null
}

type PricedMachine = Pick<Doc<'machines'>, 'pricePerStart'>

const recorded = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value) && value >= 0

/** `blockMinutes` is recorded on dryers by the machine record; read defensively where it is not yet typed. */
export function blockMinutesOf(machine: PricedMachine): number | null {
  const block = (machine as { blockMinutes?: number }).blockMinutes
  return block !== undefined && Number.isFinite(block) && block > 0 ? block : null
}

/** A washer costs its recorded price once per started load. */
export function washerCost(machine: PricedMachine | null): Pick<CostEntry, 'price' | 'missing' | 'minutes' | 'blocks' | 'blockMinutes'> {
  const base = { minutes: null, blocks: null, blockMinutes: null }
  if (machine === null) return { price: null, missing: 'no_machine', ...base }
  if (!recorded(machine.pricePerStart)) return { price: null, missing: 'no_price', ...base }
  return { price: machine.pricePerStart, missing: null, ...base }
}

/** A dryer costs its recorded price for each started time block: ceil(minutes / block) times the price. */
export function dryerCost(machine: PricedMachine | null, minutes: number | undefined): Pick<CostEntry, 'price' | 'missing' | 'minutes' | 'blocks' | 'blockMinutes'> {
  const shown = minutes !== undefined && Number.isFinite(minutes) && minutes > 0 ? minutes : null
  const blockMinutes = machine === null ? null : blockMinutesOf(machine)
  const none = { minutes: shown, blocks: null, blockMinutes }
  if (machine === null) return { price: null, missing: 'no_machine', ...none }
  if (!recorded(machine.pricePerStart)) return { price: null, missing: 'no_price', ...none }
  if (blockMinutes === null) return { price: null, missing: 'no_block', ...none }
  if (shown === null) return { price: null, missing: 'no_minutes', ...none }
  const blocks = Math.ceil(shown / blockMinutes)
  return { price: Math.round(blocks * machine.pricePerStart * 100) / 100, missing: null, minutes: shown, blocks, blockMinutes }
}

/**
 * What the household's machines have charged, only from prices recorded on the machines: washer
 * starts at the washer's price, dryer runs per time block. Anything without a recorded price comes
 * back with `price: null` so the screen can say so and leave it out of totals.
 */
export const entries = query({
  args: { householdId: v.id('households') },
  handler: async (ctx, args): Promise<CostEntry[]> => {
    await authorize(ctx, 'household.read', { householdId: args.householdId })
    const machines = new Map<Id<'machines'>, Doc<'machines'> | null>()
    const machine = async (id: Id<'machines'> | undefined) => {
      if (id === undefined) return null
      if (!machines.has(id)) {
        const found = await ctx.db.get(id)
        machines.set(id, found !== null && found.householdId === args.householdId ? found : null)
      }
      return machines.get(id) ?? null
    }

    const sessions = await ctx.db.query('sessions').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).order('desc').take(limit)
    const washes = await Promise.all(sessions.flatMap((session) => session.machineStartedAt === undefined ? [] : [(async (): Promise<CostEntry> => {
      const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
      const washer = await machine(timeline?.machineId)
      return { id: `wash:${session._id}`, kind: 'washer', machineName: washer?.name ?? null, at: session.machineStartedAt ?? session.startedAt ?? 0, ...washerCost(washer) }
    })()]))

    const [running, done] = await Promise.all((['running', 'done'] as const).map((status) =>
      ctx.db.query('dryingRuns').withIndex('by_household_status', (q) => q.eq('householdId', args.householdId).eq('status', status)).order('desc').take(limit)))
    // Each start of a dryer run is its own payment: the first, and every restart for damp pieces.
    const dries = (await Promise.all([...(running ?? []), ...(done ?? [])].filter((run) => run.kind === 'dryer').map(async (run): Promise<CostEntry[]> => {
      const dryer = await machine(run.dryerId)
      const starts = [...(run.earlier ?? []), { startedAt: run.startedAt, minutes: run.minutes }]
      return starts.map((start, index) => ({ id: `dry:${run._id}:${index}`, kind: 'dryer', machineName: dryer?.name ?? run.dryerName ?? null, at: start.startedAt, ...dryerCost(dryer, start.minutes) }))
    }))).flat()

    return [...washes, ...dries].sort((left, right) => right.at - left.at)
  },
})

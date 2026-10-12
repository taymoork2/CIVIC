import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel'
import { query } from './_generated/server'
import { authorize } from './access'

/**
 * Closet milestones, read from what happened and nothing else: the first garment saved and the first
 * wash put away. Nothing is written, so there is no streak, score or flag to keep in step; whether
 * one was dismissed is each device's own choice (the web keeps it in private state).
 *
 * "Put away" is a wash that ended with the garment back to Ready: a drying put-away (`dried`), or a
 * load that finished with nothing left hanging (`washed` in a session with no `hung` row).
 */

/** Pieces saved together share a name and land within a minute of each other. */
const sameBatchMs = 60_000
/** Households are small; this bounds the history read for a household that has washed a lot. */
const washCandidateLimit = 25

type MilestoneCare = Doc<'care'> | null

export type EarnedMilestones = {
  /** The earliest garment saved, the pieces saved with it, and how many of its three tag answers are known. */
  firstGarment: { at: number; name: string; count: number; careKnown: number } | null
  /** The earliest wash that put pieces back to Ready, and how many pieces it returned. */
  firstWash: { at: number; pieces: number } | null
}

/** How many of the three tag answers (wash, bleach, dry) the recorded label gives; unknown counts as not known. */
export function careKnown(care: MilestoneCare): number {
  if (care === null) return 0
  return [care.washMethod, care.bleach, care.dryMethod].filter((answer) => answer !== undefined && answer !== 'unknown').length
}

export const earned = query({
  args: { householdId: v.id('households') },
  handler: async (ctx, args): Promise<EarnedMilestones> => {
    await authorize(ctx, 'household.read', { householdId: args.householdId })
    const textiles = (await ctx.db.query('textiles').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect())
      .filter((textile) => textile.guest !== true && textile.trashedAt === undefined)

    // First garment saved: the earliest piece, with the pieces saved in the same batch.
    const first = [...textiles].sort((left, right) => left.createdAt - right.createdAt)[0]
    let firstGarment: EarnedMilestones['firstGarment'] = null
    if (first !== undefined) {
      const batch = textiles.filter((textile) => textile.name === first.name && Math.abs(textile.createdAt - first.createdAt) <= sameBatchMs)
      const care = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', first._id)).unique()
      firstGarment = { at: first.createdAt, name: first.name, count: batch.length, careKnown: careKnown(care) }
    }

    // First wash put away: the earliest event that returned a washed piece to Ready.
    const candidates = textiles
      .filter((textile) => textile.washCount > 0)
      .sort((left, right) => (left.lastCleanedAt ?? left.createdAt) - (right.lastCleanedAt ?? right.createdAt))
      .slice(0, washCandidateLimit)
    const returns: { at: number; sessionId: Id<'sessions'> | undefined; textileId: Id<'textiles'> }[] = []
    for (const textile of candidates) {
      const history = await ctx.db.query('history').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).collect()
      const hung = new Set(history.filter((row) => row.event === 'hung').map((row) => row.sessionId))
      const back = history.find((row) => row.event === 'dried' || (row.event === 'washed' && row.sessionId !== undefined && !hung.has(row.sessionId)))
      if (back !== undefined) returns.push({ at: back.occurredAt, sessionId: back.sessionId, textileId: textile._id })
    }
    returns.sort((left, right) => left.at - right.at)
    const firstReturn = returns[0]
    const firstWash = firstReturn === undefined ? null : {
      at: firstReturn.at,
      pieces: returns.filter((entry) => entry.sessionId === firstReturn.sessionId).length,
    }

    return { firstGarment, firstWash }
  },
})

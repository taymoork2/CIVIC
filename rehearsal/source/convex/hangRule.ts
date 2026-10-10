import { materialCareProblem, kindBulkUnits, labelFromCeiling, pieceMethod, tumbleCeiling, type DryingMethod } from '@washcloset/planner'

import type { Doc } from './_generated/dataModel'
import type { ReadCtx } from './access'
import { fail } from './errors'
import { plannerCare } from './plans'
import { routineCurrent, routineLabelHash } from './personalRoutineValues'

/** The shared hang rule: plain functions, no endpoints, so sessions and the drying queue can both use it. */

export async function pieceFacts(ctx: ReadCtx, piece: Doc<'dryingPieces'>, session: Doc<'sessions'> | null) {
  const textile = await ctx.db.get(piece.textileId)
  const care = textile === null ? null : await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).unique()
  const bulkUnits = textile?.bulkUnits ?? (textile?.kind === undefined ? undefined : kindBulkUnits[textile.kind]) ?? 1
  const labelCeiling = tumbleCeiling({ id: piece.textileId, bulkUnits, care: plannerCare(care) as never, material: care?.material ?? null })
  const label = labelFromCeiling(labelCeiling)
  // "Air dry" from before methods existed is a rack or line for this time only.
  const once: DryingMethod | null = piece.method ?? (piece.air === true ? 'rack_line' : null)
  const preference = textile?.dryingPreference?.method ?? null
  if (session !== null && session.householdId !== piece.householdId) fail('forbidden', 'Forbidden')
  const captured = session?.preparationContext?.garments.find((garment) => garment.textileId === piece.textileId)?.personalRoutine
  const stillChosen = captured !== undefined && textile?.personalRoutine?.revision === captured.revision
  const routine = stillChosen && routineCurrent(captured, care) && materialCareProblem(care?.material, { dryMethod: captured.settings.dry?.method === 'tumble' ? 'tumble_dry' : undefined, dryHeat: captured.settings.dry?.heat }) === null ? captured : undefined
  const stained = piece.stained === true
  const choice = pieceMethod(label, { once, routine: routine?.settings.dry?.method, preference, stained })
  const ceiling = stained ? tumbleCeiling({ id: piece.textileId, bulkUnits, care: plannerCare(care) as never, material: care?.material ?? null, stained })
    : choice.source === 'routine' && routine?.settings.dry?.method === 'tumble' && routine.settings.dry.heat !== undefined
      ? { maxHeat: routine.settings.dry.heat } : labelCeiling
  return { textile, material: care?.material, bulkUnits, stained, ceiling, label, labelCeiling, labelHash: routineLabelHash(care), preference, instructions: care?.instructions, choice, routine,
    noSpinRecorded: session?.cycle !== undefined && session.washerContext?.washProcesses?.[session.cycle]?.spinRpm === 0,
    routineNeedsReview: stillChosen && captured?.settings.dry !== undefined && routine === undefined && once === null }
}

export type PieceFacts = Awaited<ReturnType<typeof pieceFacts>>

/**
 * Whether a piece's drying may switch to a rack or line this time only: its own way (routine,
 * preference or label) is the dryer or a rack, the label does not say dry flat, its My routine needs
 * no review, and it has no recorded label drying steps.
 */
export const mayHangOnce = (fact: PieceFacts) => (fact.choice.method === 'tumble' || fact.choice.method === 'rack_line') && fact.label !== 'dry_flat' && !fact.routineNeedsReview
  && (fact.instructions === undefined || fact.instructions.beforeDrying.length + fact.instructions.drying.length + fact.instructions.afterDrying.length === 0)

/** "Wash now, hang to dry": this queued piece of `session` may go on a rack once, by the same rule as "Hang them". */
export async function queuedPieceMayHangOnce(ctx: ReadCtx, piece: Doc<'dryingPieces'>, session: Doc<'sessions'>): Promise<boolean> {
  return mayHangOnce(await pieceFacts(ctx, piece, session))
}

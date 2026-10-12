import { v, type Infer } from 'convex/values'
import { dryerHeats, dryingMethods, sha256 } from '@washcloset/planner'
import type { Doc } from './_generated/dataModel'
import { careInstructionKey } from './careInstructions'

export const routineSettings = v.object({
  wash: v.optional(v.object({ method: v.union(v.literal('machine'), v.literal('hand_wash')), cycle: v.union(v.literal('normal'), v.literal('permanent_press'), v.literal('delicate')), maximumTemperatureC: v.number() })),
  dry: v.optional(v.object({ method: v.union(...dryingMethods.map((method) => v.literal(method))), heat: v.optional(v.union(...dryerHeats.map((heat) => v.literal(heat)))) })),
})
export const personalRoutine = v.object({
  revision: v.number(), scope: v.union(v.literal('once'), v.literal('remembered')),
  settings: routineSettings, setAt: v.number(), setBy: v.string(),
  acceptedDamage: v.literal(true), missingLabelAccepted: v.boolean(),
  labelHash: v.string(), reviewedLabel: v.string(), departures: v.array(v.string()),
})
export type PersonalRoutine = Infer<typeof personalRoutine>

/** Exact reviewed garment facts; no routine or catalog summary changes manufacturer evidence. */
export function routineLabelFacts(care: Doc<'care'> | null): string {
  return JSON.stringify(care === null ? null : [care.material ?? null, care.washMethod ?? null,
    care.cycle ?? null, care.maxTemperatureC ?? null, care.restrictions, careInstructionKey(care.instructions ?? null),
    care.dryMethod ?? null, care.dryHeat ?? null, care.bleach ?? null, care.ironSteam ?? null,
    care.ironHeat ?? null, care.steamPermission ?? null, care.status,
    care.provenance.source, care.provenance.confidence])
}
export const routineLabelHash = (care: Doc<'care'> | null): string => sha256(routineLabelFacts(care))
export const routineCurrent = (routine: PersonalRoutine | undefined, care: Doc<'care'> | null): boolean => routine !== undefined && routine.labelHash === routineLabelHash(care)
export const routineWashMethod = (textile: Doc<'textiles'>, care: Doc<'care'> | null) => routineCurrent(textile.personalRoutine, care) ? textile.personalRoutine?.settings.wash?.method ?? care?.washMethod : care?.washMethod

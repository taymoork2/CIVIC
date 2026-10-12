import { v, type Infer } from 'convex/values'
import { sha256, mechanicalSeverities } from '@washcloset/planner'

const mechanicalSeverity = v.union(...mechanicalSeverities.map((value) => v.literal(value)))

export const careProcessRequirement = v.union(
  v.object({ kind: v.literal('wash_alone_first_wash') }),
  v.object({ kind: v.literal('maximum_mechanical_severity'), value: mechanicalSeverity }),
  ...(['maximum_wash_minutes', 'maximum_fill_fraction', 'extra_rinses', 'maximum_rinse_temperature', 'maximum_spin_rpm', 'maximum_spin_minutes'] as const).map((kind) => v.object({ kind: v.literal(kind), value: v.number() })),
  ...(['wash_alone', 'wash_with_like_colors', 'no_spin', 'no_softener', 'no_dryer_sheets', 'no_bleach', 'detergent_fragrance_free', 'detergent_dye_free', 'detergent_bleach_free', 'dry_flat', 'line_dry', 'drip_dry', 'shade', 'no_direct_heat'] as const).map((kind) => v.object({ kind: v.literal(kind) })),
)
const processBinding = v.object({ wording: v.string(), checked: v.boolean(), requirements: v.array(careProcessRequirement) })
export const washProcesses = v.record(v.string(), v.object({
  source: v.string(), programLabel: v.string(), maximumFillFraction: v.optional(v.number()),
  mechanicalSeverity: v.optional(mechanicalSeverity),
  washMinutes: v.optional(v.number()),
  extraRinses: v.optional(v.number()), rinseTemperatureC: v.optional(v.number()),
  spinRpm: v.optional(v.number()), spinMinutes: v.optional(v.number()),
}))
export const dryingProcessContext = v.object({ shade: v.optional(v.boolean()), noDirectHeat: v.optional(v.boolean()), drip: v.optional(v.boolean()) })

/** Wording is kept verbatim; a process requirement is never treated as a reminder. */
export const careInstructions = v.object({
  source: v.string(),
  symbolSystem: v.optional(v.string()),
  preparation: v.array(v.string()),
  washing: v.array(v.string()),
  beforeDrying: v.array(v.string()),
  drying: v.array(v.string()),
  afterDrying: v.array(v.string()),
  ironing: v.array(v.string()),
  professionalDry: v.optional(v.object({ permission: v.union(v.literal('allowed'), v.literal('not_allowed'), v.literal('unknown')), wording: v.string() })),
  professionalWet: v.optional(v.object({ permission: v.union(v.literal('allowed'), v.literal('not_allowed'), v.literal('unknown')), wording: v.string() })),
  maximumSoakMinutes: v.optional(v.number()),
  washingRequirements: v.optional(v.array(processBinding)),
  dryingRequirements: v.optional(v.array(processBinding)),
})
export type CareInstructions = Infer<typeof careInstructions>

/** Compare the saved facts independently of JSON object key order. */
export function careInstructionKey(value: CareInstructions | null): string {
  return JSON.stringify(value === null ? null : [value.source, value.symbolSystem ?? null,
    value.preparation, value.washing, value.beforeDrying, value.drying, value.afterDrying, value.ironing,
    value.maximumSoakMinutes ?? null,
    value.professionalDry === undefined ? null : [value.professionalDry.permission, value.professionalDry.wording],
    value.professionalWet === undefined ? null : [value.professionalWet.permission, value.professionalWet.wording],
    ...(value.washingRequirements === undefined && value.dryingRequirements === undefined ? [] : [bindingKey(value.washingRequirements), bindingKey(value.dryingRequirements)]),
  ])
}

function bindingKey(bindings: CareInstructions['washingRequirements']) {
  return bindings?.map((entry) => [entry.wording, entry.checked, entry.requirements.map((requirement) => [requirement.kind, 'value' in requirement ? requirement.value : null])]) ?? null
}

export function careInstructionRevision(value: CareInstructions): string {
  return sha256(careInstructionKey(value))
}

export function dryingInstructionToken(pieces: readonly { id: string; instructions?: CareInstructions }[]): string {
  return sha256(JSON.stringify(pieces.map((piece) => [piece.id, piece.instructions === undefined ? null : careInstructionRevision(piece.instructions)]).sort(([a], [b]) => String(a).localeCompare(String(b)))))
}

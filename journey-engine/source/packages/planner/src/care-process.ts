import type { AdditionalCareInstructions, MachineEvidence, SupplyItem } from './index.ts'
import type { FirstWashSeparationRequirement } from './conditional-separation.ts'

export const mechanicalSeverities = ['normal', 'mild', 'very_mild'] as const
export type MechanicalSeverity = typeof mechanicalSeverities[number]

/** Explicitly transcribed facts, never inferred from words or a program's name. */
export type CareProcessRequirement =
  | FirstWashSeparationRequirement
  | { readonly kind: 'maximum_wash_minutes' | 'maximum_fill_fraction' | 'extra_rinses' | 'maximum_rinse_temperature' | 'maximum_spin_rpm' | 'maximum_spin_minutes'; readonly value: number }
  | { readonly kind: 'maximum_mechanical_severity'; readonly value: MechanicalSeverity }
  | { readonly kind: 'detergent_fragrance_free' | 'detergent_dye_free' | 'detergent_bleach_free' }
  | { readonly kind: 'wash_alone' | 'wash_with_like_colors' | 'no_spin' | 'no_softener' | 'no_dryer_sheets' | 'no_bleach' | 'dry_flat' | 'line_dry' | 'drip_dry' | 'shade' | 'no_direct_heat' }
export interface CareProcessBinding {
  readonly wording: string
  readonly checked: boolean
  /** All conditions of this exact source line, checked by the person reading it. */
  readonly requirements: readonly CareProcessRequirement[]
}
export interface WashProcess {
  readonly source: string
  readonly programLabel: string
  /** Checked against this program's documented mechanical process, not its name. */
  readonly mechanicalSeverity?: MechanicalSeverity
  /** Exact documented washing-phase duration for this source/program/options, never a cycle estimate or timer. */
  readonly washMinutes?: number
  /** Checked settings for this particular machine/program configuration. */
  readonly maximumFillFraction?: number
  readonly extraRinses?: number
  readonly rinseTemperatureC?: number
  readonly spinRpm?: number
  readonly spinMinutes?: number
}

export const washRequirementKinds = ['wash_alone_first_wash', 'wash_alone', 'wash_with_like_colors', 'maximum_mechanical_severity', 'maximum_wash_minutes', 'maximum_fill_fraction', 'extra_rinses', 'maximum_rinse_temperature', 'maximum_spin_rpm', 'maximum_spin_minutes', 'no_spin', 'no_softener', 'no_dryer_sheets', 'no_bleach', 'detergent_fragrance_free', 'detergent_dye_free', 'detergent_bleach_free'] as const
export const dryRequirementKinds = ['dry_flat', 'line_dry', 'drip_dry', 'shade', 'no_direct_heat', 'no_softener', 'no_dryer_sheets'] as const

export function careRequirementProblem(requirement: CareProcessRequirement): string | null {
  if (requirement.kind === 'maximum_mechanical_severity') return (mechanicalSeverities as readonly string[]).includes(requirement.value) ? null : 'Record the exact mechanical severity from the label.'
  if (!('value' in requirement)) return null
  if (requirement.kind === 'maximum_wash_minutes') return Number.isFinite(requirement.value) && requirement.value > 0 && requirement.value <= 300 ? null : 'Record the exact washing-phase limit above 0 and at most 300 minutes.'
  const maximum = { maximum_fill_fraction: 1, extra_rinses: 10, maximum_rinse_temperature: 95, maximum_spin_rpm: 3000, maximum_spin_minutes: 120 }[requirement.kind]
  if (!Number.isFinite(requirement.value) || requirement.value < 0 || requirement.value > maximum || requirement.kind === 'maximum_fill_fraction' && requirement.value === 0 || requirement.kind === 'extra_rinses' && (!Number.isInteger(requirement.value) || requirement.value === 0)) return 'Record the exact numeric limit from the label within the supported range.'
  return null
}

/** Missing, stale, duplicate or incomplete interpretations retain the original block. */
export function careProcessRequirements(instructions: AdditionalCareInstructions | undefined, stage: 'washing' | 'drying'): { requirements: CareProcessRequirement[]; unresolved: string[] } {
  const lines = instructions?.[stage] ?? []
  const bindings = instructions?.[stage === 'washing' ? 'washingRequirements' : 'dryingRequirements'] ?? []
  const allowed: readonly string[] = stage === 'washing' ? washRequirementKinds : dryRequirementKinds
  const requirements: CareProcessRequirement[] = []
  const unresolved: string[] = []
  for (const wording of lines) {
    const matching = bindings.filter((binding) => binding.wording === wording)
    const binding = matching.length === 1 ? matching[0] : undefined
    if (!instructions?.source.trim() || binding === undefined || binding.checked !== true || binding.requirements.length === 0 || binding.requirements.some((entry) => !allowed.includes(entry.kind) || careRequirementProblem(entry) !== null) || binding.requirements.filter((entry) => entry.kind === 'maximum_wash_minutes').length > 1) unresolved.push(wording)
    else requirements.push(...binding.requirements)
  }
  // Unexpected bindings cannot add permission or silently disappear.
  for (const binding of bindings) if (!lines.includes(binding.wording)) unresolved.push(binding.wording)
  return { requirements, unresolved }
}

export function washProcessProblem(process: WashProcess): string | null {
  if (!process.source.trim() || !process.programLabel.trim()) return 'Record the checked program name and where its settings were read.'
  if (process.washMinutes !== undefined && (!Number.isFinite(process.washMinutes) || process.washMinutes <= 0 || process.washMinutes > 300)) return 'Record the exact documented washing-phase duration above 0 and at most 300 minutes, or leave it unknown.'
  if (process.mechanicalSeverity !== undefined && !(mechanicalSeverities as readonly string[]).includes(process.mechanicalSeverity)) return 'Record only a checked normal, mild or very mild mechanical process.'
  for (const [key, maximum] of [['maximumFillFraction', 1], ['extraRinses', 10], ['rinseTemperatureC', 95], ['spinRpm', 3000], ['spinMinutes', 120]] as const) {
    const value = process[key]
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > maximum || key === 'maximumFillFraction' && value === 0 || key === 'extraRinses' && !Number.isInteger(value))) return 'Record checked program settings within the supported ranges.'
  }
  return null
}

export function checkedWashProcess(machine: MachineEvidence, cycle: string): WashProcess | undefined {
  const process = machine.washProcesses?.[cycle]
  return process === undefined || washProcessProblem(process) !== null ? undefined : process
}

/** Capacity intersects every piece, the checked program and the recorded washer. */
export function careProcessCapacity(machine: MachineEvidence, cycle: string, instructions: readonly (AdditionalCareInstructions | undefined)[], ordinaryCapacity: number): number {
  const process = checkedWashProcess(machine, cycle)
  const checkedCapacity = ['observed', 'verified'].includes(machine.capacityConfidence ?? '') && Number.isFinite(machine.capacityUnits) && machine.capacityUnits! > 0
  if (process?.maximumFillFraction !== undefined && !checkedCapacity) return 0
  let capacity = Math.min(ordinaryCapacity, process?.maximumFillFraction === undefined ? ordinaryCapacity : machine.capacityUnits! * process.maximumFillFraction)
  for (const words of instructions) for (const requirement of careProcessRequirements(words, 'washing').requirements) {
    if (requirement.kind !== 'maximum_fill_fraction') continue
    if (!checkedCapacity || process === undefined) return 0
    capacity = Math.min(capacity, machine.capacityUnits! * requirement.value)
  }
  return capacity
}

export function washProcessUnmatched(instructions: AdditionalCareInstructions | undefined, machine: MachineEvidence, cycle: string): string[] {
  const washing = careProcessRequirements(instructions, 'washing')
  const drying = careProcessRequirements(instructions, 'drying')
  const process = checkedWashProcess(machine, cycle)
  const unmatched = [...washing.unresolved]
  for (const requirement of [...washing.requirements, ...drying.requirements.filter((entry) => entry.kind === 'drip_dry')]) {
    const maximum = (actual: number | undefined, value: number) => actual !== undefined && actual <= value
    const matches = requirement.kind === 'maximum_mechanical_severity' ? process?.mechanicalSeverity !== undefined && mechanicalSeverities.indexOf(process.mechanicalSeverity) >= mechanicalSeverities.indexOf(requirement.value)
      : requirement.kind === 'maximum_fill_fraction' ? process !== undefined && careProcessCapacity(machine, cycle, [instructions], machine.capacityUnits ?? 0) > 0
      : requirement.kind === 'extra_rinses' ? process?.extraRinses !== undefined && process.extraRinses >= requirement.value
      : requirement.kind === 'maximum_rinse_temperature' ? maximum(process?.rinseTemperatureC, requirement.value)
      : requirement.kind === 'maximum_wash_minutes' ? maximum(process?.washMinutes, requirement.value)
      : requirement.kind === 'maximum_spin_rpm' ? maximum(process?.spinRpm, requirement.value)
      : requirement.kind === 'maximum_spin_minutes' ? maximum(process?.spinMinutes, requirement.value)
      : requirement.kind === 'no_spin' || requirement.kind === 'drip_dry' ? process?.spinRpm === 0
      : true // Product prohibitions are checked against the actual selected products.
    if (!matches) unmatched.push(requirement.kind)
  }
  return [...new Set(unmatched)]
}

/** Pack kind/chemistry, never product names. A label prohibition has no personal override. */
export function careProductAllowed(instructions: AdditionalCareInstructions | undefined, supply: SupplyItem): boolean {
  const requirements = [...careProcessRequirements(instructions, 'washing').requirements, ...careProcessRequirements(instructions, 'drying').requirements]
  const chemistry = [supply.stainChemistry, supply.chemistry, ...(supply.applicationRules ?? []).map((rule) => rule.stainChemistry)]
  // A contradictory recorded absence cannot cancel positive bleach evidence.
  const recordedBleach = chemistry.some((kind) => kind === 'oxygen_bleach' || kind === 'chlorine_bleach') || supply.bleachKind !== undefined && supply.bleachKind !== 'none'
  const bleach = recordedBleach || supply.bleachKind === undefined && ['bleach', 'chemical_consumable', 'single_use_consumable', 'scent_booster'].includes(supply.kind ?? '')
  const detergent = supply.kind === 'detergent' || supply.use === 'detergent' || supply.use === 'pods'
  return !requirements.some((requirement) => requirement.kind === 'no_softener' && (supply.use === 'softener' || supply.kind === 'softener' || supply.kind === 'dryer_sheet')
    || requirement.kind === 'no_dryer_sheets' && supply.kind === 'dryer_sheet'
    || requirement.kind === 'no_bleach' && bleach
    || detergent && (requirement.kind === 'detergent_fragrance_free' && supply.fragrance !== 'free'
      || requirement.kind === 'detergent_dye_free' && supply.dye !== 'free'
      || requirement.kind === 'detergent_bleach_free' && (supply.bleachKind !== 'none' || recordedBleach)))
}

/** Positive detergent instructions also require use, not merely compatible contents when present. */
export function careRequiresDetergent(instructions: AdditionalCareInstructions | undefined): boolean {
  return careProcessRequirements(instructions, 'washing').requirements.some((requirement) => ['detergent_fragrance_free', 'detergent_dye_free', 'detergent_bleach_free'].includes(requirement.kind))
}

export interface DryingProcessContext { readonly shade?: boolean; readonly noDirectHeat?: boolean; readonly drip?: boolean }
export function maximumCareFillFraction(instructions: readonly (AdditionalCareInstructions | undefined)[], process?: WashProcess): number {
  return Math.min(process?.maximumFillFraction ?? 1, ...instructions.flatMap((words) => careProcessRequirements(words, 'washing').requirements.flatMap((entry) => entry.kind === 'maximum_fill_fraction' ? [entry.value] : [])))
}
export function dryingProcessUnmatched(instructions: AdditionalCareInstructions | undefined, method: string, context: DryingProcessContext = {}): string[] {
  const { requirements, unresolved } = careProcessRequirements(instructions, 'drying')
  const unmatched = [...unresolved]
  for (const requirement of requirements) {
    const matches = requirement.kind === 'dry_flat' ? method === 'flat'
      : requirement.kind === 'line_dry' ? method === 'rack_line'
      : requirement.kind === 'drip_dry' ? (method === 'flat' || method === 'rack_line') && context.drip === true
      : requirement.kind === 'shade' ? (method === 'flat' || method === 'rack_line') && context.shade === true
      : requirement.kind === 'no_direct_heat' ? (method === 'flat' || method === 'rack_line') && context.noDirectHeat === true
      : true
    if (!matches) unmatched.push(requirement.kind)
  }
  return [...new Set(unmatched)]
}

export function washProcessWording(process: WashProcess): string {
  return `Use the checked program ${process.programLabel}${[
    process.mechanicalSeverity === undefined ? null : `${process.mechanicalSeverity.replace('_', ' ')} mechanical process`,
    process.washMinutes === undefined ? null : `documented washing phase ${process.washMinutes} min`,
    process.maximumFillFraction === undefined ? null : `maximum drum fill ${process.maximumFillFraction * 100}%`,
    process.extraRinses === undefined ? null : `${process.extraRinses} extra rinses`,
    process.rinseTemperatureC === undefined ? null : `rinse ${process.rinseTemperatureC} °C`,
    process.spinRpm === undefined ? null : process.spinRpm === 0 ? 'no spin' : `spin ${process.spinRpm} rpm`,
    process.spinMinutes === undefined ? null : `spin ${process.spinMinutes} min`,
  ].filter(Boolean).map((part) => `; ${part}`).join('')}. Source: ${process.source}${process.washMinutes === undefined ? '' : '. Recorded program compliance; physical washing-phase time is not measured.'}`
}

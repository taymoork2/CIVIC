import type { AdditionalCareInstructions, CareEvidence, TextileEvidence } from './index.ts'
import { careRequirementProblem, washRequirementKinds, type CareProcessBinding, type CareProcessRequirement } from './care-process.ts'

/** A checked interpretation of the entire source line, not permission inferred from prose. */
export interface FirstWashSeparationRequirement { readonly kind: 'wash_alone_first_wash' }
export type FirstWashFacts = Pick<TextileEvidence, 'firstWash' | 'firstWashState'>
type SeparationBinding = Omit<CareProcessBinding, 'requirements'> & { readonly requirements: readonly (CareProcessRequirement | FirstWashSeparationRequirement)[] }
export type FirstWashCareEvidence = Pick<CareEvidence, 'restrictions'> & {
  readonly instructions?: Omit<AdditionalCareInstructions, 'washingRequirements'> & { readonly washingRequirements?: readonly SeparationBinding[] }
}

/** Missing or contradictory records never establish that the first wash has happened. */
export function recordedFirstWash(textile: FirstWashFacts): boolean | undefined {
  if (textile.firstWash !== undefined && typeof textile.firstWash !== 'boolean') return undefined
  const state = textile.firstWashState === 'unwashed' ? true : textile.firstWashState === 'washed' ? false : undefined
  if (textile.firstWash !== undefined && textile.firstWashState !== undefined && (state === undefined || textile.firstWash !== state)) return undefined
  return textile.firstWash ?? state
}

export function restrictionWording(care: FirstWashCareEvidence | null | undefined): string[] {
  return (care?.restrictions ?? []).flatMap((entry) => typeof entry === 'string' ? [entry] : [entry.area ?? '', entry.instruction ?? ''].filter(Boolean))
}

/** Detect possible qualification only to keep it unresolved, never to interpret its meaning. */
export function qualifiedSeparation(wording: string): boolean {
  return /\bwash\s+(?:alone|separately)\b/i.test(wording) && /\b(?:first\s+wash|initial\s+wash|if|unless|when|until)\b/i.test(wording)
}

export function firstWashSeparation(care: FirstWashCareEvidence | null | undefined, textile: FirstWashFacts = {}): { washAlone: boolean; unresolved: string[]; matchedWording: string[] } {
  const instructions = care?.instructions
  const bindings = instructions?.washingRequirements ?? []
  const first = recordedFirstWash(textile)
  const unresolved = new Set<string>()
  const matchedWording: string[] = []
  let washAlone = false
  for (const binding of bindings) {
    if (!binding.requirements.some((entry) => entry.kind === 'wash_alone_first_wash')) continue
    const valid = instructions?.source.trim() && instructions.washing.filter((line) => line === binding.wording).length === 1 && binding.checked === true
      && bindings.filter((entry) => entry.wording === binding.wording).length === 1
      && binding.requirements.every((entry) => entry.kind === 'wash_alone_first_wash' || (washRequirementKinds as readonly string[]).includes(entry.kind) && careRequirementProblem(entry) === null)
    if (!valid || first === undefined) unresolved.add(binding.wording)
    else {
      matchedWording.push(binding.wording)
      washAlone ||= first
    }
  }
  for (const wording of restrictionWording(care)) if (qualifiedSeparation(wording) && !matchedWording.includes(wording)) unresolved.add(wording)
  return { washAlone, unresolved: [...unresolved], matchedWording }
}

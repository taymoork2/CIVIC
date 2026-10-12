import type { CareEvidence, CareWashMethod } from './index.ts'
import { evidencePolicy, evidenceStatus } from './evidence.ts'
import { careProcessRequirements } from './care-process.ts'
import { firstWashSeparation, qualifiedSeparation, restrictionWording, type FirstWashCareEvidence, type FirstWashFacts } from './conditional-separation.ts'

export function careMethod(care: CareEvidence | null | undefined): CareWashMethod | undefined {
  return care?.washMethod ?? care?.method
}

export function careRestrictionText(care: CareEvidence | null | undefined): string {
  return (care?.restrictions ?? [])
    .map((restriction) => typeof restriction === 'string' ? restriction : `${restriction.area ?? ''} ${restriction.instruction ?? ''}`)
    .join(' ')
    .toLowerCase()
}

/** Explicit recorded label instructions, independent of household mixing preferences. */
export function careSeparation(care: FirstWashCareEvidence | null | undefined, textile: FirstWashFacts = {}): 'wash_alone' | 'like_colors' | null {
  const conditional = firstWashSeparation(care, textile)
  const checked = careProcessRequirements(care?.instructions, 'washing').requirements
  // Only an exact checked conditional line can expire. Independent wash-alone rules stay mandatory.
  const text = restrictionWording(care).filter((wording) => !qualifiedSeparation(wording) || !conditional.matchedWording.includes(wording)).join(' ').toLowerCase()
  if (checked.some((entry) => entry.kind === 'wash_alone') || /\bwash\s+(?:alone|separately)\b/.test(text)) return 'wash_alone'
  if (conditional.washAlone) return 'wash_alone'
  return checked.some((entry) => entry.kind === 'wash_with_like_colors') || /\b(?:wash\s+(?:with\s+)?|with\s+)(?:like|similar)\s+colou?rs\b/.test(text) ? 'like_colors' : null
}

export function careForbidsSoaking(care: CareEvidence | null | undefined): boolean {
  return /\b(?:do not|must not|never|don't|don’t)\s+soak\b|\bno\s+soak(?:ing)?\b/.test(careRestrictionText(care))
}

export function careProhibited(care: CareEvidence | null | undefined): boolean {
  const method = careMethod(care)
  if (method === 'hand' || method === 'hand_wash' || method === 'dry_clean_only' || method === 'do_not_wash') return true
  const text = careRestrictionText(care)
  return /do not wash|dry clean only|hand wash only|hand-wash only|not machine washable/.test(text)
}

export function careUnknown(care: CareEvidence | null | undefined): boolean {
  if (careCheckedUnknown(care)) return false
  if (!care || care.status === 'needs_confirmation' || care.unknown === true || care.unsupportedTreatment === true) return true
  if (care && care.unknown !== undefined && care.unknown !== false) return true
  const method = careMethod(care)
  return method === undefined || method === 'unknown' || method === 'machine' && !(care.requiredCycle ?? care.cycle)
}

/**
 * The tag (or another owner check) was actually read and came back with nothing usable, as opposed
 * to care nobody has checked yet (`care` absent, or evidence no better than a guess). The owner's
 * rule: this always fails closed rather than waiting on a question that would only get the same
 * answer again — cold, the gentlest cycle the washer supports, no bleach, hung to dry.
 */
export function careCheckedUnknown(care: CareEvidence | null | undefined): boolean {
  if (!care || careProhibited(care)) return false
  return careMethod(care) === 'unknown' && evidencePolicy.careConfirmed(evidenceStatus(care.evidence))
}

/** Care that was read from the label or checked on the garment, so its drying symbol may be acted on. */
export function careConfirmed(care: CareEvidence | null | undefined): boolean {
  if (!care || careUnknown(care) || careCheckedUnknown(care)) return false
  return care.status === 'confirmed' || evidencePolicy.careConfirmed(evidenceStatus(care.evidence))
}

import type { ApplicationRule, EvidenceRecord, SupplyItem } from './index.ts'
import { evidenceLevel, type EvidenceLevel } from './vocabulary.ts'

/**
 * The one evidence policy. The planner applies it when deciding what it may do without asking,
 * and Convex applies it when it stores care so the wardrobe shows the same answer.
 *
 * - Care is confirmed only from a readable label or a direct inspection of the garment.
 * - Product labels and dose rules must have been read: the dose is an instruction to a person.
 *   A person's taps on the label they are holding count as read (`observed`); memory,
 *   estimates and sample data do not.
 * - Machines plan with any recorded evidence, including estimates; only unknown fails closed.
 */
const readOrChecked = (level: unknown): boolean => {
  const known = evidenceLevel(level)
  return known === 'verified' || known === 'observed'
}

export const evidencePolicy = {
  careConfirmed: readOrChecked,
  supplyUsable: readOrChecked,
  ruleUsable: readOrChecked,
  machineUsable: (level: unknown): boolean => evidenceLevel(level) !== 'unknown',
} as const

export type { EvidenceLevel }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The level an evidence record carries, in any of the spellings older evidence uses; undefined when absent. */
export function evidenceStatus(evidence: EvidenceRecord | null | undefined): EvidenceLevel | undefined {
  if (!evidence) return undefined
  if (evidence.status) return evidence.status
  if (typeof evidence.confidence === 'string') return evidence.confidence
  if (isRecord(evidence.confidence) && typeof evidence.confidence.level === 'string') return evidence.confidence.level as EvidenceLevel
  return undefined
}

export function ruleEvidenceUsable(rule: ApplicationRule): boolean {
  return evidencePolicy.ruleUsable(evidenceStatus(rule.evidence))
}

export function supplyLabelEvidence(supply: SupplyItem): EvidenceRecord | null | undefined {
  return supply.labelEvidence ?? supply.label ?? supply.evidence
}

/** A product label that has been read; enough on its own for reusable equipment and dryer products. */
export function supplyLabelUsable(supply: SupplyItem): boolean {
  return evidencePolicy.supplyUsable(evidenceStatus(supplyLabelEvidence(supply)))
}

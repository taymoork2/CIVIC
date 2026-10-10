import type { StoredPlan, PlanQuestion } from '@/laundry/laundry-pass'
import { exclusionWords } from '@/laundry/plain-reasons'
import { sourceIssueText } from '@/copy'

export type BlockedItem = StoredPlan['loadStates'][number]['blockedItems'][number]
type Reason = StoredPlan['result']['reasons'][number]

/** What tapping an issue's action does. None of them overrides a care or product restriction. */
export type IssueAction =
  | { readonly kind: 'question'; readonly question: PlanQuestion }
  | { readonly kind: 'leave-out-garment'; readonly textileId: string }
  | { readonly kind: 'leave-out-garments'; readonly textileIds: readonly string[] }
  | { readonly kind: 'leave-out-product'; readonly supplyId: string }
  | { readonly kind: 'choose-pretreatment'; readonly textileId: string; readonly supplyId: string }
  | { readonly kind: 'inspect-stain'; readonly textileId: string }
  | { readonly kind: 'add-product' }
  /** Opens that product's sheet at the pack lookup; nothing is matched until the owner picks and confirms a pack. */
  | { readonly kind: 'find-pack'; readonly supplyId: string }

export type SourceIssue = {
  readonly reasonId: string
  readonly kind: 'confirm' | 'conflict'
  readonly blocking: boolean
  /** A piece that waits in the hamper for a different product: its line and options show as a list, not an alert. */
  readonly held?: true
  readonly title: string
  readonly detail?: string
  readonly actions: readonly { readonly label: string; readonly action: IssueAction }[]
}

/** One garment, product or washer row with the problems it caused, in the order the plan reported them. */
export type SourceGroup = {
  readonly source: BlockedItem['source']
  readonly name: string
  /** The garment's own picture, when the plan names its kind. */
  readonly icon?: { readonly kind: string | null; readonly colorGroup: string | null }
  readonly issues: readonly SourceIssue[]
}

export type SourceNames = {
  readonly garment: (textileId: string) => string | null
  readonly product: (supplyId: string) => string | null
  readonly washer: (machineId: string) => string | null
  readonly icon?: (textileId: string) => { readonly kind: string | null; readonly colorGroup: string | null } | null
  /** Whether the garment's care allows washing it by hand. */
  readonly handWashOk?: (textileId: string) => boolean
}

const listNames = (names: readonly string[]) => names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`

/** The question card that asks about this exact source, if the plan raised one. */
export function questionFor(item: BlockedItem, questions: readonly PlanQuestion[], loadId: string | null): PlanQuestion | undefined {
  return questions.find((question) => question.key.subjectId === item.source.id)
    ?? questions.find((question) => question.subjectIds.some((id) => (item.textileIds ?? []).includes(id)))
    ?? (loadId === null ? undefined : questions.find((question) => question.key.kind === 'soil_level' && question.key.subjectId === loadId && question.subjectIds.includes(item.source.id)))
}

function issueFor(item: BlockedItem, reason: Reason | undefined, questions: readonly PlanQuestion[], loadId: string | null, names: SourceNames): SourceIssue {
  const garments = (item.textileIds ?? []).map((id) => names.garment(id) ?? sourceIssueText.aGarment)
  const productId = item.source.kind === 'product' ? item.source.id : item.supplyIds?.[0]
  const product = productId === undefined ? null : names.product(productId)
  const cause = typeof reason?.details.cause === 'string' ? reason.details.cause : null
  // Known incompatibilities between a product and a garment name both, so the row reads on its own.
  const pair = item.source.kind === 'product' && garments.length > 0 && (reason?.code === 'product_restriction' || cause === 'tag_forbids_bleach')
  const title = pair
    ? sourceIssueText.cantUseWith(product ?? sourceIssueText.aProduct, listNames(garments))
    : reason === undefined ? sourceIssueText.closerLook : exclusionWords(reason, { product }).text
  if (item.source.kind === 'garment' && (cause === 'protein_fiber_enzyme' || cause === 'protein_fiber_enzyme_unknown') && reason !== undefined) {
    const held: { label: string; action: IssueAction }[] = [{ label: sourceIssueText.held.addSafe, action: { kind: 'add-product' } }]
    const detailIds = reason.details.supplyIds
    const unknownProductId = cause === 'protein_fiber_enzyme_unknown' ? (productId ?? (Array.isArray(detailIds) && typeof detailIds[0] === 'string' ? detailIds[0] : undefined)) : undefined
    if (unknownProductId !== undefined) held.push({ label: sourceIssueText.held.findPack, action: { kind: 'find-pack', supplyId: unknownProductId } })
    if (names.handWashOk?.(item.source.id) === true) held.push({ label: sourceIssueText.held.handWash, action: { kind: 'leave-out-garment', textileId: item.source.id } })
    return { reasonId: item.reasonId, kind: item.kind, blocking: item.blocking, held: true, title: exclusionWords(reason, { product: product ?? sourceIssueText.aProduct }).text, actions: held }
  }
  const detail = cause === 'tag_forbids_bleach' ? sourceIssueText.leftOutForBleach : pair ? sourceIssueText.restricted : undefined
  const actions: { label: string; action: IssueAction }[] = []
  if (item.blocking && item.source.kind === 'garment') {
    if (cause === 'pretreatment_choice_needed' && productId !== undefined && product !== null) {
      actions.push({ label: sourceIssueText.pretreatWith(product), action: { kind: 'choose-pretreatment', textileId: item.source.id, supplyId: productId } })
    }
    if (cause !== null && ['unknown_stain_report', 'stain_care_conflict', 'unsupported_stain_chemistry', 'pretreatment_choice_needed'].includes(cause)) {
      actions.push({ label: sourceIssueText.inspectStain, action: { kind: 'inspect-stain', textileId: item.source.id } })
    }
  }
  const question = questionFor(item, questions, loadId)
  if (question !== undefined) {
    actions.push({ label: item.source.kind === 'product' ? sourceIssueText.checkPack : item.source.kind === 'washer' ? sourceIssueText.checkWasher : sourceIssueText.checkTag, action: { kind: 'question', question } })
  }
  // Omitting changes only this wash: the garment or product record stays as it is.
  if (item.source.kind === 'product' && item.blocking) actions.push({ label: sourceIssueText.useAnother, action: { kind: 'leave-out-product', supplyId: item.source.id } })
  const textileIds = [...new Set(item.source.kind === 'garment' ? [item.source.id] : item.textileIds ?? [])]
  if (item.blocking && textileIds.length === 1) actions.push({ label: item.source.kind === 'garment' ? sourceIssueText.leaveOut : sourceIssueText.leaveOutNamed(garments[0] ?? sourceIssueText.aGarment), action: { kind: 'leave-out-garment', textileId: textileIds[0]! } })
  if (item.blocking && textileIds.length > 1) actions.push({ label: sourceIssueText.leavePiecesOut(textileIds.length), action: { kind: 'leave-out-garments', textileIds } })
  return { reasonId: item.reasonId, kind: item.kind, blocking: item.blocking, title, ...(detail === undefined ? {} : { detail }), actions }
}

/**
 * Groups a load's (or the left-out garments') problems under the garment, product or washer that
 * caused them, so each correction sits beside its source. Every item stays visible; nothing is
 * collapsed into a separate warning list.
 */
export function sourceGroups(items: readonly BlockedItem[], reasons: readonly Reason[], questions: readonly PlanQuestion[], loadId: string | null, names: SourceNames): SourceGroup[] {
  const groups: { source: BlockedItem['source']; name: string; icon?: SourceGroup['icon']; issues: SourceIssue[] }[] = []
  for (const item of items) {
    const reason = reasons.find((entry) => entry.id === item.reasonId)
    const issue = issueFor(item, reason, questions, loadId, names)
    let group = groups.find((entry) => entry.source.kind === item.source.kind && entry.source.id === item.source.id)
    if (group === undefined) {
      const name = item.source.kind === 'garment' ? names.garment(item.source.id) : item.source.kind === 'product' ? names.product(item.source.id) : names.washer(item.source.id)
      const icon = item.source.kind === 'garment' ? names.icon?.(item.source.id) : null
      group = { source: item.source, name: name ?? sourceIssueText.unnamed[item.source.kind], ...(icon == null ? {} : { icon }), issues: [] }
      groups.push(group)
    }
    if (!group.issues.some((entry) => entry.title === issue.title)) group.issues.push(issue)
  }
  return groups
}

/** The next useful check for a blocked load: the first blocking issue's first action. */
export function nextCheck(groups: readonly SourceGroup[]): { readonly label: string; readonly action: IssueAction } | null {
  for (const group of groups) for (const issue of group.issues) if (issue.blocking && issue.actions.length > 0) return issue.actions[0]!
  return null
}

/** How many blocking problems a load has left. */
export function blockingCount(groups: readonly SourceGroup[]): number {
  return groups.reduce((total, group) => total + group.issues.filter((issue) => issue.blocking).length, 0)
}

import { useId, type ReactNode } from 'react'
import { washGoals, type BenefitDecision, type LoadPlan, type WashGoal } from '@washcloset/planner'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Field, FieldLabel } from '@/components/ui/field'
import type { Supply } from '@/household/inventory-types'

const goals: Record<WashGoal, string> = { ordinary: 'Ordinary wash', dull_grey: 'Dull or gray appearance', visible_stain: 'Visible stain', suspected_color_transfer: 'Suspected color transfer', faded_dye: 'Faded dye', odor: 'Odor', feel: 'Feel or residue', fragrance: 'Scent preference' }
const statuses = { suggested: 'Possible benefit', unnecessary: 'No addition needed', preference_only: 'Preference only', unknown: 'Benefit not established', excluded: 'Excluded' } as const
const directions = { withhold: 'Suggestion withheld', reported_improvement: 'Reported improvement', prefer_simple: 'Keep it simple', disabled: 'Personal influence disabled', evidence_only: 'Evidence only' } as const
export type ProductBenefitsProps = {
  decisions: readonly BenefitDecision[]; supplies: readonly Supply[]; selected: readonly string[]; goal: WashGoal;
  disabled: boolean; onGoal: (goal: WashGoal) => void; onChoose: (supplyId: string, on: boolean) => void;
  guidanceStatus?: string;
  privateGuidance?: { load: Pick<LoadPlan, 'productRecommendations' | 'withheldProductRecommendations' | 'personalSuggestions'>; observations: ReactNode };
}
export function ProductBenefits({ decisions, supplies, selected, goal, disabled, onGoal, onChoose, privateGuidance, guidanceStatus }: ProductBenefitsProps) {
  const id = useId()
  const withheld = privateGuidance?.load.withheldProductRecommendations ?? []
  const displayed = [...(privateGuidance?.load.productRecommendations ?? decisions), ...withheld.filter((decision) => selected.includes(decision.supplyId))]
  const held = withheld.filter((decision) => !selected.includes(decision.supplyId))
  const renderDecision = (decision: BenefitDecision) => {
    const supply = supplies.find((entry) => entry.supplyId === decision.supplyId)
    if (supply === undefined) return null
    const personal = privateGuidance?.load.personalSuggestions?.choices.find((choice) => choice.supplyId === decision.supplyId)
    return <div key={decision.supplyId} className="grid min-w-0 gap-2">
      <label className="flex min-h-11 items-center gap-2"><Checkbox disabled={disabled || decision.status === 'excluded' && !selected.includes(decision.supplyId)} checked={selected.includes(decision.supplyId)} onCheckedChange={(checked) => onChoose(decision.supplyId, checked === true)} />Use {supply.name}</label>
      <p className="break-words text-sm text-muted-foreground">{statuses[decision.status]} · {decision.reason}</p>
      {personal === undefined ? null : <p className="break-words text-sm">{directions[personal.guidance.direction]} · {personal.guidance.explanation}{personal.suppressed && selected.includes(decision.supplyId) ? ' Explicitly selected for this wash; you can remove it.' : ''}</p>}
      {decision.evidence.length === 0 ? null : <details><summary className="min-h-11 cursor-pointer text-sm">Evidence for {supply.name}</summary><ul className="grid gap-2 text-sm break-words">{decision.evidence.map((source) => <li key={source}>{source}</li>)}</ul></details>}
    </div>
  }
  return <section className="grid min-w-0 gap-4" aria-label="Optional product benefit">
    <h2 className="text-[length:var(--step-1)] font-semibold">Any extra product?</h2>
    <Field><FieldLabel htmlFor={id}>Goal for this wash</FieldLabel><NativeSelect id={id} value={goal} disabled={disabled} onChange={(event) => onGoal(event.target.value as WashGoal)}>{washGoals.map((value) => <NativeSelectOption key={value} value={value}>{goals[value]}</NativeSelectOption>)}</NativeSelect></Field>
    <p className="text-sm text-muted-foreground">Added only when selected, after checking the label, dose and compatibility.</p>
    {guidanceStatus ? <p role="status" className="break-words text-sm text-muted-foreground">{guidanceStatus}</p> : null}
    {displayed.map(renderDecision)}
    {held.length === 0 ? null : <details><summary className="min-h-11 cursor-pointer py-3">Withheld optional suggestions ({held.length})</summary><div className="grid min-w-0 gap-4"><p>These are withheld from your private suggestions. An explicit choice still reviews the recorded label, dose and compatibility.</p>{held.map(renderDecision)}</div></details>}
    {selected.filter((supplyId) => !displayed.some((decision) => decision.supplyId === supplyId)).map((supplyId) => <label key={supplyId} className="flex min-h-11 items-center gap-2"><Checkbox disabled={disabled} checked onCheckedChange={(on) => { if (on !== true) onChoose(supplyId, false) }} />Use {supplies.find((entry) => entry.supplyId === supplyId)?.name ?? 'selected extra product'} · selected for this wash; remove to review without it</label>)}
    {privateGuidance === undefined ? null : <details><summary className="min-h-11 cursor-pointer py-3">Why these private suggestions?</summary>{privateGuidance.observations}</details>}
  </section>
}

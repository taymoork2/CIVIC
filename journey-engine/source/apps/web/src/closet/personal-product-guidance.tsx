import { useConvex, useQueries } from 'convex/react'
import { getFunctionName, makeFunctionReference, type FunctionArgs, type FunctionReference, type FunctionReturnType } from 'convex/server'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PersonalPlannerGuidance, PersonalPlannerInput, PersonalPlannerSummary, PersonalSuggestionGuidance } from '@washcloset/planner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { api } from '@/api'
import { matchingGroups, type MatchingIdentity } from '@/closet/garment-groups'
import type { Supply, Textile } from '@/household/inventory-types'
import { errorMessage, ErrorNotice } from '@/kit/ui'
import { ProductBenefits, type ProductBenefitsProps } from '@/products/product-benefits'
import { TrialNote } from '@/laundry/laundry-ui'
import { trialText } from '@/copy-trial'
import { countWord } from '@/copy/shared'

type ComparisonArgs = FunctionArgs<typeof api.personalSuggestions.forPlan>
type Saved = FunctionReturnType<typeof api.personalSuggestions.savedForPlan>
type ControlArgs = FunctionArgs<typeof api.personalAdaptation.controls>
type Controls = FunctionReturnType<typeof api.personalAdaptation.controls>
type Change = FunctionArgs<typeof api.personalAdaptation.change>['action']
type Props = { householdId: string; planId: string; loadId: string; inputHash: string; textileIds: readonly string[];
  textiles: readonly Textile[]; supplyIds: readonly string[]; supplies: readonly Supply[]; selected: readonly string[]; disabled: boolean;
  benefits?: Pick<ProductBenefitsProps, 'decisions' | 'goal' | 'onGoal' | 'onChoose'> }
type ObservationComparison = { candidates: readonly { supplyId: string; eligible: boolean; guidance: PersonalSuggestionGuidance; summaries: readonly PersonalPlannerSummary[] }[] }

const dimensions: Record<ComparisonArgs['dimension'], string> = { overall: 'Overall result', stain: 'Stain', appearance: 'Appearance', odor: 'Odor', feel: 'Feel or residue', damage: 'Garment damage' }
const stages: Record<ComparisonArgs['checkedWhen'], string> = { after_wash: 'After washing', after_drying: 'After drying', after_wearing: 'After wearing' }
const directions = { withhold: 'Suggestion withheld', reported_improvement: 'Reported improvement', prefer_simple: 'Keep it simple', disabled: 'Personal influence disabled', evidence_only: 'Evidence only' } as const
/** A piece's matching identity; an entry missing from inventory never merges with another. */
function influenceIdentity(textiles: readonly Textile[], textileId: string): MatchingIdentity {
  const textile = textiles.find((entry) => entry.textileId === textileId)
  return textile === undefined ? { name: textileId } : { name: textile.name, color: textile.color, colorGroup: textile.colorGroup, guest: textile.guest }
}

/** Matching pieces in this load as one entry each, in first-seen order, with their display label. */
export function influenceGroups(textileIds: readonly string[], textiles: readonly Textile[]) {
  return matchingGroups(textileIds, (textileId) => influenceIdentity(textiles, textileId)).map((group) => {
    const name = textiles.find((entry) => entry.textileId === group.first)?.name ?? 'Clothing entry'
    return { key: group.key, textileIds: group.members, label: group.members.length > 1 ? `${name} ×${group.members.length}` : name }
  })
}

const results = { unknown: 'Not sure', improved: 'Improved', unchanged: 'No change', worse: 'Worse', irritation: 'Irritation noticed', damage: 'Fabric damage noticed' } as const

/** useQueries returns errors as values so an invalidated plan cannot crash Laundry. */
function usePrivateQuery<Q extends FunctionReference<'query'>>(query: Q, args: FunctionArgs<Q> | null) {
  const name = getFunctionName(query)
  // These private endpoints take only IDs, strings and numbers. Stable requests
  // prevent useQueries from replacing its subscription during every render.
  const encoded = JSON.stringify(args)
  const requests = useMemo((): Parameters<typeof useQueries>[0] => {
    if (encoded === 'null') return {}
    return { result: { query: makeFunctionReference<'query'>(name), args: JSON.parse(encoded) as FunctionArgs<Q> } }
  }, [name, encoded])
  return useQueries(requests).result as FunctionReturnType<Q> | Error | undefined
}

export function guidanceScopeIssue(entryCount: number, productCount: number): string | null {
  if (entryCount > 16) return 'Private comparison supports at most 16 clothing entries in a load. This load is outside that scope; its wash plan is unchanged.'
  if (productCount > 4) return 'Choose at most four products to compare. Other products remain available in the wash review.'
  if (productCount === 0) return 'Choose one to four products to compare. Comparing does not select them for use.'
  return null
}

export function guidanceSaveReady(reviewed: { context: string; inputHash: string; revision: number } | null, context: string, inputHash: string | undefined, revision: number | undefined) {
  return reviewed !== null && reviewed.context === context && reviewed.inputHash === inputHash && reviewed.revision === revision
}

export function savedGuidanceLabel(saved: Saved | undefined): string {
  return saved === undefined ? 'Loading saved guidance…' : saved === null ? 'No private guidance saved.' : saved.status === 'stale' ? 'Saved guidance is stale. Review again before saving.' : 'Private guidance saved.'
}

/** Consume only the revalidated saved result for this shared load; never an unsaved draft. */
export function savedRecommendationView(saved: Saved | Error | undefined, loadId: string, inputHash: string, disabled: boolean, invalidated = false) {
  const fallback = (status: string) => ({ status, guidance: undefined })
  if (disabled) return fallback('Private suggestions paused while the wash plan updates. Showing recorded product evidence.')
  if (invalidated) return fallback('Personal controls changed or need revalidation. Review and save current guidance; showing recorded product evidence.')
  if (saved instanceof Error) return fallback('Private suggestions unavailable. Showing recorded product evidence.')
  if (saved === undefined) return fallback('Loading private suggestions. Showing recorded product evidence.')
  if (saved === null) return fallback('No private guidance saved. Showing recorded product evidence.')
  if (saved.status === 'stale') return fallback(`Saved private suggestions are stale. ${saved.reason} Showing recorded product evidence.`)
  const result = saved.result
  const input = result?.inputSnapshot?.personalSuggestions
  const load = Array.isArray(result?.loads) ? result.loads.find((entry) => entry.id === loadId) : undefined
  if (result?.inputHash !== saved.inputHash || input?.evidenceInputHash !== inputHash || input.loadId !== loadId
    || load?.personalSuggestions === undefined || !Array.isArray(load.productRecommendations)
    || !Array.isArray(input.choices) || !Array.isArray(load.personalSuggestions.choices) || input.choices.length === 0
    || input.choices.length !== load.personalSuggestions.choices.length) {
    return fallback('Saved private suggestions do not match this wash plan. Showing recorded product evidence.')
  }
  const choices = input.choices as PersonalPlannerInput['choices']
  const guidanceChoices = load.personalSuggestions.choices as PersonalPlannerGuidance['choices']
  if (choices.some((choice) => !guidanceChoices.some((entry) => entry.supplyId === choice.supplyId))) {
    return fallback('Saved private suggestions do not match this wash plan. Showing recorded product evidence.')
  }
  if (guidanceChoices.every((choice) => choice.guidance.direction === 'disabled')) {
    return fallback('Personal influence is disabled. Showing recorded product evidence.')
  }
  const comparison: ObservationComparison = { candidates: choices.map((choice) => ({ ...choice,
    guidance: guidanceChoices.find((entry) => entry.supplyId === choice.supplyId)!.guidance })) }
  return { status: 'Current saved private guidance orders optional suggestions only. No addition remains an option.', guidance: { load, comparison } }
}

/** Remount only when the shared plan/context changes, never when the viewport changes. */
export function PersonalProductGuidance(props: Props) {
  return <PersonalGuidanceDraft key={`${props.householdId}/${props.planId}/${props.loadId}/${props.inputHash}`} {...props} />
}

function PersonalGuidanceDraft(props: Props) {
  const { householdId, planId, loadId, textileIds, textiles, supplies, selected, disabled } = props
  const client = useConvex()
  const id = useId()
  const [dimension, setDimension] = useState<ComparisonArgs['dimension']>('overall')
  const [checkedWhen, setCheckedWhen] = useState<ComparisonArgs['checkedWhen']>('after_wash')
  const [choices, setChoices] = useState<string[]>([])
  const supplyIds = choices.filter((value) => props.supplyIds.includes(value)).sort()
  const issue = guidanceScopeIssue(textileIds.length, supplyIds.length)
  const args: ComparisonArgs | null = issue === null ? { planId: planId as ComparisonArgs['planId'], loadId,
    supplyIds: supplyIds as ComparisonArgs['supplyIds'], dimension, checkedWhen } : null
  const context = JSON.stringify([props.inputHash, args, disabled])
  const active = useRef(context)
  active.current = context
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const previewQuery = usePrivateQuery(api.personalSuggestions.plannerPreview, disabled ? null : args)
  const savedQuery = usePrivateQuery(api.personalSuggestions.savedForPlan, { planId: planId as ComparisonArgs['planId'], loadId })
  const preview = previewQuery instanceof Error ? undefined : previewQuery
  const saved = savedQuery instanceof Error ? undefined : savedQuery
  // The preview endpoint returns a planner result through v.any(); consume only its hash.
  const previewHash: string | undefined = typeof preview?.result?.inputHash === 'string' ? preview.result.inputHash : undefined
  const [reviewed, setReviewed] = useState<{ context: string; inputHash: string; revision: number } | null>(null)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [invalidatedSaved, setInvalidatedSaved] = useState<string | null>(null)
  const savedKey = saved?.status === 'current' ? `${saved.guidanceId}/${saved.revision}/${saved.inputHash}` : null
  const recommendations = savedRecommendationView(savedQuery, loadId, props.inputHash, disabled, savedKey !== null && savedKey === invalidatedSaved)
  const revision = savedQuery === undefined || savedQuery instanceof Error ? undefined : savedQuery?.revision ?? 0
  const ready = guidanceSaveReady(reviewed, context, previewHash, revision)
  const savedMatches = saved?.status === 'current' && previewHash !== undefined && saved.inputHash === previewHash
  const save = async () => {
    if (!ready || args === null || reviewed === null || disabled || inFlight.current) return
    const payload = { ...args, previewInputHash: reviewed.inputHash, expectedRevision: reviewed.revision }
    const requestContext = context
    inFlight.current = true; setPending(true); setError(null); setNotice(null)
    try {
      await client.mutation(api.personalSuggestions.savePreview, payload)
      if (mounted.current && active.current === requestContext) { setInvalidatedSaved(null); setNotice('Private guidance saved. Your wash choices and recipe are unchanged.') }
    } catch (caught) {
      if (mounted.current && active.current === requestContext) { setError(errorMessage(caught)); setReviewed(null) }
    } finally {
      inFlight.current = false
      if (mounted.current) setPending(false)
    }
  }
  const queryError = previewQuery instanceof Error ? previewQuery : savedQuery instanceof Error ? savedQuery : null
  const invalidateInfluence = () => { if (savedKey !== null) setInvalidatedSaved(savedKey) }
  return <>{props.benefits === undefined ? null : <ProductBenefits {...props.benefits} supplies={supplies} selected={selected} disabled={disabled} guidanceStatus={recommendations.status}
    privateGuidance={recommendations.guidance === undefined ? undefined : { load: recommendations.guidance.load, observations: <GuidanceObservations comparison={recommendations.guidance.comparison} textiles={textiles} supplies={supplies} selected={selected} /> }} />}
    <details className="min-w-0"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Your private product guidance</summary>
    <section aria-label="Private product guidance" className="grid min-w-0 gap-4 pt-3">
      <TrialNote>{trialText.personal}</TrialNote>
      <p role="status">{savedQuery instanceof Error ? 'Saved guidance is unavailable.' : savedGuidanceLabel(saved)}{saved?.status === 'stale' ? ` ${saved.reason}` : ''}</p>
      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
      <Field><FieldLabel htmlFor={`${id}-dimension`}>What result should this comparison use?</FieldLabel><NativeSelect id={`${id}-dimension`} value={dimension} disabled={disabled || pending} onChange={(event) => { setDimension(event.target.value as ComparisonArgs['dimension']); setNotice(null); setError(null) }}>{Object.entries(dimensions).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field>
      <Field><FieldLabel htmlFor={`${id}-stage`}>When was the result checked?</FieldLabel><NativeSelect id={`${id}-stage`} value={checkedWhen} disabled={disabled || pending} onChange={(event) => { setCheckedWhen(event.target.value as ComparisonArgs['checkedWhen']); setNotice(null); setError(null) }}>{Object.entries(stages).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field>
      </div>
      <fieldset className="grid min-w-0 gap-2"><legend>Products to compare privately</legend>
        <p className="text-sm text-muted-foreground">Compare up to four; this does not add them to the wash.</p>
        {props.supplyIds.map((supplyId) => <label key={supplyId} className="flex min-h-11 items-center gap-2"><Checkbox disabled={disabled || pending || (!supplyIds.includes(supplyId) && supplyIds.length >= 4)} checked={supplyIds.includes(supplyId)} onCheckedChange={(on) => { setChoices((current) => on === true ? [...current, supplyId] : current.filter((value) => value !== supplyId)); setNotice(null); setError(null) }} />Compare {supplies.find((supply) => supply.supplyId === supplyId)?.name ?? 'Optional product'}</label>)}
      </fieldset>
      {issue ? <p role="status">{issue}</p> : disabled ? <p role="status">Wait for the wash plan to finish updating, then review this comparison.</p> : preview === undefined && queryError === null ? <p role="status">Loading private comparison…</p> : null}
      {preview === undefined || disabled ? null : <><p role="status">{savedMatches ? 'Current comparison saved privately.' : ready ? 'Current comparison reviewed.' : 'Current private comparison has not been reviewed.'}</p>{saved?.status === 'current' && !savedMatches ? <p>The saved guidance belongs to a different comparison. Review this comparison before replacing it.</p> : null}<GuidanceObservations comparison={preview.comparison} textiles={textiles} supplies={supplies} selected={selected} /></>}
      <ErrorNotice error={queryError === null ? error : `${errorMessage(queryError)} Review the current wash plan or choose another comparison.`} />
      {args === null || disabled ? null : <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={pending || previewHash === undefined || revision === undefined || queryError !== null} onClick={() => { if (previewHash !== undefined && revision !== undefined) { setReviewed({ context, inputHash: previewHash, revision }); setError(null); setNotice(null) } }}>Review current guidance</Button>
        <Button type="button" variant="outline" disabled={pending || !ready || queryError !== null} onClick={() => void save()}>{pending ? 'Saving…' : 'Save private guidance'}</Button>
      </div>}
      {reviewed === null || ready || savedMatches ? null : <p role="status">Comparison or saved guidance changed. Review the latest comparison before saving.</p>}
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  </details>
  <details><summary className="min-h-11 cursor-pointer py-3 font-semibold">Personal influence controls</summary><div className="grid min-w-0 gap-3">
    <p className="text-sm text-muted-foreground">Only affects your guidance here. Disable stops its influence; Reset excludes earlier washes. Your wash and assessment history stays.</p>
    <PersonalInfluenceControl householdId={householdId as ControlArgs['householdId']} label="All my clothing in this household" disabled={disabled || pending} onChanging={invalidateInfluence} />
    {influenceGroups(textileIds, textiles).map((group) => <PersonalInfluenceControl key={group.key} householdId={householdId as ControlArgs['householdId']} textileIds={group.textileIds as ControlArgs['textileIds']} label={group.label} disabled={disabled || pending} onChanging={invalidateInfluence} />)}
  </div></details></>
}

function PersonalInfluenceControl({ label, disabled, onChanging, ...args }: ControlArgs & { label: string; disabled: boolean; onChanging: () => void }) {
  const client = useConvex()
  const query = usePrivateQuery(api.personalAdaptation.controls, args)
  const controls = query instanceof Error ? undefined : query
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  // The revisions seen when the reset was asked for; a change since then is refused as stale.
  const [resetFrom, setResetFrom] = useState<Controls | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const change = async (action: Change) => {
    if (controls === undefined || disabled || inFlight.current) return
    onChanging()
    inFlight.current = true; setPending(true); setError(null); setNotice(null)
    try {
      const seen = action.kind === 'reset' ? resetFrom ?? controls : controls
      // A group sends every member's revision so the server changes all of them or none.
      await client.mutation(api.personalAdaptation.change, { ...args, action, ...(args.textileIds === undefined ? { expectedRevision: seen.scope.revision }
        : { expectedRevisions: seen.members.map(({ textileId, revision }) => ({ textileId, revision })) }) })
      setResetFrom(null)
      setNotice(action.kind === 'reset' ? 'Earlier washes excluded from guidance. Actual history is retained.' : action.enabled ? 'Personal influence enabled for this scope.' : 'Personal influence disabled for this scope. Actual history is retained.')
    } catch (caught) { setError(errorMessage(caught)); setResetFrom(null) }
    finally { inFlight.current = false; setPending(false) }
  }
  return <section aria-label={`Personal influence: ${label}`} className="grid min-w-0 gap-2">
    <p className="break-words font-semibold">{label}</p>
    <label className="flex min-h-11 items-center gap-2"><Checkbox aria-label={`Use my results for ${label}`} checked={controls?.scope.enabled ?? false} indeterminate={controls !== undefined && influenceMixed(controls)} disabled={disabled || pending || controls === undefined} onCheckedChange={(on) => void change({ kind: 'set_enabled', enabled: on === true })} />Use my results</label>
    {controls === undefined ? <p>{query instanceof Error ? 'Controls unavailable. Reopen the current plan to retry.' : 'Loading controls…'}</p> : <ControlStatus controls={controls} />}
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" aria-label={`Reset influence for ${label}`} disabled={disabled || pending || controls === undefined} onClick={() => { if (controls !== undefined) setResetFrom(controls) }}>Reset earlier influence</Button></div>
    {resetFrom === null ? null : <div className="grid gap-2" role="group" aria-label={`Reset influence for ${label}?`}><p>Exclude earlier washes from this scope’s guidance? Wash and assessment history stays available.</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => setResetFrom(null)}>Keep influence</Button><Button type="button" variant="outline" disabled={disabled || pending} onClick={() => void change({ kind: 'reset' })}>Confirm reset influence</Button></div></div>}
    <ErrorNotice error={query instanceof Error ? errorMessage(query) : error} />{notice ? <p role="status">{notice}</p> : null}
  </section>
}

/** Matching pieces whose own settings disagree: one control, shown as Mixed until a change sets them all. */
export function influenceMixed(controls: Controls) {
  return controls.members.some((member) => member.enabled !== controls.members[0]!.enabled)
}

export function ControlStatus({ controls }: { controls: Controls }) {
  const on = controls.members.filter((member) => member.enabled).length
  const resets = controls.members.filter((member) => member.resetAt > 0).length
  const state = influenceMixed(controls) ? `Mixed: your results are used for ${on} of ${controls.members.length} pieces. A change here applies to every piece.`
    : controls.effective.enabled ? 'Personal influence is on.' : controls.scope.enabled ? 'Personal influence is off in the household-wide control.' : 'Personal influence is off for this scope.'
  const reset = controls.effective.resetAt > 0 ? ' Earlier washes are excluded after a reset.' : resets > 0 ? ` Earlier washes are excluded for ${resets} of ${controls.members.length} pieces after a reset.` : ''
  return <p className="text-sm text-muted-foreground">{state}{reset}</p>
}

/**
 * Summaries for matching pieces under one heading. Pieces whose reports read the same show once;
 * pieces with different reports stay listed apart so one piece's history never stands for another's.
 */
function summaryGroups(summaries: readonly PersonalPlannerSummary[], textiles: readonly Textile[]) {
  const reads = (summary: PersonalPlannerSummary) => JSON.stringify([summary.status, summary.explanation, summary.counts, summary.historyTruncated, summary.negativeHistoryTruncated,
    summary.influencingObservationCount, summary.influencingObservationsTruncated, summary.observations.map((observation) => [observation.independentWashId, observation.result, observation.revision])])
  return influenceGroups(summaries.map((summary) => summary.textileId), textiles).map((group) => {
    const members = group.textileIds.map((textileId) => summaries.find((summary) => summary.textileId === textileId)!)
    return { key: group.key, label: group.label, summaries: new Set(members.map(reads)).size === 1 ? members.slice(0, 1) : members }
  })
}

export function GuidanceObservations({ comparison, textiles, supplies, selected }: { comparison: ObservationComparison; textiles: readonly Textile[]; supplies: readonly Supply[]; selected: readonly string[] }) {
  const washes = [...new Set(comparison.candidates.flatMap((candidate) => candidate.summaries.flatMap((summary) => summary.observations.map((observation) => observation.independentWashId))))].sort()
  return <div className="grid min-w-0 gap-4">{comparison.candidates.map((candidate) => <section key={candidate.supplyId} aria-label={`Private comparison: ${supplies.find((supply) => supply.supplyId === candidate.supplyId)?.name ?? 'Optional product'}`} className="grid min-w-0 gap-2">
    <p className="break-words font-semibold">{supplies.find((supply) => supply.supplyId === candidate.supplyId)?.name ?? 'Optional product'} · {directions[candidate.guidance.direction]}</p>
    <p className="break-words">{candidate.guidance.explanation}</p>
    <p className="text-sm text-muted-foreground">{selected.includes(candidate.supplyId) ? 'Selected for this wash. Remove it under Extra products.' : 'Not selected for this wash.'}{!candidate.eligible ? ' Not eligible under the current recipe.' : ''}</p>
    <details><summary className="min-h-11 cursor-pointer py-3">Influencing observations and limits</summary><div className="grid min-w-0 gap-3">
      <p className="text-sm text-muted-foreground">Each wash counts once, including matching pieces and repeated assessments.</p>
      {summaryGroups(candidate.summaries, textiles).map((group) => <div key={group.key} className="grid min-w-0 gap-2">
        <p className="break-words font-semibold">{group.label}</p>
        {group.summaries.map((summary, index) => <div key={summary.textileId} className="grid min-w-0 gap-2">
          {group.summaries.length > 1 ? <p className="font-semibold">Piece {index + 1} of {group.summaries.length}</p> : null}
          <p className="break-words">{summary.explanation}</p>
          <p>{countWord(summary.counts.independentWashes, 'independent wash', 'independent washes')} · {summary.counts.improved} improved · {summary.counts.unchanged} unchanged · {summary.counts.worse} worse · {summary.counts.mixed} mixed · {summary.counts.unknown} not sure</p>
          {summary.observations.length === 0 ? <p>No influencing observations for this comparison.</p> : <ol className="grid list-none gap-2 p-0">{summary.observations.map((observation) => <li key={`${observation.assessmentId}/${observation.revision}`} className="break-words">Independent wash {washes.indexOf(observation.independentWashId) + 1} · {observation.result === null ? 'Result cleared' : results[observation.result]} · report revision {observation.revision}</li>)}</ol>}
          {summary.influencingObservationsTruncated ? <p>Showing {summary.observations.length} of {summary.influencingObservationCount} influencing reports.</p> : null}
          {summary.historyTruncated || summary.negativeHistoryTruncated ? <p>Some older washes or negative reports weren’t checked. This comparison uses a partial history.</p> : null}
        </div>)}
      </div>)}
    </div></details>
  </section>)}</div>
}

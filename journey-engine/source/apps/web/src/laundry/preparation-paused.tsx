import { Button } from '@/components/ui/button'
import { Callout } from '@/laundry/laundry-ui'
import { doseParts, useUnits, type DoseLike } from '@/kit/units'

export type PreparationIssue = { actionId: string; product: string; washer: string; placement: string }
export type PreparationRecoveryOption = { placement: 'direct_to_drum' | 'downy_ball'; label: string; dose: DoseLike | null; timing: string | null; unavailable: string | null }
const recoveryButtonClass = 'min-w-0 max-w-full whitespace-normal py-2 text-balance [overflow-wrap:anywhere]'

export function preparationPauseReason(issue: PreparationIssue): string {
  return issue.placement === 'softener_compartment'
    ? `${issue.washer} has no softener compartment recorded`
    : `${issue.product} has no recorded place in ${issue.washer}`
}

/** Shared by the connected session and its inert indexed sample. */
export function PreparationPaused({ issue, options, pending, error, disabled = false, onRecover, onMachineProblem, onLeaveOut }: {
  issue: PreparationIssue
  options: readonly PreparationRecoveryOption[] | undefined
  pending: boolean
  error: string | null
  disabled?: boolean
  onRecover: (placement: PreparationRecoveryOption['placement']) => void
  onMachineProblem: () => void
  onLeaveOut: () => void
}) {
  const { system } = useUnits()
  return <Callout role="alert">
    <strong>{preparationPauseReason(issue)}.</strong>{' '}
    {issue.product} cannot use its planned placement. Completed steps stay recorded.
    <span className="mt-3 grid min-w-0 gap-3">
      {options === undefined ? <span role="status">Checking recorded product directions…</span> : options.map((option) => <span key={option.placement} className="grid justify-items-start gap-1.5">
        {option.unavailable === null ? <>
          {option.dose === null ? null : <span>Amount: {option.dose.unit === 'at_machine' ? 'Choose from the recorded label after loading.' : doseParts(option.dose, system).spoken}</span>}
          <span>Recorded directions: {option.timing}</span>
          <Button variant="alert" size="sm" className={recoveryButtonClass} disabled={disabled || pending} onClick={() => onRecover(option.placement)}>{option.label}</Button>
        </> : <span>{option.unavailable}</span>}
      </span>)}
    </span>
    <span className="mt-3 flex flex-wrap gap-2 [&_button:focus-visible]:[outline-color:currentColor]">
      <Button variant="alert" size="sm" className={recoveryButtonClass} aria-label={`Leave ${issue.product} out`} disabled={disabled || pending} onClick={onLeaveOut}>Leave product out</Button>
      <Button variant="alert" size="sm" className={recoveryButtonClass} disabled={disabled || pending} onClick={onMachineProblem}>Machine problem?</Button>
    </span>
    {pending ? <span role="status" className="mt-3 block">Updating this load…</span> : null}
    {error === null ? null : <span className="mt-3 block font-semibold">{error}</span>}
  </Callout>
}

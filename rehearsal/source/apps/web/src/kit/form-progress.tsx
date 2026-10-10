/** Position within a staged form, with no motion delaying the next question. */
export function FormProgress({ step, total }: { step: number; total: number }) {
  return <div role="progressbar" aria-label="Form progress" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-valuetext={`Step ${step} of ${total}`} className="flex w-full flex-wrap items-center justify-center gap-[3px]">
    {Array.from({ length: total }, (_, index) => <span key={index} aria-hidden="true" className={index < step ? 'size-[6px] rounded-full bg-primary' : 'size-[6px] rounded-full bg-surface-3'} />)}
  </div>
}

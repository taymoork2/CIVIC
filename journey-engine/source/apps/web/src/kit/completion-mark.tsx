import { cn } from '@/lib/utils'
/** Static unless a confirmed action in the current flow earned a brief acknowledgement. */
export function CompletionMark({ animate = false, className }: { animate?: boolean; className?: string }) {
  return <span aria-hidden="true" data-completion-mark="" className={cn(
    "grid size-16 shrink-0 place-items-center rounded-full bg-ready-bg text-ready-ink",
    animate && "motion-safe:animate-[completion-in_240ms_var(--ease-out)_both]",
    className,
  )}>
    <svg className="size-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
  </span>
}

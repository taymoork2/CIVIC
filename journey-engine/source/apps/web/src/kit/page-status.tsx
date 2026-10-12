import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'

/** The same count and keyboard destination in lists and piece choosers. */
export function PageStatus({ shown, total, more, loading, onMore, label }: {
  shown: number; total: number | undefined; more: boolean; loading: boolean; onMore: () => void; label: string
}) {
  const status = useRef<HTMLParagraphElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const requested = useRef(false)
  useEffect(() => {
    if (loading || !requested.current) return
    requested.current = false
    // The final page removes the button; give keyboard users its nearby count.
    if (!more && document.activeElement === document.body) status.current?.focus()
    else if (document.activeElement === button.current) button.current?.scrollIntoView({ block: 'nearest' })
  }, [shown, more, loading])
  return <div className="grid gap-2">
    <p ref={status} tabIndex={-1} className={more || loading ? 'm-0 text-ink-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring' : 'sr-only focus:not-sr-only focus:text-ink-2'} role="status">
      {loading ? `Loading more… ${shown} of ${total ?? '…'} pieces shown.` : more ? `${shown} of ${total ?? '…'} pieces shown. Search includes your whole closet.` : `All ${shown} ${shown === 1 ? 'piece' : 'pieces'} shown.`}
    </p>
    {more || loading ? <Button ref={button} type="button" variant="outline" aria-disabled={loading} onClick={() => {
      if (loading) return
      requested.current = true
      onMore()
    }}>{loading ? 'Loading more…' : label}</Button> : null}
  </div>
}

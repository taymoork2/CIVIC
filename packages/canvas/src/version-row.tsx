import type { ReactNode } from 'react'
import { Check, ChevronDown } from '@civic/shell/icons'
import { Button } from '@civic/shell/ui/button'

export function VersionRow({ id, label, expanded, current, disabled, toggle, summary, children }: {
  id: string; label: string; expanded: boolean; current: boolean; disabled: boolean; toggle: () => void; summary: ReactNode; children: ReactNode
}) {
  return <>
    <Button variant="ghost" className="civic-version-toggle cv:h-auto cv:min-h-16 cv:w-full cv:justify-start cv:gap-3 cv:px-3 cv:py-2.5 cv:whitespace-normal cv:text-left cv:hover:bg-foreground/8 cv:dark:hover:bg-foreground/8 cv:aria-expanded:hover:bg-foreground/8 cv:aria-[current=true]:bg-primary/10 cv:aria-[current=true]:text-primary cv:aria-[current=true]:aria-expanded:bg-primary/10 cv:aria-[current=true]:hover:bg-primary/15 cv:aria-[current=true]:aria-expanded:hover:bg-primary/15 cv:aria-[current=true]:hover:text-primary cv:max-[600px]:grid cv:max-[600px]:grid-cols-[minmax(0,1fr)_16px] cv:max-[600px]:gap-x-2 cv:max-[600px]:gap-y-1.5 cv:max-[600px]:px-2" data-history-anchor aria-label={`Preview options for ${label}`} aria-expanded={expanded} aria-controls={`previews-${id}`} aria-current={current ? 'true' : undefined} disabled={disabled} onClick={toggle}>
      <span className="civic-version-text">{summary}</span>{current && <span className="civic-version-viewing"><Check aria-hidden="true" />Viewing</span>}<ChevronDown className="civic-version-chevron" aria-hidden="true" />
    </Button>
    {expanded && <div className="civic-version-expanded" id={`previews-${id}`} role="region" aria-label={`Previews for ${label}`}>{children}</div>}
  </>
}

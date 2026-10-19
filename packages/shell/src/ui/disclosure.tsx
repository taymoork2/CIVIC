import type { ReactNode, ComponentProps } from 'react'
import { ChevronDown } from '@civic/shell/icons'
import { Button } from '@civic/shell/ui/button'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@civic/shell/ui/collapsible'
import { cn } from 'cn'

export function Disclosure({ title, children, className, ...props }: Omit<ComponentProps<typeof Collapsible>, 'title'> & { title: ReactNode; children: ReactNode }) {
  return <Collapsible className={cn('cv:min-w-0', className)} {...props}>
    <CollapsibleTrigger render={<Button variant="ghost" className="cv:h-auto cv:w-full cv:justify-between cv:gap-2 cv:whitespace-normal cv:text-left" />}><span className="cv:min-w-0 cv:flex-1">{title}</span><ChevronDown data-icon="inline-end" aria-hidden="true" className="cv:transition-transform cv:in-data-panel-open:rotate-180" /></CollapsibleTrigger>
    <CollapsibleContent keepMounted className="cv:pt-2 cv:pb-3 cv:data-closed:hidden">{children}</CollapsibleContent>
  </Collapsible>
}

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { helpTipText } from '@/copy'
import { DesignIcon } from '@/kit/design-icons'

/**
 * A "?" beside a question or section that needs one plain-words explanation. It opens on tap,
 * not hover, because phones have no hover; the tap target is 44px though the mark is small.
 */
export function HelpTip({ topic, children }: { topic: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label={helpTipText.label(topic)} className="-my-3 shrink-0 justify-start rounded-full ps-1 align-middle font-normal text-muted-foreground" />}>
        <DesignIcon name="help" size="1em" aria-hidden="true"  />
      </PopoverTrigger>
      <PopoverContent className="p-3 text-sm leading-snug">{children}</PopoverContent>
    </Popover>
  )
}

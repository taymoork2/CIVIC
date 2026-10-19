import type { ComponentProps } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button } from './button'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

export function IconButton({ icon: Icon, label, shortcut, ...props }: Omit<ComponentProps<typeof Button>, 'children'> & { icon: LucideIcon; label: string; shortcut?: string }) {
  return <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon" aria-label={label} {...props} />}><Icon aria-hidden="true" /></TooltipTrigger><TooltipContent>{label}{shortcut && <kbd>{shortcut}</kbd>}</TooltipContent></Tooltip>
}

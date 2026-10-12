import * as React from 'react'
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { cn } from '@/lib/utils'

function Popover(props: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

/** The floating panel: portaled, anchored below its trigger, flipped when it would leave the screen. */
function PopoverContent({ className, align = 'start', side = 'bottom', sideOffset = 8, children, ...props }: PopoverPrimitive.Popup.Props & Pick<PopoverPrimitive.Positioner.Props, 'align' | 'side' | 'sideOffset'>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner align={align} side={side} sideOffset={sideOffset} collisionPadding={16} className="z-50">
        <PopoverPrimitive.Popup data-slot="popover-content" className={cn('w-[18rem] max-w-[calc(100vw_-_2rem)] max-h-[min(24rem,var(--available-height))] overflow-y-auto rounded-control border border-border bg-surface p-2 text-ink shadow-[var(--e2)] outline-none origin-[var(--transform-origin)] [transition:opacity_var(--dur-step)_var(--ease-out),transform_var(--dur-step)_var(--ease-out)] data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 motion-reduce:transition-none', className as string)} {...props}>
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }

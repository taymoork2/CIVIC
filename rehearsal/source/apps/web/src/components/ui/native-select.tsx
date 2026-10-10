import * as React from 'react'
import { cn } from '@/lib/utils'
import { inputVariants } from './input'
import { DesignIcon } from '@/kit/design-icons'

type NativeSelectProps = Omit<React.ComponentProps<'select'>, 'size'> & { size?: 'sm' | 'default' }

function NativeSelect({ className, size = 'default', ...props }: NativeSelectProps) {
  return <div className="group/native-select relative w-full has-[select:disabled]:opacity-50" data-slot="native-select-wrapper" data-size={size}>
    <select data-slot="native-select" data-size={size} className={cn(inputVariants, 'appearance-none pr-10 select-none data-[size=sm]:min-h-11', className)} {...props} />
    <DesignIcon name="chevronDown" size="1em" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" data-slot="native-select-icon"  />
  </div>
}

function NativeSelectOption({ className, ...props }: React.ComponentProps<'option'>) {
  return <option data-slot="native-select-option" className={cn('bg-[Canvas] text-[CanvasText]', className)} {...props} />
}

function NativeSelectOptGroup({ className, ...props }: React.ComponentProps<'optgroup'>) {
  return <optgroup data-slot="native-select-optgroup" className={cn('bg-[Canvas] text-[CanvasText]', className)} {...props} />
}

export { NativeSelect, NativeSelectOption, NativeSelectOptGroup }

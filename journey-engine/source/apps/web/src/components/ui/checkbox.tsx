import * as React from 'react'
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { cn } from '@/lib/utils'
import { DesignIcon } from '@/kit/design-icons'

/** Renders a span (plus Base UI's hidden input) so an enclosing <label> names it. Indeterminate (a mixed group) shows a dash in place of the tick. */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer grid size-6 shrink-0 place-items-center rounded-[6px] bg-surface text-[var(--bg)] cursor-pointer [box-shadow:inset_0_0_0_2px_var(--accent)]',
        '[transition:background-color_var(--dur-press)_var(--ease-out)]',
        'data-checked:bg-link data-indeterminate:bg-link',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className as string,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="grid place-items-center [&_svg]:size-4">
        <DesignIcon name="check" size="1em" strokeWidth={2.2} aria-hidden="true" className="[[data-indeterminate]_&]:hidden"  />
        <DesignIcon name="minus" size="1em" strokeWidth={2.2} aria-hidden="true" className="hidden [[data-indeterminate]_&]:block"  />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }

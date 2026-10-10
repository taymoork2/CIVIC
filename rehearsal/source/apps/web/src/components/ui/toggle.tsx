import * as React from 'react'
import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import type { VariantProps } from 'class-variance-authority'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * shadcn Toggle on Base UI: a two-state button that announces `aria-pressed` and carries
 * `data-pressed`. It takes the Button's looks (`variant`, `size`), so a chip, answer or picker keeps
 * its styling; `unstyled` leaves the look to the caller's classes.
 */
function Toggle({ className, variant = 'unstyled', size = 'unstyled', ...props }: TogglePrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <TogglePrimitive data-slot="toggle" className={cn(buttonVariants({ variant, size }), className as string)} {...props} />
}

export { Toggle }

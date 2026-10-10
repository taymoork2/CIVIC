import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { useRender } from '@base-ui/react/use-render'
import { mergeProps } from '@base-ui/react/merge-props'
import { cn } from '@/lib/utils'

const actionClasses = cn(
  "[.sheet-foot-row_&]:flex-1",
  "[.sheet.has-compact-actions_.sheet-foot-row_&]:min-h-[2.75rem] [.sheet.has-compact-actions_.sheet-foot-row_&]:w-auto [.sheet.has-compact-actions_.sheet-foot-row_&]:px-4 [.sheet.has-compact-actions_.sheet-foot-row_&]:flex-none [.sheet.has-compact-actions_.sheet-foot-row_&]:bg-transparent [.sheet.has-compact-actions_.sheet-foot-row_&]:shadow-none",
  "[.sheet.has-compact-actions_.sheet-foot-row_&]:text-[length:var(--step-1)]",
  "[.sheet.has-compact-actions_.sheet-foot_>_&]:min-h-12 [.sheet.has-compact-actions_.sheet-foot_>_&]:flex-1 [.sheet.has-compact-actions_.sheet-foot_>_&]:px-4",
  "[.sheet.has-compact-actions_.sheet-foot_>_&]:text-[length:var(--step-1)]",
  "[.now-card_&]:[background:var(--now-btn-bg)]",
  "[.now-card_&]:[color:var(--now-btn-ink)]",
  "[.primary-dock_&]:min-h-[3.5rem] [.primary-dock_&]:shadow-[0_8px_24px_rgba(0,_0,_0,_0.18)]",
  "[.primary-dock_&]:text-[length:var(--step-2)]",
  "[.band_&]:[justify-self:start]",
  "[.band_&]:mt-2",
  "inline-flex items-center justify-center gap-2 min-h-[3rem] p-[0_var(--space-5)] border-0 rounded-[1rem] shadow-[var(--button-edge)] font-semibold no-underline cursor-[pointer]",
  "[background:var(--accent-fill)]",
  "[color:var(--on-accent)]",
  "text-[length:var(--step-1)] leading-snug",
  "[transition:transform_var(--dur-press)_var(--ease-out),_background-color_var(--dur-press)_var(--ease-out)]",
  "[&:active:not(:disabled)]:[transform:scale(.98)]",
  // Unavailable reads as a flat secondary fill with muted text, never a faded primary.
  "[&:disabled]:cursor-[not-allowed] [&:disabled]:opacity-100 [&:disabled]:shadow-none",
  "[&:disabled:not(.secondary):not(.tonal):not(.danger)]:bg-secondary [&:disabled:not(.secondary):not(.tonal):not(.danger)]:text-muted-foreground",
  "[&.secondary:disabled]:text-muted-foreground [&.tonal:disabled]:text-muted-foreground [&.danger:disabled]:opacity-45",
  "[&:disabled]:[transition:transform_120ms_var(--ease-out),_background-color_160ms_var(--ease-out),_color_160ms_var(--ease-out)]",
  "[&.secondary]:bg-surface [&.secondary]:text-ink [&.secondary]:shadow-none",
  "[&.secondary]:[border:1px_solid_var(--line)]",
  // Tonal: a quiet filled action (Air dry, Change) that never competes with the one primary.
  "[&.tonal]:[background:var(--surface-2)] [&.tonal]:text-ink [&.tonal]:shadow-none",
  "[@media_(hover:_hover)_and_(pointer:_fine)]:[&.tonal:hover:not(:disabled)]:[background:color-mix(in_srgb,_var(--surface-2)_85%,_var(--ink))]",
  "[&.danger]:bg-warn-ink [&.danger]:text-warn-bg",
  "[.closet-now_&]:flex-none [.closet-now_&]:min-h-[3.5rem] [.closet-now_&]:rounded-[1.75rem]",
  "[.bottle-typed_&]:min-h-[3.5rem]",
  "[.bottle-lookup_&]:min-h-[3rem]",
  "[@media_(hover:_hover)_and_(pointer:_fine)]:[&:hover:not(:disabled)]:[background:color-mix(in_srgb,_var(--accent-fill)_88%,_var(--bg))]",
  "[@media_(hover:_hover)_and_(pointer:_fine)]:[&.secondary:hover:not(:disabled)]:bg-surface-2",
  "[&.secondary:active:not(:disabled)]:[background:color-mix(in_srgb,_var(--surface-2)_85%,_var(--ink))]",
  "[@media_(hover:_hover)_and_(pointer:_fine)]:[&.danger:hover:not(:disabled)]:[background:color-mix(in_srgb,_var(--warn-ink)_88%,_var(--bg))]",
  "motion-reduce:[&:active:not(:disabled)]:transform-none",
  "motion-reduce:[&:active:not(:disabled)]:brightness-95",
  "[.care-hero-action_&]:min-h-[2.75rem] [.care-hero-action_&]:m-0 [.care-hero-action_&]:rounded-[1.5rem]",
  "[.closet_.care-hero-action_&]:w-[2.75rem] [.closet_.care-hero-action_&]:p-0",
  "[.closet_.care-hero-action_&_span]:absolute [.closet_.care-hero-action_&_span]:w-[1px] [.closet_.care-hero-action_&_span]:h-[1px] [.closet_.care-hero-action_&_span]:overflow-hidden [.closet_.care-hero-action_&_span]:whitespace-nowrap",
  "[.closet_.care-hero-action_&_span]:[clip-path:inset(50%)]",
  "[.care-hero.has-photo_&]:w-full [.care-hero.has-photo_&]:justify-center [.care-hero.has-photo_&]:min-h-[3rem]",
  "[.care-hero.has-photo_&]:[background:linear-gradient(105deg,_var(--sig),_var(--button-end))]",
  "[.home-overview_.care-hero.has-photo_&]:bg-sig",
  "[&:not(.secondary):not(.tonal):not(.danger)]:bg-sig [&:not(.secondary):not(.tonal):not(.danger)]:text-on-sig",
  "lg:[.closet_.care-hero-action_&]:w-auto lg:[.closet_.care-hero-action_&]:px-[1rem]",
  "lg:[.closet_.care-hero-action_&_span]:static lg:[.closet_.care-hero-action_&_span]:w-auto lg:[.closet_.care-hero-action_&_span]:h-auto lg:[.closet_.care-hero-action_&_span]:overflow-visible",
  "lg:[.closet_.care-hero-action_&_span]:[clip-path:none]",
  "motion-reduce:transition-none",
)

const buttonVariants = cva(
  'touch-manipulation select-none cursor-pointer disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none',
  {
    variants: {
      variant: {
        default: cn('button', actionClasses),
        outline: cn('button secondary', actionClasses),
        secondary: cn('button secondary', actionClasses),
        tonal: cn('button tonal', actionClasses),
        ghost: 'inline-flex items-center justify-center gap-2 border-0 bg-transparent text-foreground no-underline font-semibold rounded-control [&:active:not(:disabled)]:bg-muted [@media_(hover:_hover)_and_(pointer:_fine)]:[&:hover:not(:disabled)]:bg-muted',
        destructive: cn('button danger', actionClasses),
        // Text action: accent text, no fill (prototype Text button).
        link: 'inline-flex items-center justify-center gap-2 border-0 bg-transparent text-link no-underline font-semibold rounded-control [&:active:not(:disabled)]:bg-muted [@media_(hover:_hover)_and_(pointer:_fine)]:[&:hover:not(:disabled)]:bg-muted',
        // A translucent white pill for yellow (confirm, waiting) and red (conflict) alerts: faint outline, no shadow, text in the box tone.
        alert: cn(
          "inline-flex min-h-[2.125rem] relative items-center justify-center gap-2 px-3.5 rounded-control no-underline whitespace-nowrap",
          "[border:1px_solid_var(--alert-pill-line)] [background:var(--alert-pill)] [color:inherit] shadow-none font-semibold text-[length:.875rem]",
          "[transition:transform_var(--dur-press)_var(--ease-out),_background-color_var(--dur-press)_var(--ease-out)]",
          // The pill is 34px; this reaches the 44px minimum target.
          "after:absolute after:inset-x-0 after:-inset-y-[.3125rem] after:[content:'']",
          "[&:active:not(:disabled)]:[transform:scale(.98)] [&:disabled]:opacity-45 motion-reduce:[&:active:not(:disabled)]:transform-none motion-reduce:[&:active:not(:disabled)]:brightness-95",
        ),
        // No look of its own and no browser default either; the caller classes style it.
        unstyled: 'border-0 bg-transparent text-inherit',
      },
      size: {
        default: 'min-h-12 px-6',
        xs: 'min-h-11 px-2 text-base leading-snug',
        sm: 'min-h-11 px-3 text-base leading-snug',
        lg: 'min-h-12 px-6',  // the design's footer primary is 48px, like every other primary
        icon: 'size-11 p-0 [&_svg]:size-5',
        'icon-xs': 'size-11 p-0 [&_svg]:size-4',
        'icon-sm': 'size-11 p-0 [&_svg]:size-5',
        'icon-lg': 'size-12 p-0 [&_svg]:size-6',
        unstyled: '',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

/** `render` swaps the element (a router link, say) while keeping the button's look, as in Base UI. */
function Button({ className, variant, size, render, ...props }: useRender.ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return useRender({
    defaultTagName: 'button',
    render,
    props: mergeProps<'button'>({ className: cn(buttonVariants({ variant, size }), className) }, props, { 'data-slot': 'button', 'data-variant': variant ?? 'default', 'data-size': size ?? 'default' } as never),
  })
}

export { Button, buttonVariants }

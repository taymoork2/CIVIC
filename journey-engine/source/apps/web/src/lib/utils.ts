import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge's defaults know nothing about WashCloset's own theme keys, so two classes that
 * should conflict would otherwise both survive (or the wrong one would). Three groups need
 * teaching by hand:
 * - font-size: `text-step--1`..`text-step-4` and `text-figure-sm`..`text-figure-xl` (see
 *   generated/tailwind-theme.css). Without this, "step-1" doesn't match any known size and
 *   `text-step-1` falls through to the (also `text-`-prefixed) colour group instead, so it wins
 *   or loses against a real text colour by accident.
 * - rounded: `rounded-card/label/control/field/mark`, WashCloset's own radius scale.
 * - the theme colours themselves: ink/ink-2/ink-3, surface/surface-2/surface-3, line,
 *   sig/on-sig/sig-ink, and each status family's own `-bg`/`-ink` pair. Adding these to
 *   `theme.color` covers every colour-based group at once (bg-*, text-*, border-*, ...).
 */
const twMerge = extendTailwindMerge({
  // Our font-size tokens contain no line height. Only an explicit text-size/leading
  // postfix should replace a separately chosen leading utility.
  override: { conflictingClassGroups: { 'font-size': [] } },
  extend: {
    classGroups: {
      'font-size': [{
        text: [
          'step--1', 'step-0', 'step-1', 'step-2', 'step-3', 'step-4',
          'figure-sm', 'figure-md', 'figure-lg', 'figure-xl',
        ],
      }],
      rounded: [{ rounded: ['card', 'label', 'control', 'field', 'mark'] }],
    },
    theme: {
      color: [
        'ink', 'ink-2', 'ink-3',
        'surface', 'surface-2', 'surface-3',
        'line',
        'sig', 'on-sig', 'sig-ink',
        'ready', 'ready-bg', 'ready-ink',
        'hamper', 'hamper-bg', 'hamper-ink',
        'washing', 'washing-bg', 'washing-ink',
        'hanging', 'hanging-bg', 'hanging-ink',
        'warn-bg', 'warn-ink',
        'conflict-bg', 'conflict-ink',
      ],
    },
  },
})

/** Joins class names and resolves Tailwind utility conflicts in WashCloset's own theme groups. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

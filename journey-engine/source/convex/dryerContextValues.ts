import { v } from 'convex/values'

export const dryerProgramMode = v.union(v.literal('fixed'), v.literal('sensor'), v.literal('unknown'))

/** Additive start snapshot; actual machine minutes remain a separate field. */
export const dryerDurationSuggestion = v.union(
  v.object({ version: v.literal(1), minutes: v.number(), basis: v.literal('recorded_program'), source: v.string() }),
  v.object({ version: v.literal(2), minutes: v.union(v.number(), v.null()), baselineMinutes: v.union(v.number(), v.null()),
    basis: v.union(v.literal('baseline_only'), v.literal('comparable_outcomes'), v.literal('unavailable')),
    mode: dryerProgramMode, source: v.string(), contextKey: v.union(v.string(), v.null()),
    independentWashes: v.number(),
  }),
)

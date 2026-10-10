import { v } from 'convex/values'

export const outcomeDimension = v.union(v.literal('overall'), v.literal('stain'), v.literal('appearance'), v.literal('odor'), v.literal('feel'), v.literal('damage'))
export const outcomeStage = v.union(v.literal('after_wash'), v.literal('after_drying'), v.literal('after_wearing'))
export const outcomeResult = v.union(v.literal('unknown'), v.literal('improved'), v.literal('unchanged'), v.literal('worse'), v.literal('irritation'), v.literal('damage'))
export const assessedResult = v.union(outcomeResult, v.null())
export const assessmentView = v.object({ assessmentId: v.id('outcomeAssessments'), dimension: outcomeDimension,
  checkedWhen: outcomeStage, result: assessedResult, note: v.optional(v.string()), revision: v.number(), recordedAt: v.number() })
export const assessmentRevisionView = v.object({ revision: v.number(), result: assessedResult, note: v.optional(v.string()), recordedAt: v.number() })

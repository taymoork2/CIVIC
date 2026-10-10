import { v } from 'convex/values'

const constructionFact = v.object({
  presence: v.union(v.literal('unknown'), v.literal('absent'), v.literal('present')),
  confidence: v.union(v.literal('unknown'), v.literal('observed'), v.literal('verified')), source: v.string(),
})
export const constructionFacts = v.object({
  zipper: v.optional(constructionFact), hooks: v.optional(constructionFact),
  buttons: v.optional(constructionFact), delicateTrim: v.optional(constructionFact),
})
export const decorationFacts = {
  kind: v.union(v.literal('unknown'), v.literal('none'), v.literal('printed'), v.literal('embroidered')),
  method: v.union(v.literal('unknown'), v.literal('dtg'), v.literal('dtflex'), v.literal('screen_print'), v.literal('other')),
  manufacturer: v.string(), source: v.string(), confidence: v.union(v.literal('unknown'), v.literal('observed'), v.literal('verified')),
  guidanceSource: v.optional(v.string()), construction: v.optional(constructionFacts),
}
export const garmentDecoration = v.object({ ...decorationFacts, revision: v.number(), recordedAt: v.number(), recordedBy: v.string() })
export const adviceReminder = v.object({ enabled: v.boolean(), recordedAt: v.number(), recordedBy: v.string() })
export const adviceContext = v.object({
  tipId: v.union(v.literal('inside_out'), v.literal('embroidery_inside_out'), v.literal('close_zipper'), v.literal('fasten_hooks'), v.literal('fasten_buttons'), v.literal('protect_delicate_trim'), v.literal('pre_owned_rinse'), v.literal('pre_owned_heat'), v.literal('pre_owned_musty'), v.literal('pre_owned_musty_skip'), v.literal('pre_owned_smoke')),
  scope: v.union(v.literal('manufacturer_print_method'), v.literal('general_graphic'), v.literal('manufacturer_embroidery'), v.literal('general_embroidery'), v.literal('general_zipper'), v.literal('general_hooks'), v.literal('general_buttons'), v.literal('general_delicate_trim'), v.literal('pre_owned_rinse'), v.literal('pre_owned_heat'), v.literal('pre_owned_musty'), v.literal('pre_owned_musty_skip'), v.literal('pre_owned_smoke')),
  reason: v.string(), source: v.string(), policyVersion: v.string(),
})

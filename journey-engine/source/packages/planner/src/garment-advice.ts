/** Optional handling advice never changes a label, settings, dose or permission. */
export const garmentAdvicePolicyVersion = '2'
export const printfulCareSource = 'https://help.printful.com/hc/en-us/articles/50263252811537-How-do-I-take-care-of-my-products'
export const constructionCareSource = 'https://homedelivery.whirlpoolcorp.com/blog/washers-and-dryers/how-to-sort-separate-laundry.html'
export const constructionFeatures = ['zipper', 'hooks', 'buttons', 'delicateTrim'] as const
export type ConstructionFeature = typeof constructionFeatures[number]
export interface ConstructionFact {
  readonly presence: 'unknown' | 'absent' | 'present'
  readonly confidence: 'unknown' | 'observed' | 'verified'
  readonly source: string
}
export type GarmentConstruction = Readonly<Partial<Record<ConstructionFeature, ConstructionFact>>>
export interface GarmentDecoration {
  readonly kind: 'unknown' | 'none' | 'printed' | 'embroidered'
  readonly method: 'unknown' | 'dtg' | 'dtflex' | 'screen_print' | 'other'
  readonly manufacturer: string
  readonly source: string
  readonly confidence: 'unknown' | 'observed' | 'verified'
  /** A checked manufacturer care reference, distinct from evidence of the decoration itself. */
  readonly guidanceSource?: string
  readonly construction?: GarmentConstruction
}
export const preOwnedTips = ['pre_owned_rinse', 'pre_owned_heat', 'pre_owned_musty', 'pre_owned_musty_skip', 'pre_owned_smoke'] as const
export type PreOwnedTip = typeof preOwnedTips[number]
export interface GarmentAdvice {
  readonly tipId: PreOwnedTip | 'inside_out' | 'embroidery_inside_out' | 'close_zipper' | 'fasten_hooks' | 'fasten_buttons' | 'protect_delicate_trim'
  readonly scope: PreOwnedTip | 'manufacturer_print_method' | 'general_graphic' | 'manufacturer_embroidery' | 'general_embroidery' | 'general_zipper' | 'general_hooks' | 'general_buttons' | 'general_delicate_trim'
  readonly action: string
  readonly reason: string
  readonly source: string
  readonly policyVersion: string
  readonly textileIds: readonly string[]
}
const apparel = new Set(['t_shirt', 'shirt', 'sweater', 'pants', 'shorts', 'skirt', 'dress', 'outerwear', 'suit', 'pajamas', 'underwear', 'socks', 'workout', 'baby_bodysuit'])
const constructionTips: Record<ConstructionFeature, { tipId: GarmentAdvice['tipId']; scope: GarmentAdvice['scope']; action: string; labelTopic: RegExp }> = {
  zipper: { tipId: 'close_zipper', scope: 'general_zipper', action: 'Close recorded zippers (optional)', labelTopic: /zip|fasten|closure|open|clos(?:e|ed|ing)/i },
  hooks: { tipId: 'fasten_hooks', scope: 'general_hooks', action: 'Fasten recorded hooks and eyes (optional)', labelTopic: /hook|eye|fasten|closure|open|clos(?:e|ed|ing)/i },
  buttons: { tipId: 'fasten_buttons', scope: 'general_buttons', action: 'Fasten recorded buttons (optional)', labelTopic: /button|fasten|closure|open|clos(?:e|ed|ing)/i },
  delicateTrim: { tipId: 'protect_delicate_trim', scope: 'general_delicate_trim', action: 'Consider a mesh bag for recorded delicate trim (optional)', labelTopic: /bag|mesh|net|trim|lace|sequin|bead|ornament|embellish|separate|alone/i },
}
export function garmentAdvice(items: readonly {
  readonly id: string; readonly kind?: string | null; readonly decoration?: GarmentDecoration
  readonly adviceReminder?: boolean
  readonly care?: { readonly washMethod?: string | null; readonly instructions?: { readonly preparation: readonly string[]; readonly washing?: readonly string[] } } | null
}[]): readonly GarmentAdvice[] {
  const groups = new Map<GarmentAdvice['scope'], GarmentAdvice>()
  const add = (id: string, tip: Omit<GarmentAdvice, 'textileIds' | 'policyVersion'>) => {
    groups.set(tip.scope, { ...tip, policyVersion: garmentAdvicePolicyVersion, textileIds: [...(groups.get(tip.scope)?.textileIds ?? []), id] })
  }
  for (const item of items) {
    const fact = item.decoration
    if (item.adviceReminder === false || !fact || !item.kind || !apparel.has(item.kind) || item.care?.washMethod !== 'machine') continue
    const label = [...(item.care.instructions?.preparation ?? []), ...(item.care.instructions?.washing ?? [])]
    // Relevant exact wording (including conditional/prohibited handling) replaces the generic action.
    const labelAddresses = (topic: RegExp) => label.some((wording) => topic.test(wording))
    if (fact.confidence !== 'unknown' && fact.source.trim() && !labelAddresses(/inside[\s-]*out|right[\s-]*side[\s-]*out|outside[\s-]*out|face[\s-]+out|do not (?:turn|invert|reverse)/i)) {
      if (fact.kind === 'printed') {
        const exact = fact.manufacturer.trim().toLowerCase() === 'printful' && (fact.method === 'dtg' || fact.method === 'dtflex')
        add(item.id, { tipId: 'inside_out', scope: exact ? 'manufacturer_print_method' : 'general_graphic', action: 'Turn printed clothing inside out (optional)',
          reason: exact
            ? 'Printful recommends inside-out washing for its DTG and DTFlex apparel. This tip matches the recorded maker and method; your label still governs the wash.'
            : 'Optional general tip for the recorded graphic. The source covers Printful DTG and DTFlex apparel; it does not establish instructions for this garment or its print method.', source: printfulCareSource })
      } else if (fact.kind === 'embroidered') {
        const exact = fact.confidence === 'verified' && fact.manufacturer.trim().toLowerCase() === 'printful' && fact.guidanceSource === printfulCareSource && fact.method === 'unknown'
        add(item.id, { tipId: 'embroidery_inside_out', scope: exact ? 'manufacturer_embroidery' : 'general_embroidery', action: 'Turn embroidered clothing inside out (optional)',
          reason: exact
            ? 'Printful recommends inside-out washing for its embroidered clothing. The recorded maker and checked care source match this clothing category; your label still governs the wash.'
            : 'Optional general tip for recorded embroidery. Printful’s source covers its embroidered clothing; it does not establish manufacturer instructions for this garment.', source: printfulCareSource })
      }
    }
    for (const feature of constructionFeatures) {
      const recorded = fact.construction?.[feature], tip = constructionTips[feature]
      if (recorded?.presence !== 'present' || recorded.confidence === 'unknown' || !recorded.source.trim() || labelAddresses(tip.labelTopic)) continue
      add(item.id, { tipId: tip.tipId, scope: tip.scope, action: tip.action,
        reason: feature === 'delicateTrim'
          ? 'Optional general precaution for recorded delicate trim: consider a mesh bag you already have to limit contact during washing. Whirlpool’s general laundry guidance covers delicate items, not this garment or trim; it does not establish that the trim is washable.'
          : 'Optional general precaution for the recorded fastening to reduce snagging during washing. Whirlpool’s general laundry guidance does not establish manufacturer instructions for this garment. Follow any exact fastening directions on its label.', source: constructionCareSource })
    }
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([, tip]) => ({ ...tip, textileIds: [...new Set(tip.textileIds)].sort() }))
}

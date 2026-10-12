/** Fiber checks can restrict recorded care; they never grant a missing label permission. */
export function materialCareProblem(material: string | null | undefined, care: {
  readonly maxTemperatureC?: unknown
  readonly washMethod?: unknown
  readonly cycle?: unknown
  readonly bleach?: unknown
  readonly dryMethod?: unknown
  readonly dryHeat?: unknown
  readonly ironHeat?: unknown
} | null | undefined): string | null {
  const wool = /\b(wool|cashmere|merino|mohair|angora|alpaca|camel)\b/i.test(material ?? '')
  const silk = /\bsilk\b/i.test(material ?? '')
  if ((wool || silk) && (care?.bleach === 'any' || care?.bleach === 'non_chlorine')) return 'Wool and silk cannot use bleach. Check the fabric and bleach symbol on the label.'
  if (!wool) return null
  // Woolmark's care guidance: gentle wash up to 40°C, low tumble only when labelled, medium iron.
  if (typeof care?.maxTemperatureC === 'number' && care.maxTemperatureC > 40) return 'Hot washing can shrink wool. Check the wash temperature on the label.'
  if (care?.washMethod === 'machine' && (care.cycle === 'normal' || care.cycle === 'permanent_press')) return 'Wool needs a gentle wool or delicate cycle when its label permits machine washing.'
  if (care?.dryMethod === 'tumble_dry' && !['low', 'no_heat'].includes(String(care.dryHeat))) return 'Wool needs a label permitting low-heat tumble drying. Check the drying symbol.'
  if (care?.ironHeat === 'high') return 'High iron heat can damage wool. Check the iron symbol on the label.'
  return null
}

/** CIVIƆ contract view: one screen's evidence by owner, and an alignment state no stronger than that evidence. */
export type ScenarioEvidence = {
  id: string
  component?: string
  preview?: string
  implementation?: string
  designCoverage?: string
  reference?: string
  behavior?: string
  native?: string
  device?: string
}
export type Tone = 'proven' | 'partial' | 'missing'
export type Dimension = { label: string; owner: 'Design' | 'Engineering' | 'QA'; value: string; tone: Tone }
// Alignment labels from docs/product-spec.md and the Rehearsal brief. Only states this evidence can support are derived.
export type Alignment = 'Aligned' | 'Unreviewed drift' | 'Unknown / evidence stale'

const tone = (value: string | undefined, proven: (v: string) => boolean, partial: (v: string) => boolean): Tone =>
  value === undefined ? 'missing' : proven(value) ? 'proven' : partial(value) ? 'partial' : 'missing'

export function contractDimensions(scenario: ScenarioEvidence): Dimension[] {
  return [
    { label: 'Design intent', owner: 'Design', value: scenario.designCoverage ?? 'missing', tone: tone(scenario.designCoverage, () => false, (v) => v !== 'missing') },
    { label: 'Design reference', owner: 'Design', value: scenario.reference ?? 'missing', tone: tone(scenario.reference, (v) => v.startsWith('source-current'), (v) => v === 'stale') },
    { label: 'Web implementation', owner: 'Engineering', value: scenario.implementation === 'present' ? scenario.component ?? 'present' : 'missing', tone: tone(scenario.implementation, (v) => v === 'present', () => false) },
    { label: 'Web preview', owner: 'Engineering', value: scenario.preview ?? 'missing', tone: tone(scenario.preview, (v) => v === 'working-synthetic', (v) => v === 'visual-or-partial') },
    { label: 'Native (iOS, Android)', owner: 'Engineering', value: scenario.native ?? 'missing', tone: tone(scenario.native, (v) => v === 'present', () => false) },
    { label: 'Behavior evidence', owner: 'QA', value: scenario.behavior ?? 'missing', tone: tone(scenario.behavior, (v) => v.startsWith('scoped local behavior passed'), (v) => v.startsWith('drawer rendering passed')) },
    { label: 'Device acceptance', owner: 'QA', value: scenario.device ?? 'unverified', tone: tone(scenario.device, (v) => v === 'accepted', () => false) },
  ]
}

/** An open review is an observed difference without a decision. Aligned needs every dimension proven. */
export function alignment(dimensions: Dimension[], openReviews: number): Alignment {
  if (openReviews > 0) return 'Unreviewed drift'
  return dimensions.every((dimension) => dimension.tone === 'proven') ? 'Aligned' : 'Unknown / evidence stale'
}

/** Portfolio confidence: how many registered screens have each dimension proven. */
export function coverage(scenarios: ScenarioEvidence[]) {
  const rows = scenarios.map(contractDimensions)
  return (rows[0] ?? contractDimensions({ id: '' })).map((dimension, i) => ({ label: dimension.label, owner: dimension.owner, proven: rows.filter((row) => row[i]!.tone === 'proven').length, partial: rows.filter((row) => row[i]!.tone === 'partial').length, total: rows.length }))
}

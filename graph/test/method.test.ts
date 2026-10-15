import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bundledProfile, checkGraph, compareToBaseline, indexGraph, methodCheck, profileErrors, renderMethod, resolveProfile, validateGraph, type ComponentInstance, type GraphDocument, type GraphRecord, type Link, type MethodProfile, type ResolvedProfile, type SemanticComponent, type Target, type Token } from '../src/index.ts'

// Methodology profiles (decision 0014): a team's declared tiers checked against what the graph
// already records, with no tier names in the graph itself.

const design = { role: 'design' as const, who: 'shop-design' }
const engineering = { role: 'design-engineering' as const, who: 'web-ds', platform: 'web' as const }

const semantic = (key: string, title: string): SemanticComponent => ({ id: `semantic:${key}`, kind: 'semantic-component', title, purpose: title, variants: [], states: [], owners: [design] })
const target = (id: string, title: string, scale: Target['scale']): Target => ({ id, kind: 'target', title, scale, presence: 'expected', owners: [design] })
const instance = (id: string, semanticId: string, placedOn: string): ComponentInstance => ({ id, kind: 'component-instance', title: id, semanticId, placedOn, product: 'shop', origin: 'design' })
const contains = (from: string, to: string): Link => ({ from, relation: 'contains', to, status: 'declared' })
const token = (path: string): Token => ({ id: `token:${path}`, kind: 'token', title: path, path, type: 'color' })

function shop(): GraphDocument {
  const records: GraphRecord[] = [
    semantic('button', 'Button'),
    semantic('card', 'Card'),
    semantic('badge', 'Badge'),
    target('target:shop.checkout', 'Checkout', 'journey'),
    target('target:shop.summary', 'Summary', 'screen'),
    target('target:shop.summary.loading', 'Summary / Loading', 'state'),
    target('target:shop.offer', 'Offer tile', 'component'),
    target('target:shop.promo', 'Promo strip', 'component'),
    target('target:shop.leaf', 'Divider', 'component'),
    instance('instance:shop.offer.card', 'semantic:card', 'target:shop.offer'),
    instance('instance:shop.promo.badge', 'semantic:badge', 'target:shop.promo'),
    instance('instance:shop.summary.loading.button', 'semantic:button', 'target:shop.summary.loading'),
    { id: 'platform:web.button', kind: 'platform-component', title: 'Web Button', platform: 'web', library: { package: '@shop/ui' }, symbol: 'Button', variants: [], owners: [engineering] },
    { id: 'extension:web.button.tone', kind: 'extension-point', title: 'tone', platformComponentId: 'platform:web.button', mechanism: 'token', name: 'tone', expresses: ['tone'] },
    token('paletteBlue60'),
    token('paletteBlue70'),
    token('colorBrandBackground'),
    token('buttonBackground'),
  ]
  const links: Link[] = [
    contains('target:shop.checkout', 'target:shop.summary'),
    contains('target:shop.summary', 'target:shop.summary.loading'),
    contains('target:shop.summary', 'target:shop.offer'),
    contains('target:shop.offer', 'instance:shop.offer.card'),
    contains('target:shop.promo', 'instance:shop.promo.badge'),
    contains('target:shop.summary.loading', 'instance:shop.summary.loading.button'),
    { from: 'platform:web.button', relation: 'uses-token', to: 'token:paletteBlue60', status: 'declared' },
    { from: 'platform:web.button', relation: 'uses-token', to: 'token:colorBrandBackground', status: 'declared' },
    { from: 'extension:web.button.tone', relation: 'uses-token', to: 'token:paletteBlue70', status: 'declared' },
    { from: 'semantic:card', relation: 'uses-token', to: 'token:buttonBackground', status: 'declared' },
  ]
  return { schema: 'civic.graph/0', records, links }
}

const atomic = (placements: MethodProfile['placements']): ResolvedProfile =>
  resolveProfile({ schema: 'civic.method/0', id: 'shop.atomic', title: 'Atomic Design', extends: 'atomic-design', owners: [design], placements }, bundledProfile)

const tokenTiers = (extra: Partial<MethodProfile> = {}): ResolvedProfile =>
  resolveProfile(
    {
      schema: 'civic.method/0',
      id: 'shop.tokens',
      title: 'Token tiers',
      extends: 'token-tiers',
      placements: [
        { tier: 'primitive', tokenPrefixes: ['palette'], declaredBy: engineering },
        { tier: 'semantic', tokenPrefixes: ['color'], declaredBy: engineering },
        { tier: 'component', ids: ['token:buttonBackground'], declaredBy: engineering },
      ],
      ...extra,
    },
    bundledProfile,
  )

test('the test graph is valid', () => {
  assert.deepEqual(validateGraph(shop()).filter((issue) => issue.severity === 'error'), [])
})

test('the bundled profiles are valid, and none says it is the default', () => {
  for (const id of ['atomic-design', 'token-tiers']) {
    const profile = bundledProfile(id)
    assert.ok(profile, id)
    assert.deepEqual(profileErrors(resolveProfile(profile!, bundledProfile)), [], id)
    assert.equal('default' in profile!, false)
  }
  assert.equal(bundledProfile('../package'), undefined)
})

test('a team file takes its tiers and rules from the profile it extends', () => {
  const profile = atomic([])
  assert.deepEqual(profile.tiers.map((tier) => tier.key), ['atom', 'molecule', 'organism', 'template'])
  assert.deepEqual(profile.contains?.molecule, ['atom'])
  assert.equal(profile.link, 'https://atomicdesign.bradfrost.com/chapter-2/')
  assert.throws(() => resolveProfile({ schema: 'civic.method/0', id: 'x', title: 'X', extends: 'no-such-profile' }, bundledProfile), /not a bundled profile/)
})

test('a profile that names unknown tiers or mixes holds is refused before any graph is read', () => {
  assert.throws(() => atomic([{ tier: 'page', ids: ['semantic:card'], declaredBy: design }]), /unknown tier: page/)
  assert.throws(() => atomic([{ tier: 'atom', tokenPrefixes: ['color'], declaredBy: design }]), /uses token prefixes, but atom holds components/)
  assert.throws(() => atomic([{ tier: 'atom', ids: ['semantic:card'] } as never]), /needs declaredBy/)
  assert.throws(() => resolveProfile({ schema: 'civic.method/0', id: 'x', title: 'X', tiers: [{ key: 'a', title: 'a', holds: 'tokens' }], references: [{ from: 'components', may: ['b'] }] }, bundledProfile), /may read b, which is not a token tier/)
})

test('a screen is a template by the profile\'s own rule; components wait for their owners', () => {
  const result = methodCheck(indexGraph(shop()), atomic([{ tier: 'molecule', ids: ['semantic:card'], declaredBy: design }]))
  const tierOf = (id: string) => result.placed.find((item) => item.id === id)?.tier
  assert.deepEqual(tierOf('target:shop.summary'), { tier: 'template', by: 'profile' })
  assert.equal(tierOf('target:shop.summary.loading'), undefined, 'a state is part of its screen, not a tier of its own')
  assert.equal(result.placed.some((item) => item.id === 'target:shop.checkout'), false, 'journeys are not tiered')
  assert.deepEqual(tierOf('semantic:card'), { tier: 'molecule', by: 'declared', declaredBy: design })
  assert.equal(result.counts.held, 7)
})

test('composition: a molecule that contains a molecule breaks the rule; a template looks through its states', () => {
  const result = methodCheck(
    indexGraph(shop()),
    atomic([
      { tier: 'atom', ids: ['semantic:button', 'semantic:badge', 'target:shop.leaf'], declaredBy: design },
      { tier: 'molecule', ids: ['semantic:card', 'target:shop.offer', 'target:shop.promo'], declaredBy: design },
    ]),
  )
  const composition = result.gaps.filter((gap) => gap.kind === 'tier-composition')
  assert.deepEqual(composition.map((gap) => [gap.subjectId, gap.detail]), [['target:shop.offer', 'shop.atomic semantic:card']])
  assert.match(composition[0]!.summary, /Offer tile is a molecule and contains Card, a molecule; Atomic Design lets a molecule contain only atoms/)
  // Summary (template) contains Offer tile (molecule) and, through its loading state, Button (atom); Offer contains Card; Promo contains Badge.
  assert.equal(result.counts.containments, 4)
  assert.deepEqual(result.gaps.filter((gap) => gap.kind === 'no-tier'), [])
})

test('no tier: CIVIC suggests the lowest tier that may hold what a product component contains, never for a library component', () => {
  const result = methodCheck(indexGraph(shop()), atomic([{ tier: 'molecule', ids: ['semantic:card'], declaredBy: design }]))
  const gap = (id: string) => result.gaps.find((item) => item.kind === 'no-tier' && item.subjectId === id)!
  assert.equal(gap('target:shop.offer').suggested, 'organism')
  assert.match(gap('target:shop.offer').summary, /suggests organism, the lowest tier that may contain the molecule it contains; it counts once an owner declares it/)
  assert.equal(gap('target:shop.leaf').suggested, 'atom')
  assert.equal(gap('target:shop.promo').suggested, undefined, 'its Badge has no tier yet')
  assert.match(gap('target:shop.promo').summary, /until Badge, which it contains, has a tier/)
  assert.equal(gap('semantic:button').suggested, undefined)
  assert.match(gap('semantic:button').summary, /doesn't record what a library component contains/)
  // A suggestion is never a placement: nothing it suggests is checked as a tier.
  assert.equal(result.placed.find((item) => item.id === 'target:shop.offer')?.tier, undefined)
})

test('token tiers: an implementation reading a primitive is one finding per tier, its extension points included', () => {
  const result = methodCheck(indexGraph(shop()), tokenTiers())
  const gaps = result.gaps.filter((gap) => gap.kind === 'token-tier')
  assert.deepEqual(gaps.map((gap) => [gap.subjectId, gap.detail]), [['platform:web.button', 'shop.tokens primitive']])
  assert.match(gaps[0]!.summary, /Web Button reads 2 primitive tokens \(paletteBlue60, paletteBlue70\); Token tiers lets a component implementation read only semantic tokens and component tokens/)
  assert.deepEqual(gaps[0]!.owners, [engineering])
  assert.deepEqual(result.counts, { held: 4, containments: 0, references: 4, pastTier: 2 })
})

test('token tiers: a tier\'s own rule wins over the rule for its kind', () => {
  const profile = atomicAndTokens()
  const result = methodCheck(indexGraph(shop()), profile)
  const gaps = result.gaps.filter((gap) => gap.kind === 'token-tier')
  // The Card is an organism, which may read only semantic tokens, so its component token is past its tier.
  assert.deepEqual(gaps.map((gap) => [gap.subjectId, gap.detail]), [['platform:web.button', 'shop.mixed primitive'], ['semantic:card', 'shop.mixed component']])
  assert.match(gaps[1]!.summary, /lets an organism read only semantic tokens/)
})

function atomicAndTokens(): ResolvedProfile {
  const atomicTiers = bundledProfile('atomic-design')!.tiers!
  const tokenTierList = bundledProfile('token-tiers')!.tiers!
  return resolveProfile(
    {
      schema: 'civic.method/0',
      id: 'shop.mixed',
      title: 'Shop system',
      tiers: [...atomicTiers, ...tokenTierList],
      references: [
        { from: 'organism', may: ['semantic'] },
        { from: 'implementations', may: ['semantic', 'component'] },
      ],
      placements: [
        { tier: 'organism', ids: ['semantic:card'], declaredBy: design },
        { tier: 'primitive', tokenPrefixes: ['palette'], declaredBy: engineering },
        { tier: 'semantic', tokenPrefixes: ['color'], declaredBy: engineering },
        { tier: 'component', ids: ['token:buttonBackground'], declaredBy: engineering },
      ],
    },
    bundledProfile,
  )
}

test('placements that do not fit the graph are errors, and the gate fails on them', () => {
  const profile = atomic([
    { tier: 'atom', ids: ['semantic:gone', 'target:shop.summary', 'semantic:card'], declaredBy: design },
    { tier: 'molecule', ids: ['semantic:card'], declaredBy: design },
  ])
  const result = methodCheck(indexGraph(shop()), profile)
  assert.deepEqual(result.errors, [
    'atom names semantic:gone, which is not in the graph',
    'atom holds components, but target:shop.summary is screens',
    'semantic:card is placed in both atom and molecule',
  ])
  const check = checkGraph('shop', indexGraph(shop()), { today: '2026-10-15', methods: [profile] })
  assert.equal(check.findings.filter((item) => item.kind === 'invalid-graph').length, 3)
  assert.equal(compareToBaseline([check], undefined).passed, false)
})

test('the gate: methodology findings are advisory, and without a profile none run', () => {
  const graph = indexGraph(shop())
  const without = checkGraph('shop', graph, { today: '2026-10-15' })
  assert.equal(without.findings.some((item) => ['no-tier', 'tier-composition', 'token-tier'].includes(item.kind)), false)
  assert.equal(without.measures.some((item) => item.check.includes('tier')), false)

  const profile = atomic([{ tier: 'molecule', ids: ['semantic:card', 'target:shop.offer'], declaredBy: design }])
  const check = checkGraph('shop', graph, { today: '2026-10-15', methods: [profile, tokenTiers()] })
  const kinds = new Set(check.findings.map((item) => item.kind))
  for (const kind of ['no-tier', 'tier-composition', 'token-tier'] as const) assert.ok(kinds.has(kind), kind)
  const methodKinds = ['no-tier', 'tier-composition', 'token-tier']
  const report = compareToBaseline([check], undefined)
  assert.deepEqual(report.fresh.filter((item) => methodKinds.includes(item.kind)), [])
  assert.equal(report.advisory.filter((item) => item.kind === 'tier-composition').length, 1)
  assert.deepEqual(check.measures.find((item) => item.check === 'Token tiers: token reads past their tier'), { graph: 'shop', check: 'Token tiers: token reads past their tier', found: 2, of: 4 })
  // A team can make a rule blocking, as with any finding.
  assert.deepEqual(compareToBaseline([check], undefined, ['tier-composition']).fresh.map((item) => item.subjectId), ['target:shop.offer'])
})

test('the report speaks the profile\'s vocabulary and shows only the rules it has', () => {
  const graph = indexGraph(shop())
  const atomicText = renderMethod(graph, methodCheck(graph, atomic([{ tier: 'molecule', ids: ['semantic:card', 'target:shop.offer'], declaredBy: design }])))
  assert.match(atomicText, /\| molecule \| components \| 2 \| 0 \| Card, Offer tile \|/)
  assert.match(atomicText, /\| template \| screens \| 0 \| 1 \| Summary \|/)
  assert.doesNotMatch(atomicText, /Tokens read past their tier/)
  const tokenText = renderMethod(graph, methodCheck(graph, tokenTiers()))
  assert.doesNotMatch(tokenText, /Composition/)
  assert.match(tokenText, /### Tokens read past their tier: 1/)
})

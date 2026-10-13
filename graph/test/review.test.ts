import assert from 'node:assert/strict'
import { test } from 'node:test'
import { indexGraph, isAnchored, laneFor, resolveAnchor, validateGraph, type Actor, type Annotation, type DraftChoice, type GraphDocument, type Line, type ObservedElement, type WorkRequest } from '../src/index.ts'
import { decide, edited, example, record } from './helpers.ts'

const errorCodes = (document: unknown) => validateGraph(document).filter((issue) => issue.severity === 'error').map((issue) => issue.code)
const request = (d: GraphDocument, id: string) => record<WorkRequest>(d, id)
const AUTO = 'request:intake.pack.label-clipped'
const BATCH = 'request:orders.receipt-back'
const OWNER = 'request:intake.offline-retry'

test('the review loop example is a valid graph with no warnings', () => {
  assert.deepEqual(validateGraph(example('review-loop')), [])
})

/** Two drafts of a Figma file, the first chosen by a person and the second passed over (D36). */
function withDrafts(d: GraphDocument): GraphDocument {
  const draft = (name: string, status: Line['status']): Line => ({ id: `line:figma.shop.draft.${name}`, kind: 'line', title: `Draft: ${name}`, type: 'design-draft', tool: 'figma', ref: name, base: 'line:figma.shop', head: `${name}-1`, status })
  d.records.push(
    { id: 'line:figma.shop', kind: 'line', title: 'Shop checkout', type: 'main', tool: 'figma', ref: 'shop', head: '100', status: 'open' },
    draft('a', 'open'),
    draft('b', 'abandoned'),
    { id: 'choice:shop.gift-wrap', kind: 'draft-choice', title: 'Chose draft a', base: 'line:figma.shop', chosen: { line: 'line:figma.shop.draft.a', revision: 'a-1' }, over: ['line:figma.shop.draft.b'], rationale: 'Keeps the note beside the wrap choice.', at: '2026-10-12T10:00:00Z', writtenBy: 'actor:person.taymoor' } as DraftChoice,
  )
  return d
}

test('a person choosing between design drafts is valid', () => {
  assert.deepEqual(errorCodes(edited('review-loop', withDrafts)), [])
})

test('a design line from a tool other than Figma records frames and the targets they design', () => {
  assert.deepEqual(errorCodes(edited('review-loop', (d) => {
    d.records.push({ id: 'line:open-design.laundry', kind: 'line', title: 'Laundry', type: 'main', tool: 'open-design', ref: 'laundry', head: '1', status: 'open', frames: [{ node: 'drying-phone-light', name: 'Drying', page: 'drying-home', hash: `sha256:${'0'.repeat(64)}`, designs: ['target:laundry.intake.pack'] }] } as Line)
  })), [])
})

const cases: [string, (d: GraphDocument) => void, string][] = [
  ['an agent choosing between drafts', (d) => { record(withDrafts(d), 'choice:shop.gift-wrap').writtenBy = 'actor:agent.claude-code.taymoor' }, 'agent-decision'],
  ['a passed-over draft left open', (d) => { record<Line>(withDrafts(d), 'line:figma.shop.draft.b').status = 'open' }, 'draft-choice'],
  ['choosing a line that is not a draft of the base', (d) => { record<DraftChoice>(withDrafts(d), 'choice:shop.gift-wrap').chosen.line = 'line:git.fix-intake-label' }, 'draft-choice'],
  ['an agent acting for nobody', (d) => { delete record(d, 'actor:agent.claude-code.taymoor').delegatedBy }, 'agent-delegation'],
  ['an agent acting for another agent', (d) => {
    d.records.push({ id: 'actor:agent.helper', kind: 'actor', title: 'Helper', type: 'agent', handle: 'helper', delegatedBy: 'actor:agent.claude-code.taymoor' } as Actor)
  }, 'agent-delegation'],
  ['a person who claims a delegation', (d) => { record(d, 'actor:person.taymoor').delegatedBy = 'actor:person.laundry-design' }, 'agent-delegation'],
  ['a branch with no base line', (d) => { delete record(d, 'line:git.fix-intake-label').base }, 'line-base'],
  ['main with a base line', (d) => { record(d, 'line:git.main').base = 'line:git.fix-intake-label' }, 'line-base'],
  ['frames on a code line', (d) => { record<Line>(d, 'line:git.main').frames = [{ node: 'a', name: 'A', page: 'P', hash: `sha256:${'0'.repeat(64)}` }] }, 'line-frames'],
  ['a design frame that designs something other than a target', (d) => {
    d.records.push({ id: 'line:open-design.laundry', kind: 'line', title: 'Laundry', type: 'main', tool: 'open-design', ref: 'laundry', head: '1', status: 'open', frames: [{ node: 'a', name: 'A', page: 'P', hash: `sha256:${'0'.repeat(64)}`, designs: ['line:git.main'] }] } as Line)
  }, 'shape'],
  ['a merged line with no merge revision', (d) => { record(d, 'line:git.fix-intake-label').status = 'merged' }, 'line-merge'],
  ['an annotation on a line that is not in the graph', (d) => { record<Annotation>(d, 'annotation:intake.offline-branch').seenOn.line = 'line:git.gone' }, 'dangling-reference'],
  ['an annotation written by someone who is not an actor', (d) => { record(d, 'annotation:intake.offline-branch').writtenBy = 'line:git.main' }, 'reference-kind'],
  ['a path anchor that leaves out the screen it starts from', (d) => { record<Annotation>(d, 'annotation:intake.offline-branch').anchor!.targetIds = [] }, 'edge-anchor'],
  ['a rectangle outside the capture', (d) => { record<Annotation>(d, 'annotation:intake.pack.label-clipped').anchor!.rect!.width = 1.5 }, 'shape'],
  ['a capture with no content hash', (d) => { record<Annotation>(d, 'annotation:intake.pack.label-clipped').capture!.sha256 = 'shot.png' }, 'shape'],
  ['evidence written by an agent', (d) => { record(d, 'evidence:recapture.label-clipped.2222222').writtenBy = 'actor:agent.claude-code.taymoor' }, 'agent-evidence'],
  ['a request with no annotations', (d) => { request(d, BATCH).annotationIds = [] }, 'request-annotations'],
  ['a request asked for by an agent', (d) => { request(d, BATCH).requestedBy = 'actor:agent.claude-code.taymoor' }, 'request-requester'],
  ['a status that disagrees with its history', (d) => { request(d, BATCH).status = 'claimed' }, 'request-history'],
  ['a claimed request with no claim', (d) => {
    const r = request(d, BATCH)
    r.status = 'claimed'
    r.history.push({ status: 'claimed', by: 'actor:agent.claude-code.taymoor', at: '2026-10-11T04:00:00Z' })
  }, 'request-claim'],
  ['a fix-ready request with no fix', (d) => {
    const r = request(d, BATCH)
    r.status = 'fix-ready'
    r.history.push({ status: 'fix-ready', by: 'actor:agent.claude-code.taymoor', at: '2026-10-11T04:00:00Z' })
  }, 'request-fix'],
  ['an agent resolving a request', (d) => { request(d, AUTO).history.at(-1)!.by = 'actor:agent.claude-code.taymoor' }, 'agent-resolved'],
  ['an agent accepting its own check', (d) => {
    request(d, AUTO).acceptance = [{ command: 'pnpm test', writtenBy: 'actor:agent.claude-code.taymoor', acceptedBy: 'actor:agent.claude-code.taymoor' }]
  }, 'acceptance-self'],
  ['CIVIC resolving when a check failed', (d) => { request(d, AUTO).fixes[0]!.recapture!.checks[0]!.outcome = 'fail' }, 'auto-lane'],
  ['CIVIC resolving when an anchor was not found', (d) => { request(d, AUTO).fixes[0]!.recapture!.anchors[0]!.outcome = 'not-found' }, 'auto-lane'],
  ['CIVIC resolving outside the Auto lane', (d) => { request(d, AUTO).escalatedTo = 'batch-review' }, 'auto-lane'],
  ['CIVIC resolving an agent-written check nobody accepted', (d) => {
    request(d, AUTO).acceptance[0]!.writtenBy = 'actor:agent.claude-code.taymoor'
  }, 'auto-lane'],
  ['a non-owner signing off a change to behavior', (d) => {
    const r = request(d, OWNER)
    r.status = 'resolved'
    r.history.push({ status: 'resolved', by: 'actor:person.taymoor', at: '2026-10-11T04:00:00Z' })
  }, 'owner-sign-off'],
]

for (const [name, edit, code] of cases) {
  test(`rejects ${name}`, () => {
    const codes = errorCodes(edited('review-loop', edit))
    assert.ok(codes.includes(code), `expected ${code} in ${JSON.stringify(codes)}`)
  })
}

test('rejects an agent resolving a contract conflict', () => {
  const codes = errorCodes(edited('fluent-button', (d) => {
    d.records.push(
      { id: 'actor:person.taymoor', kind: 'actor', title: 'Taymoor', type: 'person', handle: 'taymoor' } as Actor,
      { id: 'actor:agent.claude-code.taymoor', kind: 'actor', title: 'Claude Code for Taymoor', type: 'agent', handle: 'claude-code', delegatedBy: 'actor:person.taymoor' } as Actor,
    )
    decide(d, 'conflict:button.android.neutral-default', { evidenceIds: ['evidence:compose-source.button.styles'], writtenBy: 'actor:agent.claude-code.taymoor' })
  }))
  assert.ok(codes.includes('agent-decision'), `expected agent-decision in ${JSON.stringify(codes)}`)
})

test('rejects an annotation with no anchor and no capture', () => {
  const codes = errorCodes(edited('review-loop', (d) => {
    const annotation = record<Annotation>(d, 'annotation:intake.offline-branch')
    delete annotation.anchor
    delete annotation.capture
  }))
  assert.ok(codes.includes('annotation-empty'), `expected annotation-empty in ${JSON.stringify(codes)}`)
})

test('an owner signs off a change, and a person may resolve a batch-review request', () => {
  assert.deepEqual(errorCodes(edited('review-loop', (d) => {
    const r = request(d, OWNER)
    r.status = 'resolved'
    r.history.push({ status: 'resolved', by: 'actor:person.laundry-design', at: '2026-10-11T04:00:00Z' })
  })), [])
  assert.deepEqual(errorCodes(edited('review-loop', (d) => {
    const r = request(d, BATCH)
    r.status = 'resolved'
    r.history.push({ status: 'resolved', by: 'actor:person.taymoor', at: '2026-10-11T04:00:00Z' })
  })), [])
})

test('on a high-risk target the person who delegated the fix cannot approve it alone', () => {
  const highRisk = (resolver: string) => edited('review-loop', (d) => {
    const r = request(d, AUTO)
    r.risk = 'high'
    r.owners = [{ role: 'design', who: 'taymoor' }, { role: 'design', who: 'laundry-design' }]
    r.history.at(-1)!.by = resolver
  })
  assert.ok(errorCodes(highRisk('actor:person.taymoor')).includes('self-approval'))
  assert.deepEqual(errorCodes(highRisk('actor:person.laundry-design')), [])
})

test('laneFor sends each request to the lane D38 names', () => {
  const document = example('review-loop')
  const graph = indexGraph(document)
  const actors = (id: string) => { const r = graph.get(id); return r?.kind === 'actor' ? r : undefined }
  const anchored = (id: string) => { const r = graph.get(id); return r?.kind === 'annotation' && isAnchored(r.anchor) }
  const lane = (r: WorkRequest) => laneFor(r, actors, anchored)
  const auto = request(document, AUTO)
  assert.equal(lane(auto), 'auto')
  assert.equal(lane(request(document, BATCH)), 'batch-review', 'acceptance that is only a comment goes to batch review')
  assert.equal(lane(request(document, OWNER)), 'owner-sign-off', 'a change to behavior is a Proposal')
  assert.equal(lane({ ...auto, risk: 'high' }), 'owner-sign-off')
  assert.equal(lane({ ...auto, escalatedTo: 'owner-sign-off' }), 'owner-sign-off')
  assert.equal(lane({ ...request(document, OWNER), escalatedTo: 'batch-review' }), 'owner-sign-off', 'escalation never loosens a lane')
  const agentCheck = { command: 'pnpm test', writtenBy: 'actor:agent.claude-code.taymoor' }
  assert.equal(lane({ ...auto, acceptance: [agentCheck] }), 'batch-review', 'an agent does not grade its own work')
  assert.equal(lane({ ...auto, acceptance: [{ ...agentCheck, acceptedBy: 'actor:person.taymoor' }] }), 'auto')
  assert.equal(lane({ ...auto, annotationIds: ['annotation:screenshot.receipt-back'] }), 'batch-review', 'an unanchored screenshot cannot be re-found')
})

test('resolveAnchor finds by stable ID, then exact locator, and never the nearest element', () => {
  const anchor = record<Annotation>(example('review-loop'), 'annotation:intake.pack.label-clipped').anchor!
  const label: ObservedElement = { civicIds: ['target:laundry.intake.pack'], testId: 'pack-color-label', role: 'heading', name: 'Pick a colour' }
  const moved: ObservedElement = { civicIds: [], testId: 'pack-color-label', role: 'heading', name: 'Pick a colour' }
  const similar: ObservedElement = { civicIds: [], testId: 'pack-colour-label', role: 'heading', name: 'Pick a color' }

  assert.deepEqual(resolveAnchor(anchor, [similar, label]), { outcome: 'found-by-id', matches: [1] })
  assert.deepEqual(resolveAnchor(anchor, [similar, moved]), { outcome: 'found-by-locator', matches: [1] })
  assert.deepEqual(resolveAnchor(anchor, [similar]), { outcome: 'not-found', matches: [] }, 'a near miss is not a match')
  assert.deepEqual(resolveAnchor({ ...anchor, targetIds: [], locator: { role: 'heading', name: 'Pick a colour' } }, [moved, { ...moved, testId: 'x' }]), { outcome: 'not-found', matches: [] }, 'an ambiguous locator is not a match')
  assert.deepEqual(resolveAnchor(undefined, [label]), { outcome: 'unanchored', matches: [] })
  assert.deepEqual(resolveAnchor({ targetIds: [], rect: { x: 0, y: 0, width: 1, height: 1 } }, [label]), { outcome: 'unanchored', matches: [] }, 'a rectangle alone never finds anything')
})

test('resolveAnchor finds a design-draft frame by its Figma node ID only', () => {
  const frame = { targetIds: [], locator: { figmaNode: '40:20' } }
  const gift: ObservedElement = { civicIds: [], figmaNode: '40:20', name: 'Gift options' }
  const renamed: ObservedElement = { civicIds: [], figmaNode: '40:21', name: 'Gift options' }
  assert.ok(isAnchored(frame))
  assert.deepEqual(resolveAnchor(frame, [renamed, gift]), { outcome: 'found-by-locator', matches: [1] })
  assert.deepEqual(resolveAnchor(frame, [renamed]), { outcome: 'not-found', matches: [] }, 'a frame with the same name is not the same frame')
})

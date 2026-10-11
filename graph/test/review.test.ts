import assert from 'node:assert/strict'
import { test } from 'node:test'
import { indexGraph, isAnchored, laneFor, resolveAnchor, validateGraph, type Actor, type Annotation, type GraphDocument, type ObservedElement, type WorkRequest } from '../src/index.ts'
import { decide, edited, example, record } from './helpers.ts'

const errorCodes = (document: unknown) => validateGraph(document).filter((issue) => issue.severity === 'error').map((issue) => issue.code)
const request = (d: GraphDocument, id: string) => record<WorkRequest>(d, id)
const AUTO = 'request:intake.pack.label-clipped'
const BATCH = 'request:orders.receipt-back'
const OWNER = 'request:intake.offline-retry'

test('the review loop example is a valid graph with no warnings', () => {
  assert.deepEqual(validateGraph(example('review-loop')), [])
})

const cases: [string, (d: GraphDocument) => void, string][] = [
  ['an agent acting for nobody', (d) => { delete record(d, 'actor:agent.claude-code.taymoor').delegatedBy }, 'agent-delegation'],
  ['an agent acting for another agent', (d) => {
    d.records.push({ id: 'actor:agent.helper', kind: 'actor', title: 'Helper', type: 'agent', handle: 'helper', delegatedBy: 'actor:agent.claude-code.taymoor' } as Actor)
  }, 'agent-delegation'],
  ['a person who claims a delegation', (d) => { record(d, 'actor:person.taymoor').delegatedBy = 'actor:person.laundry-design' }, 'agent-delegation'],
  ['a branch with no base line', (d) => { delete record(d, 'line:git.fix-intake-label').base }, 'line-base'],
  ['main with a base line', (d) => { record(d, 'line:git.main').base = 'line:git.fix-intake-label' }, 'line-base'],
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

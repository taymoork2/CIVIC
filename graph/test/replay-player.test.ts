import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { describeGesture, indexGraph, readTape, renderPortal, renderReplayPage, storiesIn, type Evidence, type GraphDocument } from '../src/index.ts'

// The replay player (decision 0013 after 0009): a recorded run's tape played back as a page.
// The fixture is a synthetic tape in the journey engine's recording shape: a click with a
// write, a viewport change, going offline, an input, and a link back with a write made as a
// switched account.

const tapeText = readFileSync(new URL('fixtures/recorded-run.tape.json', import.meta.url), 'utf8')
const tape = readTape(JSON.parse(tapeText))
const sha = createHash('sha256').update(tapeText).digest('hex')

test('each gesture reads as what a person did', () => {
  assert.deepEqual(tape.steps.map((step) => describeGesture(step.gesture)), [
    'Clicked button “Start drying”',
    'Changed the viewport to 320×658, dark, text ×2',
    'Went offline',
    'Entered “Towels” in input “Load name”',
    'Clicked link “Back to Laundry” (2 of 2)',
  ])
  assert.throws(() => readTape({ version: 2 }), /not a recorded run/)
})

test('the page lists every step with its route, view, fields and writes, and marks where a replay diverged', () => {
  const page = renderReplayPage({ sha, tape, title: 'Drying', outcome: 'fail', divergedAt: 4, head: 'a'.repeat(40) })
  assert.equal(page.match(/<li class="step/g)?.length, 5)
  assert.match(page, /Replayed at aaaaaaaaaaaa: diverged at step 4\./)
  assert.match(page, /<li class="step diverged" data-step="4">/)
  assert.match(page, /Showing: <strong>Drying<\/strong>, <strong>Load 1<\/strong>/)
  assert.match(page, /Wrote: <code>loads:rename<\/code> as family-parent/)
  assert.match(page, /Nothing runs again here\./)
  assert.doesNotMatch(renderReplayPage({ sha, tape, title: 'Drying', outcome: 'pass' }), /class="step diverged"/)
})

test('a story step whose screen a replayed tape starts from gets a player for it, when the portal has the tape', () => {
  const document = JSON.parse(readFileSync(new URL('../../projects/laundry/out/graph.json', import.meta.url), 'utf8')) as GraphDocument
  const replay: Evidence = {
    id: `evidence:runtime.${sha.slice(0, 16)}`,
    kind: 'evidence',
    title: 'Recorded run from route.drying.washer-queued, 5 steps',
    subjectIds: ['target:laundry.route.drying.washer-queued'],
    tier: 'working-preview',
    method: 'runtime',
    platform: 'web',
    outcome: 'pass',
    finding: 'Every step verified on replay.',
    capturedAt: '2026-10-15T00:00:00.000Z',
    source: { tool: 'journey-engine', importer: 'replay', revision: 'b'.repeat(40), contentHash: `sha256:${sha}` },
  }
  document.records.push(replay)
  const graph = indexGraph(document)
  const stories = storiesIn(graph, 'laundry')
  const without = renderPortal(graph, stories, { title: 'Laundry' })
  assert.ok(![...without.keys()].some((path) => path.startsWith('replays/')))
  const pages = renderPortal(graph, stories, { title: 'Laundry', tapes: new Map([[sha, tape]]) })
  assert.ok(pages.has(`replays/${sha}.html`))
  const drying = pages.get('stories/laundry-journey-drying.html')!
  const frames = JSON.parse(/frames="([^"]+)"/.exec(drying)![1]!.replaceAll('&quot;', '"').replaceAll('&amp;', '&')) as { src: string; label: string }[]
  assert.deepEqual(frames.map((frame) => [frame.src, frame.label]), [[`../replays/${sha}.html`, 'Play the recorded run (5 steps)']])
})

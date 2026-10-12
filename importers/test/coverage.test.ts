import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateGraph, type CollaborationRecord, type Evidence } from '../../graph/src/index.ts'
import { assemble, fragment, readCoverageContract, type CoverageContract } from '../src/index.ts'

// The journey engine's coverage contract (roadmap step 3): an expectation the app can't yet
// show and prove with a passing run is an open Coverage gap record.

const owner = { role: 'qa', who: 'tasks-qa' } as const
const screen = (id: string) => ({ id: `target:tasks.${id}`, kind: 'target' as const, title: id, scale: 'screen' as const, presence: 'expected' as const, owners: [owner] })
const run = (subject: string, outcome: Evidence['outcome']): Evidence => ({
  id: `evidence:run.${subject}.${outcome}`,
  kind: 'evidence',
  title: `${subject} ${outcome}`,
  subjectIds: [`target:tasks.${subject}`],
  tier: 'automated',
  method: 'playwright',
  platform: 'web',
  outcome,
  capturedAt: '2026-10-12T00:00:00Z',
  source: { tool: 'playwright', importer: 'playwright-report', revision: 'abc1234' },
})

const contract: CoverageContract = {
  version: 4,
  targets: [
    { id: 'journey.add-task', title: 'Add a task', kind: 'journey', scenarios: ['tasks.list', 'tasks.new'] },
    { id: 'journey.archive', title: 'Archive a task', kind: 'journey', scenarios: ['tasks.list', 'tasks.archive', 'tasks.archived'] },
    { id: 'screen.share', title: 'Share a list', kind: 'screen', component: 'src/share.tsx#ShareSheet', scenarios: [] },
    { id: 'planned.reminders', title: 'Reminders', kind: 'interaction', scenarios: [] },
  ],
}

function read() {
  const screens = ['tasks.list', 'tasks.new', 'tasks.archive'].map(screen)
  const evidence = [run('tasks.list', 'pass'), run('tasks.new', 'pass'), run('tasks.archive', 'fail')]
  const coverage = readCoverageContract(contract, JSON.stringify(contract), {
    prefix: 'tasks', platform: 'web', owners: [owner], raisedBy: owner, at: '2026-10-12T00:00:00Z', path: 'coverage.json', revision: 'abc1234',
    targetIds: new Set(screens.map((item) => item.id)), evidence,
  })
  return { coverage, graph: assemble(fragment(screens), fragment(evidence), coverage) }
}

test('an expectation shown and proven by passing runs raises nothing', () => {
  const ids = read().coverage.records.map((record) => record.id)
  assert.ok(ids.includes('target:tasks.expectation.journey.add-task'))
  assert.ok(!ids.some((id) => id.startsWith('collab:') && id.includes('add-task')))
})

test('each expectation the app cannot show and prove is an open, owned coverage gap', () => {
  const gaps = read().coverage.records.filter((record): record is CollaborationRecord => record.kind === 'collaboration')
  assert.deepEqual(gaps.map((gap) => [gap.id, gap.subjectIds, gap.summary, gap.perspectives]), [
    ['collab:coverage-gap.tasks.journey-archive', ['target:tasks.expectation.journey.archive', 'target:tasks.tasks.archive'],
      'Expected scenario not in the review index: `tasks.archived`. No passing run covers `tasks.archive`.', ['qa']],
    ['collab:coverage-gap.tasks.screen-share', ['target:tasks.expectation.screen.share'],
      '`src/share.tsx#ShareSheet` exists, but no scenario shows it, so no run can prove it.', ['engineering', 'qa']],
    ['collab:coverage-gap.tasks.planned-reminders', ['target:tasks.expectation.planned.reminders'],
      'Declared, but nothing shows it yet: no scenario and no code.', ['engineering', 'qa']],
  ])
  assert.ok(gaps.every((gap) => gap.type === 'coverage-gap' && gap.status === 'open' && gap.source?.importer === 'coverage-contract'))
})

test('the imported gaps are valid graph records', () => {
  assert.deepEqual(validateGraph(read().graph).filter((issue) => issue.severity === 'error'), [])
})

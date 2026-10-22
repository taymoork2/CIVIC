import { checkExpectations, renderExpectationFailures, type Evidence, type ExpectationsFile, type Platform, type RecordedTape } from '../../graph/src/index.ts'

/**
 * A replay of a recorded run, as the journey engine's review server keeps it (decision 0009):
 * the tape by content hash, the commit and source it ran at, and whether every step verified
 * or the step where it diverged.
 */
export interface ReplayRecord {
  schema: 'civic.replay/0'
  project: string
  /** The scenario the run starts from, from the tape's seed. */
  scenario: string
  head: string
  source: string
  /** sha256 of the tape replayed. */
  tape: string
  steps: number
  outcome: 'pass' | 'fail'
  divergedAt?: number
  message?: string
  replayedAt: string
}

export interface ReplayOptions {
  /** The same ID segment the journey index used, so a run meets its scenario's target. */
  prefix: string
  platform: Platform
  /** Where the replays were read from. */
  path?: string
  /** The scenario targets the graph has. A replay whose scenario isn't one of them is refused. */
  targetIds: ReadonlySet<string>
  /**
   * What each scenario's journey expects after its steps (decision 0017), and the tapes to read
   * them against, by sha256. A replay that verified fails if its tape misses an expectation.
   */
  expectations?: ExpectationsFile
  tapes?: ReadonlyMap<string, RecordedTape>
}

/**
 * Reads replays as run evidence: one per tape, from its latest replay, about the scenario the
 * run starts from. It passes when every step verified and fails at the step that diverged.
 * Its revision is the commit it was replayed at, so the freshness rule can find it stale.
 * Deterministic, with no model calls.
 */
export function readReplays(replays: readonly ReplayRecord[], options: ReplayOptions): Evidence[] {
  const latest = new Map<string, ReplayRecord>()
  for (const replay of replays) {
    if (replay?.schema !== 'civic.replay/0' || !/^[0-9a-f]{64}$/.test(replay.tape) || !/^[0-9a-f]{40}$/.test(replay.head) || !['pass', 'fail'].includes(replay.outcome)) {
      throw new Error('That is not a civic.replay/0 record: it needs the tape hash, the commit and an outcome.')
    }
    const seen = latest.get(replay.tape)
    if (!seen || seen.replayedAt < replay.replayedAt) latest.set(replay.tape, replay)
  }
  return [...latest.values()]
    .sort((a, b) => a.tape.localeCompare(b.tape))
    .map((replay): Evidence => {
      const subject = `target:${options.prefix}.${replay.scenario}`
      if (!options.targetIds.has(subject)) throw new Error(`The replay of tape ${replay.tape.slice(0, 12)} starts from ${replay.scenario}, which isn't a screen in this graph.`)
      const expected = options.expectations?.scenarios.find((entry) => entry.scenario === replay.scenario)
      const tape = options.tapes?.get(replay.tape)
      // An expectation is read from the tape, so it can't be checked without it; say so rather than pass quietly.
      const failures = expected && tape ? checkExpectations(tape, expected) : []
      const unchecked = expected && !tape ? ' Its journey\'s expectations were not checked: the tape is not on hand.' : ''
      const passed = replay.outcome === 'pass' && failures.length === 0
      return {
        id: `evidence:runtime.${replay.tape.slice(0, 16)}`,
        kind: 'evidence',
        title: `Recorded run from ${replay.scenario}, ${replay.steps} step${replay.steps === 1 ? '' : 's'}`,
        subjectIds: [subject],
        tier: 'working-preview',
        method: 'runtime',
        platform: options.platform,
        outcome: passed ? 'pass' : 'fail',
        finding: replay.outcome === 'fail'
          ? `Replay diverged at step ${replay.divergedAt} of ${replay.steps}, at source ${replay.source.slice(0, 12)}.`
          : `Every step verified on replay, at source ${replay.source.slice(0, 12)}.${failures.length > 0 ? ` But ${failures.length} expectation${failures.length === 1 ? '' : 's'} of the journey did not hold:\n${renderExpectationFailures(failures)}` : expected && tape ? ` Every expectation of the journey held (${expected.steps.reduce((total, step) => total + step.expect.length, 0)}).` : unchecked}`,
        capturedAt: replay.replayedAt,
        source: { tool: 'journey-engine', importer: 'replay', revision: replay.head, contentHash: `sha256:${replay.tape}`, ...(options.path ? { path: options.path } : {}) },
      }
    })
}

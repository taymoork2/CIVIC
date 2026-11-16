const verifiedSteps = replay => replay.outcome === 'pass' ? replay.steps : replay.outcome === 'fail' && Number.isInteger(replay.divergedAt) && replay.divergedAt >= 1 && replay.divergedAt <= replay.steps ? replay.divergedAt - 1 : 0

const matchesTape = (tape, replay, project, source) => tape && tape.project === project && tape.source === source && tape.steps.length === replay.steps && tape.seed?.context?.scenario === replay.scenario

const refused = operation => operation.error || operation.result?.status >= 400

const reachedOperation = (operations, name) => {
  const actual = name.split('/')
  return operations.find(row => row.kind === 'route' && row.id.split('/').length === actual.length && row.id.split('/').every((part, index) => part.startsWith(':') ? Boolean(actual[index]) : part === actual[index]))
}

/** Count only the verified prefix of the latest replay of each content-addressed tape. */
export function backendCoverage(operations, tapes, replays, { project, source, journeys }) {
  const reached = new Map(operations.map(operation => [operation.id, new Set()]))
  const latest = new Map()
  for (const replay of replays) {
    if (replay.project !== project || replay.source !== source || replay.schema !== 'civic.replay/0') continue
    if (!latest.has(replay.tape) || latest.get(replay.tape).replayedAt < replay.replayedAt) latest.set(replay.tape, replay)
  }
  for (const replay of latest.values()) {
    const tape = tapes.get(replay.tape)
    if (!matchesTape(tape, replay, project, source)) continue
    const matching = journeys.filter(row => row.scenarios.includes(replay.scenario))
    if (!matching.length || !Number.isSafeInteger(replay.steps) || replay.steps < 0) continue
    const count = verifiedSteps(replay)
    for (const step of tape.steps.slice(0, count)) for (const operation of step.operations) {
      if (refused(operation)) continue
      let target = reached.get(operation.name)
      if (!target) {
        const route = reachedOperation(operations, operation.name)
        if (route) target = reached.get(route.id)
      }
      for (const journey of matching) target?.add(journey.id)
    }
  }
  const rows = operations.map(operation => ({ ...operation, reachedBy: [...reached.get(operation.id)].toSorted() })).toSorted((a, b) => a.id.localeCompare(b.id))
  return { operations: rows, unreached: rows.filter(row => !row.reachedBy.length).map(row => row.id) }
}

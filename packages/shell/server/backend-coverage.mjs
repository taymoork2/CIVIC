const verifiedSteps = replay => replay.outcome === 'pass' ? replay.steps : replay.outcome === 'fail' && Number.isInteger(replay.divergedAt) && replay.divergedAt >= 1 && replay.divergedAt <= replay.steps ? replay.divergedAt - 1 : 0

const matchesTape = (tape, replay, project, source) => tape && tape.project === project && tape.source === source && tape.steps.length === replay.steps && tape.seed?.context?.scenario === replay.scenario

const refused = operation => operation.error || operation.result?.status >= 400
const httpName = name => name.replace(/^(?<method>[A-Z]+):(?=\/)/u, '$<method> ').split(/[?#]/u)[0]

function recordOutside(operations, operation, outside) {
  if (/^(?:GET|PUT|POST|DELETE|OPTIONS|HEAD|PATCH|TRACE)[ :]/u.test(operation.name) && !reachedOperation(operations, operation.name)) outside.add(httpName(operation.name))
}

function reachedTarget(operations, reached, name) {
  return reached.get(name) ?? reached.get(reachedOperation(operations, name)?.id)
}

function matchesPath(pattern, actual) {
  if (!pattern.length) return !actual.length
  const [part, ...rest] = pattern
  if (part.startsWith(':') && /[*+]$/u.test(part)) {
    const minimum = part.endsWith('+') ? 1 : 0
    for (let count = minimum; count <= actual.length; count++) if (matchesPath(rest, actual.slice(count))) return true
    return false
  }
  if (part.startsWith(':') && part.endsWith('?') && matchesPath(rest, actual)) return true
  return Boolean(actual.length && (part.startsWith(':') ? actual[0] : part === actual[0])) && matchesPath(rest, actual.slice(1))
}

const reachedOperation = (operations, name) => {
  const actual = httpName(name).split('/')
  // An ALL route accepts any recorded method.
  const same = row => {
    const [method, ...path] = row.id.replace(/^(?<method>[A-Z]+):(?=\/)/u, '$<method> ').split('/')
    return (method === actual[0] || method === 'ALL ' && /^[A-Z]+ $/u.test(actual[0])) && matchesPath(path, actual.slice(1))
  }
  return operations.find(row => row.kind === 'route' && httpName(row.id) === httpName(name)) ?? operations.find(row => row.kind === 'route' && same(row))
}

/** Count only the verified prefix of the latest replay of each content-addressed tape. */
export function backendCoverage(operations, tapes, replays, { project, source, journeys, contracts = false }) {
  const reached = new Map(operations.map(operation => [operation.id, new Set()]))
  const outsideContract = new Set()
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
      if (contracts) recordOutside(operations, operation, outsideContract)
      if (refused(operation)) continue
      const target = reachedTarget(operations, reached, operation.name)
      for (const journey of matching) target?.add(journey.id)
    }
  }
  const rows = operations.map(operation => ({ ...operation, reachedBy: [...reached.get(operation.id)].toSorted() })).toSorted((a, b) => a.id.localeCompare(b.id))
  const report = { operations: rows, unreached: rows.filter(row => !row.reachedBy.length && row.visibility !== 'internal').map(row => row.id), unreachedInternal: rows.filter(row => !row.reachedBy.length && row.visibility === 'internal').map(row => row.id) }
  if (contracts) report.outsideContract = [...outsideContract].toSorted()
  return report
}

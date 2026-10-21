import { createHash } from 'node:crypto'
import { readFile, writeFile, rename, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }) }
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const secret = /password|secret|token|credential|one.time.code|credit.card/i
const text = value => typeof value === 'string' && value.length <= 200 && !secret.test(value)
const key = control => JSON.stringify([control.tag, String(control.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 200), control.index])
export const stateId = state => hash(state)

/** Only control descriptions enter discovery; input values and page/transcript bodies never do. */
export function checkedState(input, metadata) {
  if (!input || Object.keys(input).some(key => !['scenario', 'persona', 'role', 'condition', 'viewport', 'controls', 'landmarks', 'truncated'].includes(key)) || !text(input.scenario) || !input.scenario) fail('Invalid observed state')
  for (const [field, presets] of [['persona', 'personas'], ['role', 'roles'], ['condition', 'conditions']]) if (!metadata.project[presets].some(row => row.id === input[field])) fail('Unknown discovery context')
  const viewport = input.viewport
  if (!viewport || Object.keys(viewport).some(key => !['width', 'height'].includes(key)) || !Number.isInteger(viewport.width) || viewport.width < 200 || viewport.width > 1920 || !Number.isInteger(viewport.height) || viewport.height < 200 || viewport.height > 1600) fail('Invalid discovery viewport')
  if (!Array.isArray(input.controls) || input.controls.length > 300 || !Array.isArray(input.landmarks) || input.landmarks.length > 40 || input.landmarks.some(row => !text(row)) || typeof input.truncated !== 'boolean') fail('Invalid discovery inventory')
  const controls = input.controls.map(row => {
    if (!row || Object.keys(row).some(key => !['tag', 'role', 'name', 'index', 'count', 'disabled', 'destination', 'link', 'expanded', 'pressed', 'selected', 'checked'].includes(key)) || !/^[a-z][a-z0-9-]{0,39}$/.test(row.tag ?? '') || !/^[a-z][a-z0-9-]{0,39}$/.test(row.role ?? '') || !text(row.name) || !Number.isInteger(row.index) || !Number.isInteger(row.count) || row.index < 0 || row.count <= row.index || row.count > 1000 || typeof row.disabled !== 'boolean' || row.destination !== undefined && (!text(row.destination) || metadata.scenarios && !metadata.scenarios.some(scenario => scenario.id === row.destination)) || row.link !== undefined && !['internal', 'external', 'unmapped'].includes(row.link) || ['expanded', 'pressed', 'selected', 'checked'].some(field => row[field] !== undefined && !['true', 'false', 'mixed'].includes(row[field]))) fail('Invalid or sensitive discovered control')
    return Object.fromEntries(['tag', 'role', 'name', 'index', 'count', 'disabled', 'destination', 'link', 'expanded', 'pressed', 'selected', 'checked'].filter(field => row[field] !== undefined).map(field => [field, row[field]]))
  })
  if (new Set(controls.map(key)).size !== controls.length) fail('Duplicate control identity')
  return { scenario: input.scenario, persona: input.persona, role: input.role, condition: input.condition, viewport: { width: viewport.width, height: viewport.height }, controls, landmarks: input.landmarks, truncated: input.truncated }
}

/** Registration, observed execution and passing replay remain separate claims. */
export function interactionReport(metadata, observations, runs, replays) {
  const source = metadata.revision.source, states = new Map(), executions = new Map()
  const admit = state => { const id = stateId(state); if (!states.has(id)) states.set(id, state); return id }
  for (const row of observations) if (row.source === source) admit(row.state)
  for (const { id, tape } of runs) {
    if (tape.project !== metadata.project.key || tape.source !== source) continue
    const passed = metadata.project.mode !== 'live-read-only' && replays.some(replay => replay.project === tape.project && replay.source === source && replay.outcome === 'pass' && replay.tape === hash(tape) && replay.steps === tape.steps.length)
    for (const [index, step] of tape.steps.entries()) {
      if (!step.discovery || !['click', 'input', 'key'].includes(step.gesture.kind)) continue
      const before = checkedState(step.discovery.before, metadata), after = checkedState(step.discovery.after, metadata)
      if (['persona', 'role', 'condition'].some(field => before[field] !== tape.seed?.context?.[field] || after[field] !== tape.seed?.context?.[field])) continue
      const from = admit(before), to = admit(after), control = before.controls.find(control => key(control) === key(step.gesture.target ?? {}) && control.count === step.gesture.target?.count)
      if (!control || control.disabled) continue
      const identity = from + ':' + key(control), rows = executions.get(identity) ?? []
      rows.push({ run: id, step: index + 1, to, failed: step.operations.some(operation => operation.error), verified: passed && !step.operations.some(operation => operation.error) })
      executions.set(identity, rows)
    }
  }
  const targets = metadata.coverage?.targets ?? []
  const rows = [...states].map(([id, state]) => {
    const scenario = metadata.scenarios.find(row => row.id === state.scenario)
    const declared = targets.some(target => target.kind === 'screen' && target.state === id && target.scenarios.includes(state.scenario))
    const controls = state.controls.map(control => {
      const evidence = executions.get(id + ':' + key(control)) ?? []
      const binding = targets.some(target => target.kind === 'interaction' && target.scenarios.includes(state.scenario) && (!target.state || target.state === id) && target.control?.tag === control.tag && target.control?.name === control.name && (target.control.index === undefined || target.control.index === control.index))
      const navigation = Boolean(control.destination && scenario?.edges?.some(edge => edge.destination === control.destination))
      const execution = evidence.some(row => !row.failed) ? 'recorded' : evidence.length ? 'failed' : 'unrecorded'
      const verified = evidence.some(row => row.verified)
      const gaps = [...(!control.name ? ['Unnamed control'] : []), ...(!binding && !navigation ? ['No interaction scenario'] : []), ...(control.link === 'unmapped' ? ['Unmapped destination'] : []), ...(control.disabled ? ['Disabled in observed state'] : []), ...(execution === 'unrecorded' ? ['No recorded execution'] : execution === 'failed' ? ['Recorded operation failed'] : []), ...(!verified ? ['No passing replay'] : [])]
      return { ...control, declared: binding || navigation, execution, verified, gaps, evidence }
    })
    return { id, ...state, label: scenario?.label ?? 'Unmapped screen', declared, gaps: [...(!scenario ? ['No screen scenario'] : []), ...(!declared ? ['No scenario for this observed state'] : []), ...(state.truncated ? ['Control scan limit reached'] : [])], controls }
  })
  const unvisited = metadata.scenarios.filter(scenario => !rows.some(state => state.scenario === scenario.id)).map(scenario => ({ id: scenario.id, label: scenario.label }))
  const unseenPaths = metadata.scenarios.flatMap(scenario => (scenario.edges ?? []).filter(edge => !rows.some(state => state.scenario === scenario.id && state.controls.some(control => control.destination === edge.destination))).map(edge => ({ from: scenario.id, to: edge.destination, action: edge.action })))
  const controls = rows.flatMap(row => row.controls)
  return { states: rows, unvisited, unseenPaths, stale: observations.filter(row => row.source !== source).length, summary: { states: rows.length, controls: controls.length, missingScenarios: controls.filter(row => !row.declared).length, unrecorded: controls.filter(row => row.execution === 'unrecorded').length, verified: controls.filter(row => row.verified).length }, limits: ['Inventory covers observed rendered controls and states, not every possible app state.', 'Names and control attributes are captured; input values and full page/transcript snapshots are excluded from discovery.', 'A recorded gesture can be a no-op or refused write. It is not a success assertion. A passing replay checks its recording, not every product acceptance criterion.', 'Automatic exploration opens bounded menu, dialog, disclosure and tab branches. Unknown, destructive and submit actions require authored isolated checks.', ...(metadata.project.mode === 'live-read-only' ? ['Live Example writes and replay are blocked. Write-dependent paths remain gaps until exercised in an isolated project.'] : ['Authored behavior checks cover only their stated assertions. Provider execution, external services and physical devices are not exercised.'])] }
}

export function interactionStore({ dataDir, metadata }) {
  const path = join(dataDir, 'interaction-states.json')
  let queue = Promise.resolve()
  const read = async () => {
    try { const value = JSON.parse(await readFile(path, 'utf8')); if (value.version !== 1 || !Array.isArray(value.states)) fail('Interaction store unreadable', 503); return value.states }
    catch (error) { if (error.code === 'ENOENT') return []; throw error }
  }
  return {
    observe(input) {
      const operation = queue.then(async () => {
        if (input?.source !== metadata.revision.source) fail('Discovery source changed. Reload the preview.', 409)
        const state = checkedState(input.state, metadata), states = await read(), id = stateId(state)
        if (!states.some(row => row.source === input.source && stateId(row.state) === id)) {
          if (states.length >= 500) fail('Discovery state limit reached. Export the inventory before starting a new store.', 409)
          states.push({ source: input.source, state })
          await writeFile(path + '.tmp', JSON.stringify({ version: 1, states }), { mode: 0o600 }); await rename(path + '.tmp', path)
        }
        return { id }
      })
      queue = operation.catch(() => {})
      return operation
    },
    async report() {
      await queue
      const files = async directory => { try { const names = (await readdir(join(dataDir, directory))).filter(file => /^[0-9a-f-]{36}\.json$/.test(file)); if (names.length > 1000) fail('Recording scan limit reached', 503); return Promise.all(names.map(async file => ({ id: file.slice(0, -5), value: JSON.parse(await readFile(join(dataDir, directory, file), 'utf8')) }))) } catch (error) { if (error.code === 'ENOENT') return []; throw error } }
      const [observations, runs, replays] = await Promise.all([read(), files('runs'), files('replays')])
      let behavior
      try { behavior = JSON.parse(await readFile(join(dataDir, 'behavior-checks.json'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
      return { ...interactionReport(metadata, observations, runs.map(row => ({ id: row.id, tape: row.value })), replays.map(row => row.value)), behavior: behavior?.source === metadata.revision.source ? behavior : null }
    },
  }
}

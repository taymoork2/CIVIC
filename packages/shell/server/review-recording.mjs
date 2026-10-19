import { checkedState } from './review-interactions.mjs'

const refuse = (message) => { throw Object.assign(Error(message), { status: 400 }) }
const sensitive = /password|secret|token|credential|one.time.code|credit.card/i
export function sensitivePayload(value, depth = 0) {
  if (depth > 40) return true
  return Boolean(value && typeof value === 'object' && Object.entries(value).some(([key, child]) => sensitive.test(key) || sensitivePayload(child, depth + 1)))
}
/** The run's own recorded steps have fixed shapes; an adapter's other commands are its own. */
function runStep(name, value) {
  if (name === 'viewport') return Boolean(value) && typeof value === 'object' && Number.isInteger(value.width) && value.width >= 200 && value.width <= 1920 && Number.isInteger(value.height) && value.height >= 200 && value.height <= 1600 && ['light', 'dark'].includes(value.theme) && [1, 2].includes(value.textScale) && (value.preset === undefined || typeof value.preset === 'string' && /^[a-z0-9-]{1,40}$/.test(value.preset)) && Object.keys(value).every((key) => ['width', 'height', 'theme', 'textScale', 'preset'].includes(key))
  if (name === 'identity') return typeof value === 'string' && /^[\w.-]{1,80}$/.test(value)
  if (name === 'connection') return typeof value === 'boolean'
  if (name === 'time') return Number.isInteger(value) && value > 0 && value <= 1440
  if (name === 'applyPending' || name === 'discardPending') return typeof value === 'string' && value.length <= 100
  return true
}
export function checkedRecording(input, project) {
  if (!input || input.version !== 1 || input.project !== project?.key || !/^[0-9a-f]{64}$/.test(input.source) || !Number.isSafeInteger(input.now) || input.now < 0 || typeof input.initialRoute !== 'string' || input.initialRoute.length > 2000 || !Array.isArray(input.steps) || input.steps.length > 1000 || JSON.stringify(input).length > 2_000_000) refuse('Invalid or oversized project recording')
  const config = input.seed?.context
  if (sensitivePayload(input.seed)) refuse('Sensitive or deeply nested recording seed')
  if (!config || typeof config.scenario !== 'string' || !project.personas.some((preset) => preset.id === config.persona) || !project.roles.some((preset) => preset.id === config.role) || !project.conditions.some((preset) => preset.id === config.condition) || !['light', 'dark'].includes(config.theme) || ![1, 2].includes(config.textScale) || !Number.isInteger(config.width) || config.width < 200 || config.width > 1920) refuse('Invalid recording context')
  // Height and preset came later; recordings without them are still valid.
  if (config.height !== undefined && (!Number.isInteger(config.height) || config.height < 200 || config.height > 1600)) refuse('Invalid recording height')
  if (config.preset !== undefined && (typeof config.preset !== 'string' || !/^[a-z0-9-]{1,40}$/.test(config.preset))) refuse('Invalid recording preset')
  for (const step of input.steps) {
    const gesture = step?.gesture, target = gesture?.target
    const escape = gesture?.kind === 'key' && gesture.value === 'Escape' && target?.tag === 'document' && target.name === 'Escape'
    const command = gesture?.kind === 'command' && target?.tag === 'adapter'
    if (command) { try { if (sensitivePayload(JSON.parse(gesture.value)) || !runStep(target.name, JSON.parse(gesture.value))) refuse('Sensitive command') } catch { refuse('Invalid or sensitive adapter command') } }
    if (!escape && !command && (!['click', 'input'].includes(gesture?.kind) || !target || !/^[a-z][a-z0-9-]{0,39}$/.test(target.tag)) || !target || typeof target.name !== 'string' || !target.name || target.name.length > 2000 || sensitive.test(target.name) || !Number.isSafeInteger(target.index) || !Number.isSafeInteger(target.count) || target.index < 0 || target.count <= target.index || target.count > 1000 || gesture.value !== undefined && (typeof gesture.value !== 'string' || gesture.value.length > (command ? 32000 : 4000))) refuse('Invalid or sensitive recorded gesture')
    if (typeof step.route !== 'string' || step.route.length > 2000 || typeof step.view !== 'string' || step.view.length > 100_000 || !Array.isArray(step.fields) || step.fields.length > 250 || !Array.isArray(step.operations) || step.operations.length > 100) refuse('Invalid recorded state')
    if (step.discovery !== undefined && (!step.discovery || Object.keys(step.discovery).some(key => !['before', 'after'].includes(key)) || !step.discovery.before || !step.discovery.after)) refuse('Invalid interaction evidence')
    if (step.discovery) { checkedState(step.discovery.before, { project }); checkedState(step.discovery.after, { project }) }
    for (const field of step.fields) if (!field || typeof field.label !== 'string' || sensitive.test(field.label) || typeof field.value !== 'string' || field.value.length > 4000) refuse('Invalid recorded field')
    for (const operation of step.operations) if (!operation || !['mutation', 'action'].includes(operation.kind) || typeof operation.name !== 'string' || operation.name.length > 200 || operation.actor !== undefined && (typeof operation.actor !== 'string' || !/^[\w.-]{1,80}$/.test(operation.actor)) || sensitivePayload(operation.args) || sensitivePayload(operation.result)) refuse('Invalid or sensitive recorded operation')
  }
  return input
}

/**
 * A replay of a recording as CIVIC run evidence (decision 0009): the tape it replayed, by
 * content hash, the commit and source fingerprint it ran at, and whether every step verified
 * or the step where it diverged. The tape stays the engine's format; CIVIC reads this record.
 */
export function replayRecord(input, project, revision, at, sha256) {
  const tape = checkedRecording(input?.tape, project)
  if (!/^[0-9a-f]{40}$/.test(revision?.head ?? '') || tape.source !== revision?.source) refuse('Replay the recording at the source revision it was made at')
  const steps = tape.steps.length
  const passed = input.outcome === 'pass'
  if (!['pass', 'fail'].includes(input.outcome)) refuse('A replay passes or fails')
  if (passed && input.verified !== steps) refuse('A passing replay verified every step')
  if (!passed && (!Number.isSafeInteger(input.divergedAt) || input.divergedAt < 1 || input.divergedAt > steps)) refuse('A failing replay names the step it diverged at')
  if (input.message !== undefined && (typeof input.message !== 'string' || input.message.length > 2000)) refuse('Invalid replay message')
  return {
    schema: 'civic.replay/0',
    project: tape.project,
    scenario: tape.seed.context.scenario,
    head: revision.head,
    source: tape.source,
    tape: sha256,
    steps,
    outcome: input.outcome,
    ...(passed ? {} : { divergedAt: input.divergedAt }),
    ...(input.message ? { message: input.message } : {}),
    replayedAt: at,
  }
}

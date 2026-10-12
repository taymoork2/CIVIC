const refuse = (message) => { throw Object.assign(Error(message), { status: 400 }) }
const sensitive = /password|secret|token|credential|one.time.code|credit.card/i
export function sensitivePayload(value, depth = 0) {
  if (depth > 40) return true
  return Boolean(value && typeof value === 'object' && Object.entries(value).some(([key, child]) => sensitive.test(key) || sensitivePayload(child, depth + 1)))
}
export function checkedRecording(input, project) {
  if (!input || input.version !== 1 || input.project !== project?.key || !/^[0-9a-f]{64}$/.test(input.source) || !Number.isSafeInteger(input.now) || input.now < 0 || typeof input.initialRoute !== 'string' || input.initialRoute.length > 2000 || !Array.isArray(input.steps) || input.steps.length > 1000 || JSON.stringify(input).length > 2_000_000) refuse('Invalid or oversized project recording')
  const config = input.seed?.context
  if (sensitivePayload(input.seed)) refuse('Sensitive or deeply nested recording seed')
  if (!config || typeof config.scenario !== 'string' || !project.personas.some((preset) => preset.id === config.persona) || !project.roles.some((preset) => preset.id === config.role) || !project.conditions.some((preset) => preset.id === config.condition) || !['light', 'dark'].includes(config.theme) || ![1, 2].includes(config.textScale) || !Number.isInteger(config.width) || config.width < 200 || config.width > 1920) refuse('Invalid recording context')
  for (const step of input.steps) {
    const gesture = step?.gesture, target = gesture?.target
    const escape = gesture?.kind === 'key' && gesture.value === 'Escape' && target?.tag === 'document' && target.name === 'Escape'
    const command = gesture?.kind === 'command' && target?.tag === 'adapter'
    if (command) { try { if (sensitivePayload(JSON.parse(gesture.value))) refuse('Sensitive command') } catch { refuse('Invalid or sensitive adapter command') } }
    if (!escape && !command && (!['click', 'input'].includes(gesture?.kind) || !target || !['button', 'a', 'input', 'select', 'textarea', 'div', 'span'].includes(target.tag)) || !target || typeof target.name !== 'string' || !target.name || target.name.length > 2000 || sensitive.test(target.name) || !Number.isSafeInteger(target.index) || !Number.isSafeInteger(target.count) || target.index < 0 || target.count <= target.index || target.count > 1000 || gesture.value !== undefined && (typeof gesture.value !== 'string' || gesture.value.length > (command ? 32000 : 4000))) refuse('Invalid or sensitive recorded gesture')
    if (typeof step.route !== 'string' || step.route.length > 2000 || typeof step.view !== 'string' || step.view.length > 100_000 || !Array.isArray(step.fields) || step.fields.length > 250 || !Array.isArray(step.operations) || step.operations.length > 100) refuse('Invalid recorded state')
    for (const field of step.fields) if (!field || typeof field.label !== 'string' || sensitive.test(field.label) || typeof field.value !== 'string' || field.value.length > 4000) refuse('Invalid recorded field')
    for (const operation of step.operations) if (!operation || !['mutation', 'action'].includes(operation.kind) || typeof operation.name !== 'string' || operation.name.length > 200 || sensitivePayload(operation.args) || sensitivePayload(operation.result)) refuse('Invalid or sensitive recorded operation')
  }
  return input
}

import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi as api } from 'convex/server'

// Fictional, complete records for exercising flows. Never convert the Demo account's
// unknown evidence into confirmed facts, or change a person's real inventory.
const app = new URL(process.argv[2] ?? 'http://127.0.0.1:3005')
const envIndex = process.argv.indexOf('--env-file')
const envPath = envIndex < 0 ? new URL('../.env.local', import.meta.url) : process.argv[envIndex + 1]
if (envIndex >= 0 && (!envPath || envPath.startsWith('--'))) throw new Error('--env-file requires a path.')
const env = parseEnv(await readFile(envPath, 'utf8'))
const backend = new URL(env.VITE_CONVEX_URL ?? '')
const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])
const phone = app.origin === 'https://macbook-pro.tail221f42.ts.net' && backend.origin === 'http://127.0.0.1:3220'
if ((!phone && env.CONVEX_DEPLOYMENT !== 'anonymous:anonymous-agent') || backend.protocol !== 'http:' || !loopback.has(backend.hostname)
  || !(phone || app.protocol === 'http:' && loopback.has(app.hostname)) || app.username || app.password || backend.username || backend.password) {
  throw new Error('Flow testing requires an explicitly selected anonymous local backend and loopback app or approved phone preview.')
}
if (phone && await (await fetch(new URL('/instance_name', backend), { signal: AbortSignal.timeout(10_000) })).text() !== 'anonymous-agent') {
  throw new Error('The phone fixture backend identity does not match the selected anonymous deployment.')
}
const path = new URL('../.data/flow-test-account.json', import.meta.url)
await mkdir(new URL('../.data/', import.meta.url), { recursive: true })
let account
try { account = JSON.parse(await readFile(path, 'utf8')) }
catch (error) {
  if (error.code !== 'ENOENT') throw error
  account = { email: 'flow-test@example.invalid', name: 'Flow test', password: `Closet-${randomBytes(18).toString('base64url')}`, backend: backend.origin }
  await writeFile(path, JSON.stringify(account, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
}
if (account.email !== 'flow-test@example.invalid' || account.backend !== backend.origin || typeof account.password !== 'string' || account.password.length < 12) {
  throw new Error('Unexpected flow-account manifest. Preserve it; no credentials or progress were reset.')
}
const save = () => writeFile(path, JSON.stringify(account, null, 2) + '\n', { mode: 0o600 })
const authRequest = (route, body) => fetch(new URL(`/api/auth/${route}`, app), {
  method: 'POST', headers: { 'content-type': 'application/json', origin: app.origin },
  body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
})
let response = await authRequest('sign-in/email', { email: account.email, password: account.password })
if (response.status === 401) response = await authRequest('sign-up/email', { email: account.email, password: account.password, name: account.name })
if (!response.ok) throw new Error(`Normal authentication failed (HTTP ${response.status}); no password was reset.`)
const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
const tokenResponse = await fetch(new URL('/api/auth/convex/token', app), { headers: { cookie }, signal: AbortSignal.timeout(20_000) })
const { token } = await tokenResponse.json()
if (!tokenResponse.ok || typeof token !== 'string') throw new Error('No authenticated Convex token returned.')
const client = new ConvexHttpClient(backend.origin)
client.setAuth(token)
const status = await client.query(api.households.onboardingStatus, {})
if (status.households.length > 1 || (status.households[0] && status.households[0].name !== 'Flow testing — synthetic')) {
  throw new Error('The flow account has unexpected household ownership. No inventory was changed.')
}
const household = status.households[0] ?? await client.mutation(api.households.createHousehold, {
  displayName: account.name, name: 'Flow testing — synthetic', washPlace: 'home',
  wearers: [{ name: account.name, kind: 'adult', self: true }],
})
const householdId = household.householdId
if (account.householdId && account.householdId !== householdId) throw new Error('Flow account backend identity changed.')
account.householdId = householdId
await save()
const evidence = { source: 'fictional-flow-test-only; not real household evidence', confidence: 'observed' }
let inventory = await client.query(api.inventory.list, { householdId })
const wearerId = inventory.wearers[0].wearerId
async function machine(name, fields) {
  return inventory.machines.find((entry) => entry.name === name)?.machineId ?? client.mutation(api.inventory.createMachine, {
    householdId, name, location: 'home', capacityUnits: 16, capacityConfidence: 'observed', provenance: evidence, ...fields,
  })
}
account.washerId = await machine('Synthetic washer', {
  applianceType: 'front_load_washer', highEfficiency: true, supportedCycles: ['normal'],
  placements: ['detergent_compartment', 'direct_to_drum'], cycleMinutes: { normal: 40 },
})
account.dryerId = await machine('Synthetic dryer', {
  applianceType: 'tumble_dryer', heatSettings: [{ heat: 'low', label: 'Low heat' }, { heat: 'medium', label: 'Medium heat' }],
})
account.supplyId = inventory.supplies.find((entry) => entry.name === 'Synthetic HE detergent')?.supplyId ?? await client.mutation(api.inventory.createSupply, {
  householdId, name: 'Synthetic HE detergent', kind: 'chemical', use: 'detergent',
  safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] },
  formulation: { name: 'Fictional HE liquid', form: 'liquid', highEfficiencyCompatible: true }, provenance: evidence,
})
if (!inventory.supplies.find((supply) => supply.supplyId === account.supplyId)?.rules.length) await client.mutation(api.inventory.saveRule, {
  supplyId: account.supplyId, dose: { amount: 30, unit: 'ml' }, stage: 'wash', placement: 'detergent_compartment',
  timing: 'Before starting the synthetic wash', provenance: evidence,
})
async function garments(name, quantity, bulkUnits, kind, color = 'White', colorGroup = 'light') {
  const found = inventory.textiles.filter((entry) => entry.name === name).map((entry) => entry.textileId)
  if (found.length && found.length !== quantity) throw new Error(`Unexpected number of ${name}; existing progress preserved.`)
  const ids = found.length ? found : await client.mutation(api.inventory.createTextiles, {
    householdId, name, quantity, bulkUnits, kind, wearerId, status: 'dirty', soilLevel: 'normal',
    color, colorGroup, firstWash: false, dyeRun: 'fast',
  })
  for (const textileId of ids) if (!inventory.textiles.find((entry) => entry.textileId === textileId)?.care) {
    await client.mutation(api.inventory.setCare, {
      textileId, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40,
      restrictions: ['no_bleach'], dryMethod: 'tumble_dry', dryHeat: 'low', provenance: evidence,
    })
  }
  return ids
}
account.washTextileIds = await garments('Synthetic cotton tee', 6, 1, 'shirt')
account.dayTextileIds = [
  ...account.washTextileIds,
  ...await garments('Synthetic black jeans', 2, 3, 'pants', 'Black', 'black'),
  ...await garments('Synthetic red tee', 3, 1, 'shirt', 'Red', 'saturated'),
  ...await garments('Synthetic cotton sheets', 4, 4, 'sheets'),
]
account.dryTextileIds = await garments('Synthetic bath towel', 2, 2, 'towel')
await save()
await client.mutation(api.households.acknowledgeFirstHamper, { householdId })
async function readyPlan(ids, key) {
  const planned = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: ids, clientInputHash: key })
  const plan = await client.query(api.plans.get, { planId: planned.planId })
  const questions = await client.query(api.plans.questions, { planId: planned.planId })
  if (!plan || questions.length || !plan.loadStates.length || !plan.loadStates.every((load) => load.startable)) {
    throw new Error(`Synthetic plan is not ready: ${JSON.stringify({ questions, status: plan?.status, loadStates: plan?.loadStates })}`)
  }
  for (const load of plan.result.loads) await client.mutation(api.plans.confirmRecipe, { planId: plan.planId, loadId: load.id, machineId: account.washerId })
  return plan
}
// Seed one completed synthetic wash through public actions so the dryer is immediately testable.
// The stable start key resumes an interrupted seed; completed user progress is never reset.
if (!account.dryingSeeded) {
  const key = 'synthetic-dryer-example-v1'
  if (!account.drySessionId) {
    const plan = await readyPlan(account.dryTextileIds, key)
    const started = await client.mutation(api.execution.start, { planId: plan.planId, loadId: plan.result.loads[0].id, idempotencyKey: key })
    account.drySessionId = started.sessionId
    await save()
  }
  const sessionId = account.drySessionId
  for (let index = 0; index < 40; index += 1) {
    const detail = await client.query(api.execution.sessionDetail, { sessionId })
    if (detail.machineStartedAt !== null) break
    const action = detail.actions.find((entry) => entry.status === 'pending')
    if (!action) throw new Error('Synthetic wash did not start.')
    if (action.kind === 'task' && action.task === 'drum_fullness') await client.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'medium' })
    else await client.mutation(api.actions.recordAction, {
      sessionId, actionId: action.id, status: 'confirmed',
      ...(action.kind === 'treatment' ? { usage: { supplyId: action.supplyId, amount: action.dose.amount, unit: action.dose.unit, placement: action.placement } } : {}),
    })
  }
  await client.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  account.dryingSeeded = true
  await save()
}
inventory = await client.query(api.inventory.list, { householdId })
if (account.dayTextileIds.every((id) => inventory.textiles.find((entry) => entry.textileId === id)?.status === 'dirty')) {
  const plan = await readyPlan(account.dayTextileIds, 'synthetic-laundry-day-example-v2')
  if (plan.result.loads.length < 2) throw new Error('Synthetic laundry day must include multiple loads.')
  account.planId = plan.planId
  await save()
  console.log(`${account.email}: ${account.dayTextileIds.length} pieces in ${plan.result.loads.length} loads ready to wash; no unresolved data confirmations.`)
} else console.log(`${account.email}: existing wash progress preserved.`)
const queue = await client.query(api.dryingQueue.queue, { householdId })
console.log(`${queue.pieces.filter((piece) => piece.status === 'queued').length} pieces ready to dry. Credentials: ${fileURLToPath(path)}`)

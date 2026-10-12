import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'

const webDir = fileURLToPath(new URL('..', import.meta.url))
const arguments_ = process.argv.slice(2)
const envIndex = arguments_.indexOf('--env-file')
const envPath = envIndex < 0 ? new URL('../.env.local', import.meta.url) : arguments_[envIndex + 1]
if (envIndex >= 0 && (!envPath || envPath.startsWith('--'))) throw new Error('--env-file requires a path.')
const app = new URL(arguments_.find((argument, index) => !argument.startsWith('--') && (envIndex < 0 || index !== envIndex + 1)) ?? 'http://127.0.0.1:3005')
if (process.argv.includes('--refresh-catalog') && process.argv.includes('--mixed')) throw new Error('Refresh catalog facts separately from changing clothing states.')
const env = parseEnv(await readFile(envPath, 'utf8'))
const deployment = env.CONVEX_DEPLOYMENT
const backend = new URL(env.CONVEX_SELF_HOSTED_URL ?? env.VITE_CONVEX_URL ?? '')
const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])
if (![app, backend].every((url) => url.protocol === 'http:' && loopback.has(url.hostname) && !url.username && !url.password)
  || !(env.CONVEX_SELF_HOSTED_URL && env.CONVEX_SELF_HOSTED_ADMIN_KEY || /^(anonymous|local):/.test(deployment ?? ''))) throw new Error('Fixture accounts require an explicitly selected local deployment and loopback app.')

const manifestPath = new URL('../.data/fixture-accounts.json', import.meta.url)
const definitions = [
  { email: 'demo@example.invalid', name: 'Demo', seed: true },
  { email: 'first-run@example.invalid', name: 'First run', seed: false },
]
await mkdir(new URL('../.data/', import.meta.url), { recursive: true })
let accounts
try { accounts = JSON.parse(await readFile(manifestPath, 'utf8')) }
catch (error) {
  if (error.code !== 'ENOENT') throw error
  accounts = definitions.map((account) => ({ ...account, password: `Closet-${randomBytes(18).toString('base64url')}` }))
  await writeFile(manifestPath, JSON.stringify(accounts, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
}
if (!Array.isArray(accounts) || accounts.length !== definitions.length || definitions.some((definition, index) =>
  accounts[index]?.email !== definition.email || typeof accounts[index]?.password !== 'string' || accounts[index].password.length < 12)) {
  throw new Error('Invalid fixture account manifest; preserve it and investigate rather than resetting credentials.')
}

async function authenticate(account) {
  const request = (path, body) => fetch(new URL(`/api/auth/${path}`, app), {
    method: 'POST', headers: { 'content-type': 'application/json', origin: app.origin }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  })
  let response = await request('sign-in/email', { email: account.email, password: account.password })
  if (response.status === 401) response = await request('sign-up/email', { email: account.email, password: account.password, name: account.name })
  if (!response.ok) throw new Error(`Normal authentication failed for ${account.email} (HTTP ${response.status}); no credentials were reset.`)
  const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
  const tokenResponse = await fetch(new URL('/api/auth/convex/token', app), { headers: { cookie }, signal: AbortSignal.timeout(20_000) })
  const result = await tokenResponse.json()
  if (!tokenResponse.ok || typeof result.token !== 'string') throw new Error('No authenticated Convex token returned.')
  const client = new ConvexHttpClient(backend.origin)
  client.setAuth(result.token)
  return client
}

const convex = (...args) => execFileSync(fileURLToPath(new URL('../node_modules/.bin/convex', import.meta.url)), [...args, ...(envIndex < 0 ? [] : ['--env-file', envPath])], { cwd: webDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }).trim()
let previousFlag
try {
  for (const [index, account] of accounts.entries()) {
    if (process.argv.includes('--demo-only') && !definitions[index].seed) continue
    const client = await authenticate({ ...account, name: definitions[index].name })
    if (!definitions[index].seed) {
      console.log(`${account.email}: reusable first-run account (existing progress preserved)`)
      continue
    }
    const status = await client.query(anyApi.households.onboardingStatus, {})
    const household = status.households[0] ?? await client.mutation(anyApi.households.createHousehold, {
      displayName: 'Demo', name: 'Demo household', washPlace: 'shared',
      wearers: [{ name: 'Demo', kind: 'adult', self: true }, { name: 'Partner', kind: 'adult' }, { name: 'Child', kind: 'child' }],
    })
    const beforeRefresh = process.argv.includes('--refresh-catalog') ? await client.query(anyApi.inventory.list, { householdId: household.householdId }) : null
    if (!(await client.query(anyApi.fixtures.available, {}))) {
      previousFlag = convex('env', 'get', 'WASHCLOSET_DEV_FIXTURES')
      convex('env', 'set', 'WASHCLOSET_DEV_FIXTURES', 'enabled')
    }
    const seeded = await client.mutation(anyApi.fixtures.seedWasherFixture, { householdId: household.householdId, family: true, ...(process.argv.includes('--mixed') ? { mixed: true } : {}), ...(process.argv.includes('--refresh-catalog') ? { refreshCatalogFacts: true } : {}) })
    console.log(`${account.email}: ${seeded.textileIds.length} garments, ${seeded.machineIds.length} appliances, ${seeded.supplyIds.length} products; ${seeded.seeded ? 'seeded' : 'already present'}`)
    if (beforeRefresh) {
      const inventory = await client.query(anyApi.inventory.list, { householdId: household.householdId })
      const current = new Map(inventory.textiles.map((row) => [row.textileId, row]))
      const progressFields = ['status', 'washCount', 'wearerId', 'inLoad', 'statusSince', 'flag', 'soilLevel']
      for (const previous of beforeRefresh.textiles) {
        const next = current.get(previous.textileId)
        if (!next || progressFields.some((field) => JSON.stringify(previous[field]) !== JSON.stringify(next[field]))) throw new Error('Catalog refresh changed existing laundry progress; stop and investigate.')
      }
      const textiles = inventory.textiles.filter((row) => row.fromFixture)
      const materials = textiles.reduce((counts, row) => ({ ...counts, [row.care?.material ?? 'unknown']: (counts[row.care?.material ?? 'unknown'] ?? 0) + 1 }), {})
      console.log(`Catalog refresh verified: existing progress preserved; ${textiles.filter((row) => !/^\d{4}[A-Z]?\s/.test(row.name)).length} readable fixture titles; ${textiles.filter((row) => row.identity?.styleNumber).length} fixture style numbers; materials ${JSON.stringify(materials)}`)
    }
    if (process.argv.includes('--mixed')) {
      const inventory = await client.query(anyApi.inventory.list, { householdId: household.householdId })
      console.log(`Demo clothing states: ${JSON.stringify(inventory.textiles.reduce((counts, textile) => ({ ...counts, [textile.status]: (counts[textile.status] ?? 0) + 1 }), {}))}`)
    }
  }
} finally {
  if (previousFlag !== undefined) {
    if (previousFlag) convex('env', 'set', 'WASHCLOSET_DEV_FIXTURES', previousFlag)
    else convex('env', 'remove', 'WASHCLOSET_DEV_FIXTURES')
  }
}
console.log(`Credentials kept in ${fileURLToPath(manifestPath)}. Accounts persist in this deployment; reruns preserve edits and session history.`)

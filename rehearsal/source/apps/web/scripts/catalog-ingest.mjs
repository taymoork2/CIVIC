import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { createHash } from 'node:crypto'

// Explicit local administration: no network scraper, household writes or automatic acceptance.
const args = process.argv.slice(2)
const value = (name) => {
  const index = args.indexOf(name)
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a path`)
  return args[index + 1]
}
const manifestPath = value('--manifest')
const envPath = value('--env-file')
const env = parseEnv(await readFile(envPath, 'utf8'))
const backend = new URL(env.CONVEX_SELF_HOSTED_URL ?? '')
if (!['localhost', '127.0.0.1', '[::1]'].includes(backend.hostname) || backend.protocol !== 'http:' || backend.username || backend.password || !env.CONVEX_SELF_HOSTED_ADMIN_KEY) throw new Error('Catalog ingestion requires an explicitly selected local self-hosted backend')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries) || manifest.entries.length < 1 || manifest.entries.length > 100) throw new Error('Expected 1–100 authored extraction entries')
const webDir = fileURLToPath(new URL('..', import.meta.url))
const convex = fileURLToPath(new URL('../node_modules/.bin/convex', import.meta.url))
const run = (name, data) => JSON.parse(execFileSync(convex, ['run', name, JSON.stringify(data), '--env-file', envPath], { cwd: webDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }))
for (const entry of manifest.entries) {
  const sources = entry.sources.map((source) => ({ ...source, sha256: createHash('sha256').update(source.snapshot.trim()).digest('hex') }))
  // Hash the authored extraction input before computed digests; no private inventory enters it.
  const inputSha256 = createHash('sha256').update(JSON.stringify(entry)).digest('hex')
  const result = run('catalog:ingest', { ...entry, sources, inputSha256 })
  process.stdout.write(`${JSON.stringify({ variantKey: entry.variant.key, ...result })}\n`)
}

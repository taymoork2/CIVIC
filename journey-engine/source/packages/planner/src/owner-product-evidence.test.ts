import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { compileOwnerProductEvidence } from './owner-product-evidence.ts'

const input = JSON.parse(readFileSync(new URL('../../../docs/research/owner-product-integration/input/2026-10-04-owner-product-evidence.json', import.meta.url), 'utf8'))
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const fresh = () => structuredClone(input)
const tideAdditions = JSON.parse(readFileSync(new URL('../../../docs/research/owner-product-integration/tide-additions/input/evidence.json', import.meta.url), 'utf8'))
const entry = (result: ReturnType<typeof compileOwnerProductEvidence>, id: string) => result.entries.find((item) => item.product.key === `owner-reference:${id}`)!

test('five chemical candidates and two context accessories require a separate review', () => {
  const result = compileOwnerProductEvidence(input)
  assert.equal(result.entries.length, 5)
  assert.equal(result.review.records.length, 7)
  assert.deepEqual(result.review.acceptedClaimIds, [])
  assert.equal(result.extraction.reviewStatus, 'unreviewed_candidates')
  assert.equal(result.review.records.find((record) => record.recordId === 'downy-ball')?.entryVariantKey, null)
  assert.equal(result.review.records.find((record) => record.recordId === 'wool-dryer-balls')?.entryVariantKey, null)
  for (const item of result.entries) {
    assert.deepEqual(Object.keys(item).sort(), ['claims', 'extractorVersion', 'labelRevision', 'product', 'retrieverVersion', 'sources', 'variant'])
    assert.ok(item.claims.length > 0 && item.claims.length <= 100)
    assert.ok(item.sources.length > 0 && item.sources.length <= 20)
    for (const source of item.sources) {
      assert.equal(source.snapshotKind, 'factual_summary')
      assert.ok(!('sha256' in source), 'the reviewed importer computes source digests')
      assert.ok(source.snapshot.length <= 20000)
    }
    for (const claim of item.claims) {
      assert.ok(['function', 'ingredients', 'directions', 'restrictions', 'lipaseDisclosure', 'rinseMinimumContactMinutes'].includes(claim.key))
      assert.ok(claim.conditions.length > 0 && claim.conditions.length <= 1000)
      assert.ok(claim.sourceIds.every((id) => item.sources.some((source) => source.id === id)))
      if (typeof claim.value === 'string') assert.ok(claim.value.length <= 2000)
    }
  }
})

test('same evidence and reordered object keys reproduce importer input and identity', () => {
  const first = compileOwnerProductEvidence(input)
  assert.deepEqual(compileOwnerProductEvidence(fresh(), first), first)
  const reverseKeys = (value: unknown): unknown => Array.isArray(value) ? value.map(reverseKeys) : value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)])) : value
  assert.deepEqual(compileOwnerProductEvidence(reverseKeys(input)), first)
  for (const item of first.entries) {
    const binding = first.entryBindings.find((value) => value.variantKey === item.variant.key)!
    assert.equal(binding.inputSha256, hash(JSON.stringify(item)))
    assert.equal(binding.sourceSha256['tide-label'], item.sources.some((source) => source.id === 'tide-label') ? hash(item.sources.find((source) => source.id === 'tide-label')!.snapshot.trim()) : undefined)
  }
})

test('changed facts alter captured source hashes and importer revision without renaming public identities', () => {
  const prior = compileOwnerProductEvidence(input)
  const changed = fresh()
  changed.products[0].directions[0].doseByLoad.medium.fractionOfBar = 0.9
  const next = compileOwnerProductEvidence(changed, prior)
  const before = entry(prior, 'tide-original-liquid-121108')
  const after = entry(next, 'tide-original-liquid-121108')
  assert.deepEqual(after.product, before.product)
  assert.deepEqual(after.variant, before.variant)
  assert.notEqual(after.sources.find((source) => source.id === 'tide-label')!.snapshot, before.sources.find((source) => source.id === 'tide-label')!.snapshot)
  assert.notEqual(next.entryBindings.find((binding) => binding.variantKey === after.variant.key)!.digest, prior.entryBindings.find((binding) => binding.variantKey === before.variant.key)!.digest)
})

test('source revision changes create evidence revisions rather than new products or packs', () => {
  const prior = compileOwnerProductEvidence(input)
  const changed = fresh()
  changed.sources[0].sourceUpdatedAt = '2026-09-09'
  changed.products[0].identity.sourceRevision = '2026-09-09'
  const next = compileOwnerProductEvidence(changed, prior)
  assert.deepEqual(entry(next, changed.products[0].id).variant, entry(prior, changed.products[0].id).variant)
  assert.equal(entry(next, changed.products[0].id).labelRevision, '2026-09-09')
  const variantKey = entry(next, changed.products[0].id).variant.key
  assert.notEqual(next.entryBindings.find((binding) => binding.variantKey === variantKey)!.digest, prior.entryBindings.find((binding) => binding.variantKey === variantKey)!.digest)
})

test('source facts keep native measures, route scopes and discontinued formula attribution', () => {
  const result = compileOwnerProductEvidence(input)
  const tide = entry(result, 'tide-original-liquid-121108')
  const lysol = entry(result, 'lysol-crisp-linen-line-1833')
  const free = entry(result, 'oxiclean-versatile-free')
  const paks = entry(result, 'oxiclean-white-revive-paks')
  assert.ok(tide.claims.some((claim) => claim.key === 'directions' && String(claim.value).includes('"fractionOfBar":0.8')))
  assert.ok(free.claims.some((claim) => claim.key === 'directions' && String(claim.value).includes('"scoopLine":1')))
  assert.ok(paks.claims.some((claim) => claim.key === 'directions' && String(claim.value).includes('"paks":2')))
  assert.equal(lysol.claims.find((claim) => claim.key === 'rinseMinimumContactMinutes')?.value, 16)
  assert.ok(lysol.claims.every((claim) => claim.conditions.includes('Discontinued February 2023')))
  assert.ok(lysol.claims.every((claim) => !claim.sourceIds.includes('lysol-epa-context')))
  assert.equal(tide.claims.find((claim) => claim.key === 'lipaseDisclosure')?.value, 'not_listed')
  assert.ok(!paks.claims.some((claim) => claim.id.includes('presoak')))
  assert.ok(!JSON.stringify(result.entries).includes('"volumeMl":75'))
})

test('unknown measurements, unavailable SDS, invalid CAS and generic counts remain review evidence', () => {
  const result = compileOwnerProductEvidence(input)
  const downy = result.review.records.find((record) => record.recordId === 'downy-rinse-refresh-free-gentle-103111')!
  assert.ok(downy.quarantinedIdentifiers.some((fact) => fact.value === '57-55-7' && fact.reason === 'invalid_cas_checksum'))
  const paks = result.review.records.find((record) => record.recordId === 'oxiclean-white-revive-paks')!
  assert.ok(paks.unresolved.some((fact) => fact.path.includes('paksPerWaterVolume') && fact.value === null))
  assert.ok(Array.isArray(result.review.retrievalLimits))
  assert.equal(result.review.retrievalLimits.length, 5)
  assert.deepEqual(result.review.compatibilityFindings, input.compatibilityFindings)
  assert.deepEqual(result.review.contextOnly, input.contextOnly)
  assert.equal(result.review.contextSources.find((source) => source.id === 'ball-manufacturer')?.url, 'https://www.nehemiahmfg.com/?portfolio=downy-ball')
  assert.ok(result.review.contextSources.find((source) => source.id === 'lysol-epa-context')?.snapshot.includes('Master label includes optional wording'))
  assert.ok(result.review.records.every((record) => record.unresolved.length > 0))
  const wool = result.review.records.find((record) => record.recordId === 'wool-dryer-balls')!
  assert.ok(wool.unresolved.some((fact) => fact.path === 'generalGuidance' && JSON.stringify(fact.value).includes('not an owned-pack dose')))
})

test('duplicate source IDs are rejected even if identical; equal unrelated snapshots never reconcile identity', () => {
  const result = compileOwnerProductEvidence(input)
  const free = entry(result, 'oxiclean-versatile-free')
  const paks = entry(result, 'oxiclean-white-revive-paks')
  assert.equal(free.sources.find((source) => source.id === 'oxi-booster-use')!.snapshot, paks.sources.find((source) => source.id === 'oxi-booster-use')!.snapshot)
  assert.notEqual(free.variant.key, paks.variant.key, 'a shared source SHA must not collapse powder and Pak identities')
  const duplicate = fresh()
  duplicate.sources.push(structuredClone(duplicate.sources[0]))
  assert.throws(() => compileOwnerProductEvidence(duplicate), /duplicate source/i)
  const conflict = fresh()
  conflict.sources.push({ ...conflict.sources[0], publisher: 'Different publisher' })
  assert.throws(() => compileOwnerProductEvidence(conflict), /duplicate source/i)
  const products = fresh()
  products.products.push(structuredClone(products.products[0]))
  assert.throws(() => compileOwnerProductEvidence(products), /duplicate product/i)
  const alias = fresh()
  alias.products.push({ ...structuredClone(alias.products[0]), id: 'other-tide' })
  assert.throws(() => compileOwnerProductEvidence(alias), /identity.*conflict/i)
  const directions = fresh()
  const conflicting = structuredClone(directions.products[0].directions[0])
  conflicting.doseByLoad.medium.fractionOfBar = 0.9
  directions.products[0].directions.push(conflicting)
  assert.throws(() => compileOwnerProductEvidence(directions), /claim.*conflict/i)
})

test('a stable key cannot be reconciled with another form, pack, brand or source identity', () => {
  const prior = compileOwnerProductEvidence(input)
  for (const mutate of [
    (value: typeof input) => { value.products[0].name = 'A replacement formula' },
    (value: typeof input) => { value.products[0].identity.packSize.value = 115 },
    (value: typeof input) => { value.products[0].identity.brand = 'Other' },
    (value: typeof input) => { value.products[0].identity.gtin14 = '00030772103111'; value.products[0].identity.upcA = '030772103111' },
  ]) {
    const changed = fresh()
    mutate(changed)
    assert.throws(() => compileOwnerProductEvidence(changed, prior), /identity.*conflict/i)
  }
  const corrupted = structuredClone(prior)
  corrupted.entries[0].sources[0].snapshot += 'tampered'
  assert.throws(() => compileOwnerProductEvidence(input, corrupted), /binding|digest/i)
})

test('malformed types, identifiers, references, dates, routes and unsafe URL shapes fail closed', () => {
  const cases = [
    (value: typeof input) => { value.schemaVersion = 2 },
    (value: typeof input) => { value.ownerEvidence.physicalPackageLabelReviewed = true },
    (value: typeof input) => { value.products[0].directions[0].doseByLoad.medium.capBar = '1' },
    (value: typeof input) => { value.products[0].directions[0].doseByLoad.medium.fractionOfBar = 1.1 },
    (value: typeof input) => { value.products[0].directions[0].route = 'arbitrary_program' },
    (value: typeof input) => { value.products[0].directions[0].doseByLoad.medium = {} },
    (value: typeof input) => { delete value.products[0].directions[0].doseByLoad },
    (value: typeof input) => { value.products[0].directions[0].route = 'rinse_sanitization' },
    (value: typeof input) => { value.products[0].identity.advertisedLoads = 'sixty-four' },
    (value: typeof input) => { value.products[0].chemistry.fragranceDisclosed = 'yes' },
    (value: typeof input) => { value.products[0].privateLabelPhoto = 'household/private.jpg' },
    (value: typeof input) => { value.products[0].restrictions = [{ rule: 'No bleach' }] },
    (value: typeof input) => { value.products[0].directions[0].sourceIds = [] },
    (value: typeof input) => { value.products[0].ingredients[0].sourceId = 'unknown-source' },
    (value: typeof input) => { value.products[0].ingredients = ['Water'] },
    (value: typeof input) => { value.products[0].missing = 'not an array' },
    (value: typeof input) => { value.products[0].identity.gtin14 = '00030772121109' },
    (value: typeof input) => { value.products[0].identity.upcA = '030772103111' },
    (value: typeof input) => { value.products[0].identity.physicalRevision = 'reviewed' },
    (value: typeof input) => { value.products[0].identity.sourceRevision = '2024-02-30' },
    (value: typeof input) => { value.sources[0].retrievedAt = 'October sometime' },
    (value: typeof input) => { value.sources[0].retrievedAt = '2026-02-30T21:56:44Z' },
    (value: typeof input) => { value.sources[0].url = 'https://127.0.0.1/source' },
    (value: typeof input) => { value.sources[0].url = 'https://private.local/source' },
    (value: typeof input) => { value.sources[0].url = 'https://user:password@manufacturer.com/source' },
    (value: typeof input) => { value.sources[0].url = 'https://manufacturer.com:8080/source' },
    (value: typeof input) => { value.compatibilityFindings[0].products = ['unknown-product'] },
    (value: typeof input) => { value.privateInventory = { householdId: 'private' } },
  ]
  for (const [index, mutate] of cases.entries()) {
    const changed = fresh()
    mutate(changed)
    assert.throws(() => compileOwnerProductEvidence(changed), Error, `malformed case ${index + 1}`)
  }
})

test('the production catalog handler accepts candidates, replays idempotently and creates fact/source revisions', async () => {
  // Run the production mutation handler with an in-memory store. No Convex server,
  // authentication, household, network or external process is involved.
  const code = stripTypeScriptTypes(readFileSync(new URL('../../../convex/catalog.ts', import.meta.url), 'utf8'))
    .replace(/^import .*$/gm, '').replace(/^export /gm, '')
  const register = (definition: unknown) => definition
  const v = new Proxy({}, { get: () => () => ({}) })
  const unavailable = () => { throw new Error('Out-of-scope API invoked') }
  const ingest = new Function('v', 'internalMutation', 'mutation', 'query', 'sha256', 'fail', 'requireMember', 'principalFromAuth', `const catalogKind = {}, catalogClaim = {}, catalogSource = {}, supplyMeasure = {}, loadSize = {}, soilLevel = {}, sourceLoadCategory = {}, washerClass = {};\n${code}\nreturn ingest`)(v, register, register, register, hash, (_code: string, message: string) => { throw new Error(message) }, unavailable, unavailable)
  const tables = new Map<string, Record<string, unknown>[]>()
  const ctx = { db: {
    query: (table: string) => ({ withIndex: (_index: string, select: (query: unknown) => unknown) => {
      let field: string, value: unknown
      select({ eq: (name: string, wanted: unknown) => { field = name; value = wanted } })
      return { unique: async () => (tables.get(table) ?? []).find((row) => row[field!] === value) ?? null }
    } }),
    insert: async (table: string, data: Record<string, unknown>) => {
      const rows = tables.get(table) ?? []
      const id = `${table}:${rows.length + 1}`
      rows.push({ ...data, _id: id })
      tables.set(table, rows)
      return id
    },
  } }
  const compile = (packet: unknown) => compileOwnerProductEvidence(packet)
  const invoke = (item: ReturnType<typeof compile>['entries'][number]) => ingest.handler(ctx, {
    ...item, inputSha256: hash(JSON.stringify(item)), sources: item.sources.map((source) => ({ ...source, sha256: hash(source.snapshot.trim()) })),
  })
  const first = compile(input)
  for (const item of first.entries) {
    const result = await invoke(item)
    assert.equal(result.created, true)
    assert.equal(result.digest, first.entryBindings.find((binding) => binding.variantKey === item.variant.key)!.digest)
    assert.deepEqual(await invoke(item), { ...result, created: false })
  }
  const changed = fresh()
  changed.products[0].directions[0].doseByLoad.medium.fractionOfBar = 0.9
  const revised = await invoke(entry(compile(changed), changed.products[0].id))
  assert.equal(revised.created, true)
  assert.equal(tables.get('catalogProducts')!.length, 5)
  assert.equal(tables.get('catalogVariants')!.length, 5)
  assert.equal(tables.get('catalogRevisions')!.length, 6)
  changed.sources[0].sourceUpdatedAt = '2026-09-09'
  changed.products[0].identity.sourceRevision = '2026-09-09'
  assert.equal((await invoke(entry(compile(changed), changed.products[0].id))).created, true)
  assert.equal(tables.get('catalogRevisions')!.length, 7)
  const invalid = structuredClone(first.entries[0]!)
  invalid.sources[0]!.snapshot += 'tampered'
  await assert.rejects(() => ingest.handler(ctx, { ...invalid, inputSha256: hash(JSON.stringify(invalid)), sources: invalid.sources.map((source) => ({ ...source, sha256: hash('wrong') })) }), /snapshot digest/)
})

test('additional detergents retain qualitative cap marks and supplemental manufacturer PODS counts', () => {
  const result = compileOwnerProductEvidence(tideAdditions)
  assert.equal(result.entries.length, 2)
  const liquid = entry(result, 'tide-free-gentle-235843')
  const pods = entry(result, 'tide-pods-spring-meadow-032503')
  const liquidDose = JSON.parse(String(liquid.claims.find((claim) => claim.key === 'directions')!.value))
  assert.deepEqual(liquidDose.doseByLoad.medium, { capBar: 2, fractionOfBar: null, qualifier: 'below' })
  assert.deepEqual(liquidDose.doseByLoad.large, { capBar: 3, fractionOfBar: null, qualifier: 'just_below' })
  assert.deepEqual(liquidDose.doseByLoad.heFull, { capBar: 5, fractionOfBar: 1 })
  const podClaim = pods.claims.find((claim) => claim.key === 'directions')!
  const podDose = JSON.parse(String(podClaim.value))
  assert.deepEqual(podDose.doseByLoad, { smaller: { paks: 1 }, standard: { paks: 2 }, larger: { paks: 3 } })
  assert.deepEqual(podClaim.sourceIds, ['tide-pods-family-guide', 'tide-pods-spring-meadow-032503'])
  assert.equal(podDose.openPak, false)
  assert.ok(podClaim.conditions.includes('no numerical thresholds'))
  assert.ok(!JSON.stringify(result.entries).includes('POWER PODS dose'))
  assert.equal(pods.variant.packIdentifier, 'gtin14:00030772032503')
  assert.ok(result.review.records.find((record) => record.recordId === 'tide-free-gentle-235843')!.unresolved.some((fact) => fact.path.endsWith('fractionOfBar') && fact.value === null))
  assert.deepEqual(result.review.acceptedClaimIds, [])
  assert.deepEqual(compileOwnerProductEvidence(tideAdditions, result), result)
})

test('new detergent contracts reject invented cap fractions, partial pacs, unsupported load bins and form/pack conflicts', () => {
  const cases = [
    (value: typeof tideAdditions) => { value.products[0].directions[0].doseByLoad.medium.fractionOfBar = 0.8 },
    (value: typeof tideAdditions) => { value.products[0].directions[0].doseByLoad.large.qualifier = 'roughly_half' },
    (value: typeof tideAdditions) => { value.products[0].directions[0].doseByLoad.medium.capBar = 2.5 },
    (value: typeof tideAdditions) => { value.products[1].directions[0].doseByLoad.standard.paks = 1.5 },
    (value: typeof tideAdditions) => { value.products[1].directions[0].doseByLoad.standard.paks = 0 },
    (value: typeof tideAdditions) => { value.products[1].directions[0].doseByLoad.extra_large = { paks: 3 } },
    (value: typeof tideAdditions) => { value.products[1].directions[0].openPak = true },
    (value: typeof tideAdditions) => { value.products[1].directions[0].placement = 'Detergent drawer' },
    (value: typeof tideAdditions) => { delete value.products[1].directions[0].scope },
    (value: typeof tideAdditions) => { value.products[1].identity.packSize.unit = 'US_fl_oz' },
    (value: typeof tideAdditions) => { value.products[0].identity.packSize.unit = 'count' },
    (value: typeof tideAdditions) => { value.products[1].form = 'powder' },
  ]
  for (const mutate of cases) {
    const changed = structuredClone(tideAdditions)
    mutate(changed)
    assert.throws(() => compileOwnerProductEvidence(changed))
  }
})

test('single-file CLI compiles additions and binds only the supplied source packet', () => {
  const root = mkdtempSync(join(tmpdir(), 'tide-additions-test-'))
  try {
  const source = join(root, 'evidence.json')
  cpSync(new URL('../../../docs/research/owner-product-integration/tide-additions/input/evidence.json', import.meta.url), source)
  const script = fileURLToPath(new URL('../scripts/compile-owner-product-evidence.ts', import.meta.url))
  const output = join(root, 'output')
  execFileSync(process.execPath, ['--experimental-strip-types', script, source, output], { encoding: 'utf8' })
  const receipt = JSON.parse(readFileSync(join(output, 'receipt.json'), 'utf8'))
  assert.equal(receipt.entries, 2)
  assert.equal(receipt.inputs.length, 1)
  assert.equal(receipt.inputs[0].sha256, hash(readFileSync(source, 'utf8')))
  assert.equal(receipt.backendWrites, false)
  assert.equal(receipt.householdWrites, false)
  const bytes = readFileSync(join(output, 'manifest.json'))
  execFileSync(process.execPath, ['--experimental-strip-types', script, source, join(root, 'replay'), '--previous', join(output, 'manifest.json')], { encoding: 'utf8' })
  assert.deepEqual(readFileSync(join(root, 'replay', 'manifest.json')), bytes)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('portable CLI binds exact file bytes and output, replays and refuses overwrite or unsafe outputs', () => {
  const root = mkdtempSync(join(tmpdir(), 'owner-evidence-test-'))
  try {
  const inputDir = join(root, 'relocated-input')
  cpSync(new URL('../../../docs/research/owner-product-integration/input', import.meta.url), inputDir, { recursive: true })
  const script = fileURLToPath(new URL('../scripts/compile-owner-product-evidence.ts', import.meta.url))
  const run = (...args: string[]) => execFileSync(process.execPath, ['--experimental-strip-types', script, ...args], { cwd: root, encoding: 'utf8' })
  const output = join(root, 'first')
  run(inputDir, output)
  const manifestBytes = readFileSync(join(output, 'manifest.json'))
  const receipt = JSON.parse(readFileSync(join(output, 'receipt.json'), 'utf8'))
  assert.equal(receipt.outputSha256, createHash('sha256').update(manifestBytes).digest('hex'))
  for (const source of receipt.inputs) {
    assert.equal(source.sha256, createHash('sha256').update(readFileSync(join(inputDir, source.path))).digest('hex'))
    assert.ok(!source.path.startsWith('/'))
  }
  assert.equal(receipt.compilerInputs.length, 2)
  assert.equal(receipt.importerContractInputs.length, 3)
  run(inputDir, join(root, 'replay'), '--previous', join(output, 'manifest.json'))
  assert.deepEqual(readFileSync(join(root, 'replay', 'manifest.json')), manifestBytes)
  const error = spawnSync(process.execPath, ['--experimental-strip-types', script, inputDir, output], { encoding: 'utf8' })
  assert.notEqual(error.status, 0)
  assert.deepEqual(readFileSync(join(output, 'manifest.json')), manifestBytes)
  const link = join(root, 'unsafe-link')
  symlinkSync('/etc', link) // outside every allowed root, and not writable if the scope check ever regresses
  const unsafe = spawnSync(process.execPath, ['--experimental-strip-types', script, inputDir, link], { encoding: 'utf8' })
  assert.notEqual(unsafe.status, 0)
  assert.match(unsafe.stderr, /output.*scope/i)
  const extra = spawnSync(process.execPath, ['--experimental-strip-types', script, inputDir, join(root, 'bad-args'), '--unknown'], { encoding: 'utf8' })
  assert.notEqual(extra.status, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

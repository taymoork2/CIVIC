import { createHash } from 'node:crypto'

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

/** Offline extraction only. No claim is accepted and no planner rule is emitted. */
export const ownerProductEvidenceCompilerVersion = 'owner-product-evidence-v3' as const
type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type RecordValue = { [key: string]: Json }
type Claim = { id: string; key: string; value: string | number | string[]; sourceIds: string[]; conditions: string }
type Source = {
  id: string; url: string; retrievedAt: string; provider: string; sourceUpdatedAt?: string
  snapshot: string; snapshotKind: 'factual_summary'; permission: string
}
export type OwnerCatalogEntry = {
  product: { key: string; kind: 'product'; brand: string; name: string }
  variant: { key: string; name: string; market: string; packIdentifier: string }
  labelRevision: string; retrieverVersion: string; extractorVersion: string; sources: Source[]; claims: Claim[]
}
type ReviewFact = { path: string; value: Json; reason: string }
type ReviewRecord = {
  recordId: string; identitySha256: string; entryVariantKey: string | null
  unresolved: ReviewFact[]; quarantinedIdentifiers: ReviewFact[]; sourceIssues: Json; corrections: Json
}
export type OwnerProductEvidenceManifest = {
  schemaVersion: 1
  extraction: { version: string; inputSha256: string; reviewStatus: 'unreviewed_candidates' }
  entries: OwnerCatalogEntry[]
  entryBindings: { variantKey: string; inputSha256: string; sourceSha256: { [id: string]: string }; digest: string }[]
  review: { acceptedClaimIds: []; records: ReviewRecord[]; contextSources: Source[]; compatibilityFindings: Json; contextOnly: Json; retrievalLimits: Json }
}

function fail(message: string): never { throw new Error(`Owner evidence: ${message}`) }
function record(value: Json, field: string): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${field} must be an object`)
  return value
}
function array(value: Json, field: string, max = 100): Json[] {
  if (!Array.isArray(value) || value.length > max) fail(`${field} must be a bounded array`)
  return value
}
function text(value: Json, field: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value || value.length > max) fail(`invalid ${field}`)
  return value
}
function key(value: Json, field: string): string {
  const result = text(value, field, 120)
  if (!/^[a-z0-9][a-z0-9._:-]*$/.test(result)) fail(`invalid ${field}`)
  return result
}
function strings(value: Json, field: string): string[] {
  return array(value, field).map((item) => text(item, field, 2000))
}
function shape(value: RecordValue, allowed: string[], required: string[] = []): void {
  for (const name of Object.keys(value)) if (!allowed.includes(name)) fail(`unsupported field ${name}`)
  for (const name of required) if (!Object.hasOwn(value, name)) fail(`missing field ${name}`)
}

/** JSON only, bounded recursion; canonical ordering matches catalog revision hashing. */
export function canonicalOwnerEvidence(value: unknown, depth = 0): string {
  if (depth > 30) fail('evidence nesting exceeds limit')
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) {
    if (value.length > 1000) fail('array exceeds limit')
    return `[${value.map((item) => canonicalOwnerEvidence(item, depth + 1)).join(',')}]`
  }
  if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Object.prototype) fail('non-JSON evidence')
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([name, item]) => `${JSON.stringify(name)}:${canonicalOwnerEvidence(item, depth + 1)}`).join(',')}}`
}
function date(value: Json, field: string, timestamp = false): string {
  const result = text(value, field, 100)
  const pattern = timestamp ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/ : /^\d{4}-\d{2}-\d{2}$/
  if (!pattern.test(result)) fail(`invalid ${field}`)
  const parsed = new Date(timestamp ? result : `${result}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, timestamp ? 19 : 10) !== result.slice(0, timestamp ? 19 : 10)) fail(`invalid ${field}`)
  return result
}
function publicUrl(value: Json): string {
  const raw = text(value, 'public URL', 2000)
  const url = new URL(raw)
  const host = url.hostname
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port || !host.includes('.')
    || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal')
    || host === 'localhost' || host.includes(':') || /^[\d.]+$/.test(host)) fail('invalid public URL')
  return url.href
}
function checksum(value: string): boolean {
  const digits = [...value].map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - sum % 10) % 10 === check
}
function validateIdentity(identity: RecordValue, source: RecordValue): void {
  shape(identity, ['brand', 'gtin14', 'upcA', 'sourceDisplayedCode', 'packSize', 'advertisedLoads', 'scent', 'sourceRevision', 'physicalRevision', 'productLineId', 'sourceProductId', 'sourceStatus', 'epaRegistration', 'materialNumber', 'legacyUrlIdentifier', 'licensedManufacturer', 'material'], ['brand', 'packSize'])
  for (const name of ['sourceDisplayedCode', 'scent', 'productLineId', 'sourceProductId', 'sourceStatus', 'epaRegistration', 'materialNumber', 'legacyUrlIdentifier', 'licensedManufacturer', 'material']) {
    if (identity[name] !== undefined) text(identity[name], name)
  }
  if (identity.advertisedLoads !== undefined && (typeof identity.advertisedLoads !== 'number' || !Number.isInteger(identity.advertisedLoads) || identity.advertisedLoads <= 0)) fail('invalid advertised loads')
  for (const [name, length] of [['gtin14', 14], ['upcA', 12]] as const) {
    const value = identity[name]
    if (value === undefined || value === null) continue
    if (typeof value !== 'string' || value.length !== length || !/^\d+$/.test(value) || !checksum(value)) fail(`invalid ${name} checksum`)
  }
  if (typeof identity.gtin14 === 'string' && typeof identity.upcA === 'string' && identity.gtin14 !== `00${identity.upcA}`) fail('identity identifier conflict')
  if (identity.physicalRevision !== undefined && identity.physicalRevision !== null) fail('physical revision conflicts with unreviewed packet')
  if (identity.sourceRevision !== undefined) {
    date(identity.sourceRevision, 'source revision')
    if (identity.sourceRevision !== source.sourceUpdatedAt) fail('source revision conflict')
  }
  if (identity.packSize !== null && identity.packSize !== undefined) {
    const size = record(identity.packSize, 'pack size')
    shape(size, ['value', 'unit'], ['value', 'unit'])
    if (typeof size.value !== 'number' || size.value <= 0 || !['US_fl_oz', 'count'].includes(String(size.unit))
      || (size.unit === 'count' && !Number.isInteger(size.value))) fail('invalid pack size')
  }
}

const directionNumbers = new Set(['capBar', 'fractionOfBar', 'dispenserFraction', 'value', 'capfuls', 'fillEachToLine', 'minimumContactMinutes', 'contactMinutes', 'scoopLine', 'min', 'maxStated', 'paks'])
const directionBooleans = new Set(['approximate', 'notForMainWash', 'universalMaximumEstablished', 'openPak'])
const directionText = new Set(['route', 'scope', 'deepFill', 'sequence', 'placement', 'toughOdors', 'smallLightOdor', 'largeHeavyOdor', 'temperature', 'water', 'unit', 'heavySoil', 'machine'])
const nestedDirectionShapes: { [name: string]: string[] } = {
  doseByLoad: ['medium', 'large', 'heFull'], medium: ['capBar', 'fractionOfBar'], large: ['capBar', 'fractionOfBar'], heFull: ['capBar', 'fractionOfBar'],
  normalLoad: ['dispenserFraction', 'approximateAmount'], approximateAmount: ['value', 'unit', 'approximate'],
  doseByMachine: ['heOrFrontLoad', 'standard'], heOrFrontLoad: ['capfuls', 'fillEachToLine'], standard: ['capfuls', 'fillEachToLine'],
  perWater: ['value', 'unit'], regularLoad: ['scoopLine'], contactHours: ['min', 'maxStated', 'universalMaximumEstablished'],
  regularOrLightSoil: ['paks'], largeHeavilySoiled: ['paks'], heHeavilySoiled: ['paks'],
}
function validateDirection(direction: RecordValue, kind: string, form: string): void {
  text(direction.route, 'direction route')
  let required: string[] | undefined
  if (kind === 'detergent' && form === 'liquid' && direction.route === 'main_wash') required = ['doseByLoad', 'deepFill', 'sequence', 'volumeMl']
  if (kind === 'detergent' && form === 'water_soluble_pak' && direction.route === 'main_wash') {
    shape(direction, ['route', 'scope', 'sourceIds', 'doseByLoad', 'placement', 'sequence', 'openPak'], ['route', 'scope', 'sourceIds', 'doseByLoad', 'placement', 'sequence', 'openPak'])
    const doses = record(direction.doseByLoad, 'pod dose by source load category')
    shape(doses, ['smaller', 'standard', 'larger'], ['smaller', 'standard', 'larger'])
    for (const category of ['smaller', 'standard', 'larger']) {
      const dose = record(doses[category]!, 'pod dose')
      shape(dose, ['paks'], ['paks'])
      if (typeof dose.paks !== 'number' || !Number.isInteger(dose.paks) || dose.paks < 1 || dose.paks > 4) fail('invalid whole-pac count')
    }
    if (direction.openPak !== false || direction.placement !== 'Washer drum before clothes') fail('invalid detergent pac route')
    text(direction.scope, 'pod source scope', 1000)
    text(direction.sequence, 'pod sequence', 2000)
    if (!strings(direction.sourceIds, 'direction source IDs').length) fail('empty direction sources')
    return
  }
  if (kind === 'rinse_aid' && direction.route === 'rinse') required = direction.scope === undefined
    ? ['placement', 'normalLoad', 'toughOdors', 'sequence'] : ['smallLightOdor', 'largeHeavyOdor', 'temperature']
  if (kind === 'laundry_sanitizer' && direction.route === 'rinse_sanitization') required = ['doseByMachine', 'placement', 'minimumContactMinutes', 'volumeMl', 'notForMainWash']
  if (kind === 'laundry_sanitizer' && direction.route === 'presoak_disinfection') required = ['dose', 'water', 'contactMinutes', 'sequence']
  if (kind === 'oxygen_bleach_booster' && direction.route === 'main_wash') required = form === 'powder'
    ? ['regularLoad', 'heavySoil', 'placement', 'massGrams'] : ['regularOrLightSoil', 'largeHeavilySoiled', 'heHeavilySoiled', 'placement', 'openPak']
  if (kind === 'oxygen_bleach_booster' && direction.route === 'presoak') required = form === 'powder'
    ? ['dose', 'contactHours', 'sequence', 'temperature'] : ['paksPerWaterVolume', 'sequence', 'contactHours']
  if (kind === 'oxygen_bleach_booster' && form === 'water_soluble_pak' && direction.route === 'cold_water') required = ['sequence']
  if (kind === 'rinse_dispenser_accessory' && direction.route === 'automatic_rinse_delivery') required = ['sequence', 'machine']
  if (required === undefined) fail('direction route conflicts with product kind/form')
  shape(direction, [...required, 'scope', 'route', 'sourceIds'], [...required, 'route', 'sourceIds'])
  function visit(value: RecordValue): void {
    for (const [name, child] of Object.entries(value)) {
      if (name === 'sourceIds') { if (strings(child, 'direction source IDs').length === 0) fail('empty direction sources') }
      else if (name === 'dose' || Object.hasOwn(nestedDirectionShapes, name)) {
        const object = record(child, name)
        if (kind === 'detergent' && form === 'liquid' && ['medium', 'large', 'heFull'].includes(name) && object.qualifier !== undefined) {
          shape(object, ['capBar', 'qualifier', 'fractionOfBar'], ['capBar', 'qualifier', 'fractionOfBar'])
          if (typeof object.capBar !== 'number' || !Number.isInteger(object.capBar) || object.capBar <= 0
            || !['below', 'just_below'].includes(String(object.qualifier)) || object.fractionOfBar !== null) fail('invalid qualitative cap target')
          continue
        }
        const fields = name === 'dose' ? kind === 'laundry_sanitizer' ? ['capfuls', 'fillEachToLine', 'perWater'] : ['scoopLineRange', 'perWater'] : nestedDirectionShapes[name]!
        shape(object, fields, fields)
        visit(object)
      }
      else if (directionNumbers.has(name)) {
        if (typeof child !== 'number' || child <= 0) fail(`invalid ${name}`)
        if (['fractionOfBar', 'dispenserFraction'].includes(name) && child > 1) fail(`invalid ${name}`)
        if (['capBar', 'capfuls', 'fillEachToLine', 'scoopLine', 'paks'].includes(name) && !Number.isInteger(child)) fail(`invalid ${name}`)
      } else if (directionBooleans.has(name)) { if (typeof child !== 'boolean') fail(`invalid ${name}`) }
      else if (directionText.has(name)) {
        text(child, name, 2000)
        if (name === 'unit' && !['US_cup', 'US_gallon'].includes(String(child))) fail('unsupported direction unit')
      } else if (name === 'scoopLineRange') {
        const range = array(child, name)
        if (range.length !== 2 || range.some((item) => typeof item !== 'number' || item <= 0 || !Number.isInteger(item)) || Number(range[0]) > Number(range[1])) fail('invalid scoop range')
      } else if (['volumeMl', 'massGrams', 'paksPerWaterVolume'].includes(name)) {
        if (child !== null) fail(`unreviewed calibration ${name}; requires a distinct reviewed compiler contract`)
      } else fail(`unsupported direction field ${name}`)
    }
  }
  visit(direction)
  if (direction.notForMainWash !== undefined && direction.notForMainWash !== true) fail('sanitizer main-wash restriction conflict')
  if (direction.openPak !== undefined && direction.openPak !== false) fail('Pak opening restriction conflict')
  if (direction.machine !== undefined && direction.machine !== 'Non-HE only') fail('accessory machine restriction conflict')
  if (!direction.sourceIds) fail('missing direction sources')
  if (direction.contactHours !== undefined) {
    const hours = record(direction.contactHours, 'contact hours')
    if (Number(hours.min) > Number(hours.maxStated)) fail('invalid contact interval')
  }
}

function refs(value: Json, available: Set<string>): string[] {
  const result = new Set<string>()
  function visit(current: Json): void {
    if (Array.isArray(current)) { current.forEach(visit); return }
    if (current === null || typeof current !== 'object') return
    for (const [name, child] of Object.entries(current)) {
      if (['sourceId', 'ownerReferenceSourceId'].includes(name) || name === 'sourceIds') {
        const ids = name === 'sourceIds' ? strings(child, 'source IDs') : [key(child, 'source ID')]
        if (ids.length === 0) fail('empty source references')
        for (const id of ids) { if (!available.has(id)) fail(`unknown source ${id}`); result.add(id) }
      } else visit(child)
    }
  }
  visit(value)
  return [...result].sort()
}
function withoutRefs(value: RecordValue): RecordValue {
  return Object.fromEntries(Object.entries(value).filter(([name]) => !['sourceId', 'sourceIds'].includes(name)))
}
function identityDigest(product: RecordValue): string {
  const identity = record(product.identity, 'identity')
  return sha256(canonicalOwnerEvidence({ id: product.id, name: product.name, kind: product.kind, form: product.form,
    identity: Object.fromEntries(Object.entries(identity).filter(([name]) => !['sourceRevision', 'sourceStatus'].includes(name))) }))
}

/** Exact digest inputs produced by catalog-ingest.mjs and normalized by catalog.ingest. */
function binding(entry: OwnerCatalogEntry): OwnerProductEvidenceManifest['entryBindings'][number] {
  const inputSha256 = sha256(JSON.stringify(entry))
  const sources = entry.sources.map((source) => ({ ...source, sha256: sha256(source.snapshot.trim()) })).sort((a, b) => a.id.localeCompare(b.id))
  const claims = entry.claims.map((claim) => ({ ...claim, sourceIds: [...new Set(claim.sourceIds)].sort() })).sort((a, b) => a.id.localeCompare(b.id))
  return { variantKey: entry.variant.key, inputSha256, sourceSha256: Object.fromEntries(sources.map((source) => [source.id, source.sha256])),
    digest: sha256(canonicalOwnerEvidence({ ...entry, inputSha256, sources, claims })) }
}

const boundary = 'Unreviewed recorded research for this exact US reference; physical package not confirmed. Textual conditions are not executable rules. No compatibility or use approval.'
const productKinds: { [kind: string]: string } = { detergent: '', rinse_aid: 'liquid', laundry_sanitizer: 'liquid', oxygen_bleach_booster: '', rinse_dispenser_accessory: 'reusable_device', dryer_accessory: 'wool_dryer_ball' }

export function compileOwnerProductEvidence(input: unknown, previous?: unknown): OwnerProductEvidenceManifest {
  const canonical = canonicalOwnerEvidence(input)
  if (new TextEncoder().encode(canonical).byteLength > 400000) fail('packet exceeds limit')
  const packet = record(JSON.parse(canonical), 'packet')
  const rootFields = new Set(['schemaVersion', 'recordType', 'preparedAt', 'presentationLocale', 'scope', 'ownerEvidence', 'integrationBoundary', 'sources', 'products', 'compatibilityFindings', 'contextOnly', 'retrievalLimits', 'storageAndIntegrationNotes'])
  for (const name of Object.keys(packet)) if (!rootFields.has(name)) fail(`unsupported packet field ${name}`)
  if (packet.schemaVersion !== 1 || packet.recordType !== 'owner_selected_product_references' || packet.presentationLocale !== 'en-US') fail('unsupported packet schema')
  date(packet.preparedAt, 'prepared date', true)
  text(packet.scope, 'scope', 2000)
  const owner = record(packet.ownerEvidence, 'owner evidence')
  if (owner.confirmationLevel !== 'selected_source_identity' || owner.physicalPackageLabelReviewed !== false || owner.physicalAcceptancePerformed !== false) fail('unsupported acceptance state')
  const integration = record(packet.integrationBoundary, 'integration boundary')
  if (integration.householdWritesPerformed !== false || integration.runtimeRulesChanged !== false) fail('unsupported runtime state')
  strings(packet.storageAndIntegrationNotes, 'integration notes')
  const rawSources = array(packet.sources, 'sources', 20).map((value) => record(value, 'source'))
  const sourceMap = new Map<string, RecordValue>()
  const urls = new Set<string>()
  for (const source of rawSources) {
    shape(source, ['id', 'url', 'publisher', 'sourceUpdatedAt', 'retrieval', 'retrievedAt'], ['id', 'url', 'publisher', 'sourceUpdatedAt', 'retrieval', 'retrievedAt'])
    const id = key(source.id, 'source ID')
    if (sourceMap.has(id)) fail(`duplicate source ${id}`)
    const url = publicUrl(source.url)
    if (urls.has(url)) fail('source URL reconciliation conflict')
    urls.add(url)
    text(source.publisher, 'publisher')
    text(source.retrieval, 'retrieval', 1000)
    date(source.retrievedAt, 'retrieval date', true)
    if (source.sourceUpdatedAt !== null) date(source.sourceUpdatedAt, 'source update date')
    sourceMap.set(id, source)
  }
  const available = new Set(sourceMap.keys())
  refs(packet.products, available)
  refs(packet.compatibilityFindings, available)
  refs(packet.contextOnly, available)
  const products = array(packet.products, 'products', 20).map((value) => record(value, 'product'))
  if (!products.length || !rawSources.length) fail('empty packet')
  const productIds = new Set<string>()
  const packIds = new Set<string>()
  for (const product of products) {
    shape(product, ['id', 'name', 'kind', 'form', 'ownerReferenceSourceId', 'identity', 'ingredients', 'chemistry', 'directions', 'handling', 'missing', 'previousCorrection', 'restrictions', 'sourceIssues', 'claimLimits', 'lotCodeGuide', 'fragranceComponents', 'boundary', 'generalGuidance', 'ownedPackDirections'], ['id', 'name', 'kind', 'form', 'ownerReferenceSourceId', 'identity', 'missing'])
    const id = key(product.id, 'product ID')
    if (productIds.has(id)) fail(`duplicate product ${id}`)
    productIds.add(id)
    text(product.name, 'product name')
    const kind = text(product.kind, 'product kind')
    const form = text(product.form, 'product form')
    if (!(kind in productKinds) || (productKinds[kind] !== '' && form !== productKinds[kind])
      || (kind === 'oxygen_bleach_booster' && !['powder', 'water_soluble_pak'].includes(form))
      || (kind === 'detergent' && !['liquid', 'water_soluble_pak'].includes(form))) fail('unsupported product kind or form')
    const identity = record(product.identity, 'identity')
    const source = sourceMap.get(String(product.ownerReferenceSourceId))!
    validateIdentity(identity, source)
    if (kind === 'detergent' && form === 'water_soluble_pak' && record(identity.packSize, 'pac pack size').unit !== 'count') fail('detergent pac pack requires a count')
    if (kind === 'detergent' && form === 'liquid' && record(identity.packSize, 'liquid pack size').unit !== 'US_fl_oz') fail('liquid detergent pack requires volume')
    if (identity.brand !== null) text(identity.brand, 'brand')
    for (const name of ['gtin14', 'sourceProductId', 'materialNumber']) {
      if (identity[name] === undefined) continue
      const pack = `${identity.brand}:${name}:${text(identity[name], name)}`
      if (packIds.has(pack)) fail('identity alias conflict; use one reconciled product')
      packIds.add(pack)
    }
    strings(product.missing, 'missing fields')
    if (product.sourceIssues !== undefined) strings(product.sourceIssues, 'source issues')
    if (product.claimLimits !== undefined) strings(product.claimLimits, 'claim limits')
    if (product.directions !== undefined) for (const direction of array(product.directions, 'directions')) validateDirection(record(direction, 'direction'), kind, form)
    if (!kind.endsWith('accessory')) {
      text(identity.brand, 'chemical brand')
      date(identity.sourceRevision, 'chemical source revision')
      if (!identity.gtin14 && !identity.sourceProductId && !identity.materialNumber) fail('chemical identity has no source/pack identifier')
      const chemistry = record(product.chemistry, 'chemistry')
      shape(chemistry, ['disclosedEnzymes', 'lipase', 'fragranceDisclosed', 'phosphates', 'sourceIds', 'boundary', 'category', 'dyeDisclosed', 'measuredPh', 'activeClass', 'bleach', 'oxygenBleachDisclosed', 'enzymesDisclosed', 'absenceBoundary', 'opticalBrighteners', 'enzymes', 'opticalBrighteningAgentDisclosed'], ['sourceIds'])
      for (const [name, value] of Object.entries(chemistry)) {
        if (['fragranceDisclosed', 'dyeDisclosed', 'oxygenBleachDisclosed', 'enzymesDisclosed', 'opticalBrighteningAgentDisclosed'].includes(name)) {
          if (typeof value !== 'boolean') fail(`invalid ${name}`)
        } else if (['disclosedEnzymes', 'enzymes', 'sourceIds'].includes(name)) strings(value, name)
        else if (name === 'measuredPh') { if (value !== null) fail('unreviewed pH calibration') }
        else text(value, name, 2000)
      }
      if (!product.directions || array(product.directions, 'directions').length === 0) fail('chemical directions missing')
      if (Array.isArray(product.ingredients)) {
        if (!product.ingredients.length) fail('empty ingredients')
        for (const value of product.ingredients) {
          const ingredient = record(value, 'ingredient')
          shape(ingredient, ['name', 'functionAsRecorded', 'casAsRecorded', 'sourceId', 'designatedListsAsRecorded'], ['name', 'functionAsRecorded', 'casAsRecorded', 'sourceId'])
          text(ingredient.name, 'ingredient name', 300)
          key(ingredient.sourceId, 'ingredient source')
          if (ingredient.casAsRecorded !== null) text(ingredient.casAsRecorded, 'recorded CAS', 300)
          if (ingredient.functionAsRecorded !== null) text(ingredient.functionAsRecorded, 'ingredient function', 300)
        }
      } else {
        const ingredients = record(product.ingredients, 'ingredients')
        for (const name of ['active', 'intentionallyAdded', 'fragranceComponents', 'nonFunctionalConstituents']) strings(ingredients[name], name)
        key(ingredients.sourceId, 'ingredient source')
      }
      if (product.restrictions !== undefined) for (const value of array(product.restrictions, 'restrictions')) {
        const restriction = record(value, 'restriction')
        shape(restriction, ['rule', 'sourceIds'], ['rule', 'sourceIds'])
        text(restriction.rule, 'restriction', 2000)
      }
      if (product.handling !== undefined) {
        const handling = record(product.handling, 'handling')
        shape(handling, ['hazards', 'precautions', 'hazardsNotSpecified', 'storage', 'solutionStorage', 'dryStorage', 'presoakStorage', 'sourceIds'], ['sourceIds'])
        for (const [name, value] of Object.entries(handling)) {
          if (['hazards', 'precautions', 'storage', 'sourceIds'].includes(name)) strings(value, name)
          else text(value, name, 2000)
        }
      }
    }
  }
  for (const value of array(packet.compatibilityFindings, 'compatibility findings')) {
    const finding = record(value, 'compatibility finding')
    const ids = strings(finding.products, 'compatibility products')
    if (ids.length < 2 || ids.some((id) => !productIds.has(id) && id !== 'oxygen_bleach_or_chlorine_bleach')) fail('unknown compatibility product')
    text(finding.finding, 'compatibility finding', 2000)
    if (!['recorded_prohibition', 'route_specific', 'compatibility_not_established_by_selected_instructions', 'compatibility_not_established_by_recorded_instructions', 'allowed_category_with_conditions'].includes(String(finding.status))) fail('unsupported compatibility status')
  }
  for (const value of array(packet.retrievalLimits, 'retrieval limits')) {
    const limit = record(value, 'retrieval limit')
    if (!productIds.has(String(limit.productId))) fail('unknown unavailable-source product')
    publicUrl(limit.sourceUrl)
    text(limit.status, 'unavailable status', 1000)
    if (limit.type !== 'SDS') fail('unsupported unavailable source type')
  }

  // Bind actual attributed facts, not just paths/names. Equal SHA values never
  // replace source IDs or identity reconciliation.
  const sourceFacts = new Map<string, { path: string; value: Json }[]>()
  for (const id of available) sourceFacts.set(id, [])
  function capture(value: Json, path: string): void {
    if (Array.isArray(value)) { value.forEach((child, index) => capture(child, `${path}[${index}]`)); return }
    if (value === null || typeof value !== 'object') return
    const direct = value.sourceIds !== undefined ? strings(value.sourceIds, 'source IDs') : value.sourceId !== undefined ? [String(value.sourceId)] : []
    for (const id of direct) sourceFacts.get(id)!.push({ path, value: withoutRefs(value) })
    for (const [name, child] of Object.entries(value)) if (!['sourceId', 'sourceIds'].includes(name)) capture(child, `${path}.${name}`)
  }
  for (const product of products) {
    const context = Object.fromEntries(Object.entries(product).filter(([name]) => !['ingredients', 'directions', 'restrictions', 'handling', 'chemistry', 'fragranceComponents', 'generalGuidance', 'lotCodeGuide'].includes(name)))
    sourceFacts.get(String(product.ownerReferenceSourceId))!.push({ path: `products.${product.id}.referenceContext`, value: context })
    capture(product, `products.${product.id}`)
  }
  capture(packet.compatibilityFindings, 'compatibilityFindings')
  capture(packet.contextOnly, 'contextOnly')
  const sources = new Map<string, Source>()
  for (const [id, source] of sourceMap) {
    const snapshot = canonicalOwnerEvidence({ source, facts: sourceFacts.get(id), boundary: 'Authored factual summary from saved research, not a captured provider document or independent re-verification.' })
    if (snapshot.length > 20000) fail(`source ${id} exceeds importer snapshot limit`)
    sources.set(id, { id, url: publicUrl(source.url), retrievedAt: String(source.retrievedAt), provider: String(source.publisher),
      ...(source.sourceUpdatedAt === null ? {} : { sourceUpdatedAt: String(source.sourceUpdatedAt) }), snapshot, snapshotKind: 'factual_summary',
      permission: 'Owner-authorized offline factual summary of completed public-reference research for local review. No provider source text retained; no automatic retrieval or commercial redistribution permission asserted.' })
  }
  const entries: OwnerCatalogEntry[] = []
  const records: ReviewRecord[] = []
  for (const product of products.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const id = String(product.id)
    const identity = record(product.identity, 'identity')
    const unresolved: ReviewFact[] = []
    const quarantinedIdentifiers: ReviewFact[] = []
    function unknowns(value: Json, path: string): void {
      if (value === null) { unresolved.push({ path, value, reason: 'not_established_by_recorded_evidence' }); return }
      if (Array.isArray(value)) { value.forEach((child, index) => unknowns(child, `${path}[${index}]`)); return }
      if (typeof value !== 'object') return
      if (typeof value.casAsRecorded === 'string') for (const cas of value.casAsRecorded.split(';').map((part) => part.trim())) {
        if (!/^\d{2,7}-\d{2}-\d$/.test(cas)) continue
        const digits = cas.replaceAll('-', '').split('').map(Number)
        const check = digits.pop()!
        if (digits.reverse().reduce((sum, digit, index) => sum + digit * (index + 1), 0) % 10 !== check) quarantinedIdentifiers.push({ path: `${path}.casAsRecorded`, value: cas, reason: 'invalid_cas_checksum' })
      }
      for (const [name, child] of Object.entries(value)) unknowns(child, path ? `${path}.${name}` : name)
    }
    unknowns(product, '')
    for (const [index, value] of array(product.missing, 'missing fields').entries()) unresolved.push({ path: `missing[${index}]`, value, reason: 'requires_review_or_context_confirmation' })
    const accessory = String(product.kind).endsWith('accessory')
    if (accessory) unresolved.push({ path: product.generalGuidance ? 'generalGuidance' : 'directions', value: product.generalGuidance ?? product.directions, reason: 'accessory_context_not_a_chemical_catalog_entry' })
    const variantKey = accessory ? null : `owner-reference:${id}:us`
    records.push({ recordId: id, identitySha256: identityDigest(product), entryVariantKey: variantKey, unresolved, quarantinedIdentifiers,
      sourceIssues: product.sourceIssues ?? [], corrections: product.previousCorrection ?? null })
    if (accessory) continue
    const claims: Claim[] = []
    const conditions = [boundary, identity.sourceStatus, ...(product.claimLimits === undefined ? [] : strings(product.claimLimits, 'claim limits'))].filter((item) => item !== undefined).join(' ')
    if (conditions.length > 1000) fail('claim scope exceeds importer limit')
    const add = (claimId: string, field: string, value: Claim['value'], ids: string[], scope = ''): void => {
      if (!ids.length || (typeof value === 'string' && (!value || value.length > 2000)) || (Array.isArray(value) && (!value.length || value.length > 100 || value.some((item) => !item || item.length > 300)))) fail(`claim ${id}.${claimId} exceeds importer bounds`)
      const scoped = `${conditions}${scope ? ` ${scope}` : ''}`
      if (scoped.length > 1000) fail('claim scope exceeds importer limit')
      claims.push({ id: claimId, key: field, value, sourceIds: [...new Set(ids)].sort(), conditions: scoped })
    }
    add('function', 'function', `${product.kind}; ${product.form}`, [String(product.ownerReferenceSourceId)], 'Operational category candidate; no efficacy or compatibility claim.')
    if (Array.isArray(product.ingredients)) {
      add('ingredients', 'ingredients', product.ingredients.map((value) => String(record(value, 'ingredient').name)), refs(product.ingredients, available), 'Names as disclosed; omissions are not verified absence. CAS joins are not authorized.')
    } else {
      const ingredients = record(product.ingredients, 'ingredients')
      for (const name of ['active', 'intentionallyAdded', 'fragranceComponents', 'nonFunctionalConstituents']) add(`ingredients-${name.toLowerCase()}`, 'ingredients', strings(ingredients[name], name), [String(ingredients.sourceId)], `Disclosure category: ${name}; names only, no inferred concentrations or chemical entity joins.`)
    }
    const chemistry = record(product.chemistry, 'chemistry')
    if (chemistry.lipase === 'not listed in the retrieved disclosure; absence not independently established') add('lipase', 'lipaseDisclosure', 'not_listed', refs(chemistry, available), 'Not listed in this disclosure; absence not independently established.')
    for (const [index, value] of array(product.directions, 'directions').entries()) {
      const direction = record(value, 'direction')
      const route = String(direction.route)
      if (direction.paksPerWaterVolume === null) {
        unresolved.push({ path: `directions[${index}]`, value: direction, reason: 'presoak_ratio_unavailable_no_importable_dose_instruction' })
        continue
      }
      add(`directions-${route.replaceAll('_', '-')}-${index}`, 'directions', canonicalOwnerEvidence(withoutRefs(direction)), refs(direction, available), `Recorded route ${route}${direction.scope ? `; ${direction.scope}` : ''}. Preserve native marks/counts and unspecified quantities.`)
      if (route === 'rinse_sanitization') add('rinse-minimum-contact', 'rinseMinimumContactMinutes', Number(direction.minimumContactMinutes), refs(direction, available), 'Rinse sanitization only; machine contact evidence remains unresolved, separate from a presoak.')
    }
    if (product.restrictions !== undefined) for (const [index, value] of array(product.restrictions, 'restrictions').entries()) {
      const restriction = record(value, 'restriction')
      add(`restriction-${index}`, 'restrictions', String(restriction.rule), refs(restriction, available), `Restriction ${index + 1}, source-specific; no stage-separation exception inferred.`)
    }
    if (product.handling !== undefined) {
      const handling = record(product.handling, 'handling')
      add('handling', 'restrictions', canonicalOwnerEvidence(withoutRefs(handling)), refs(handling, available), 'Recorded handling/storage precautions; no unavailable SDS classification inferred.')
    }
    const ids = refs(product, available)
    const packIdentifier = identity.gtin14 ? `gtin14:${identity.gtin14}` : identity.sourceProductId ? `source-product-id:${identity.sourceProductId}` : `material-number:${identity.materialNumber}`
    for (const claim of claims) {
      if (claims.some((other) => other !== claim && other.key === claim.key && other.conditions === claim.conditions && canonicalOwnerEvidence(other.value) !== canonicalOwnerEvidence(claim.value))) fail(`claim scope conflict for ${id}.${claim.key}`)
    }
    entries.push({ product: { key: key(`owner-reference:${id}`, 'catalog product key'), kind: 'product', brand: String(identity.brand), name: String(product.name) },
      variant: { key: key(variantKey!, 'catalog variant key'), name: String(product.name), market: 'US', packIdentifier: text(packIdentifier, 'catalog pack identifier') }, labelRevision: String(identity.sourceRevision),
      retrieverVersion: 'saved-owner-research-2026-10-04', extractorVersion: ownerProductEvidenceCompilerVersion,
      sources: ids.map((sourceId) => sources.get(sourceId)!), claims: claims.sort((a, b) => a.id.localeCompare(b.id)) })
  }
  // Normalize key order before binding because the importer hashes JSON.stringify(entry).
  const normalizedEntries: OwnerCatalogEntry[] = JSON.parse(canonicalOwnerEvidence(entries))
  const result: OwnerProductEvidenceManifest = { schemaVersion: 1,
    extraction: { version: ownerProductEvidenceCompilerVersion, inputSha256: sha256(canonical), reviewStatus: 'unreviewed_candidates' },
    entries: normalizedEntries, entryBindings: normalizedEntries.map(binding),
    review: { acceptedClaimIds: [], records,
      contextSources: [...sources.values()].filter((source) => !normalizedEntries.some((entry) => entry.sources.some((captured) => captured.id === source.id))).sort((a, b) => a.id.localeCompare(b.id)),
      compatibilityFindings: packet.compatibilityFindings, contextOnly: packet.contextOnly, retrievalLimits: packet.retrievalLimits } }
  if (previous !== undefined) {
    const prior = record(JSON.parse(canonicalOwnerEvidence(previous)), 'previous manifest')
    if (prior.schemaVersion !== 1 || record(prior.extraction, 'previous extraction').version !== ownerProductEvidenceCompilerVersion) fail('unsupported previous compiler version')
    const priorEntries = array(prior.entries, 'previous entries')
    const priorBindings = array(prior.entryBindings, 'previous bindings')
    if (priorEntries.length !== priorBindings.length) fail('previous binding conflict')
    for (const value of priorEntries) {
      const item = value as unknown as OwnerCatalogEntry
      const expected = binding(item)
      if (priorBindings.filter((candidate) => record(candidate, 'binding').variantKey === item.variant.key).length !== 1
        || !priorBindings.some((candidate) => canonicalOwnerEvidence(candidate) === canonicalOwnerEvidence(expected))) fail('previous digest binding conflict')
    }
    const priorRecords = array(record(prior.review, 'previous review').records, 'previous records').map((value) => record(value, 'previous record'))
    if (new Set(priorRecords.map((value) => value.recordId)).size !== priorRecords.length) fail('previous identity reconciliation conflict')
    for (const current of records) {
      const old = priorRecords.find((value) => value.recordId === current.recordId)
      if (old && (old.identitySha256 !== current.identitySha256 || old.entryVariantKey !== current.entryVariantKey)) fail(`identity reconciliation conflict for ${current.recordId}; use a distinct reference ID`)
      const oldEntry = priorEntries.find((value) => record(record(value, 'entry').product, 'product').key === `owner-reference:${current.recordId}`)
      const nextEntry = normalizedEntries.find((value) => value.variant.key === current.entryVariantKey)
      if (oldEntry && nextEntry && (canonicalOwnerEvidence(record(oldEntry, 'entry').product) !== canonicalOwnerEvidence(nextEntry.product)
        || canonicalOwnerEvidence(record(oldEntry, 'entry').variant) !== canonicalOwnerEvidence(nextEntry.variant))) fail('public identity reconciliation conflict')
    }
  }
  return result
}

import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// Deterministic extraction of the repository's authored research archive, not a web scraper.
const [inputPath, outputPath] = process.argv.slice(2)
if (!inputPath || !outputPath) throw new Error('Usage: catalog-extract.mjs research-archive.json output-manifest.json')
const bytes = await readFile(inputPath)
const archive = JSON.parse(bytes)
if (archive.schemaVersion !== 1 || archive.scope !== 'public_catalog_only' || archive.extraction?.version !== 'fixture-research-v1') throw new Error('Unsupported public research archive')
const inputHash = createHash('sha256').update(bytes).digest('hex')
const entries = [], excluded = []
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const claim = (id, key, value, conditions) => ({ id, key, value, sourceIds: ['research-summary'], conditions })
function entry(product, variant, labelRevision, url, summary, claims, sourceUpdatedAt) {
  return {
    product, variant, labelRevision,
    retrieverVersion: `recorded-primary-research-${archive.extraction.reviewedAt}`,
    extractorVersion: 'washcloset-research-import-v1',
    sources: [{ id: 'research-summary', url, retrievedAt: archive.extraction.reviewedAt,
      provider: `${product.brand} research summary`, ...(sourceUpdatedAt == null ? {} : { sourceUpdatedAt }),
      snapshot: `${summary}\nAuthored research archive SHA-256: ${inputHash}. Full provider document was not captured.`,
      snapshotKind: 'factual_summary', permission: 'Authored factual summary of recorded primary-source research; no full provider text retained.' }],
    claims,
  }
}
for (const garment of archive.garments) {
  for (const variant of garment.variants) {
    if (variant.materialClaim === null) {
      excluded.push({ kind: 'garment', name: `${garment.invoiceAlias} ${variant.color}`, reason: garment.limitation ?? 'Composition unresolved' })
      continue
    }
    const conditions = [variant.color, garment.market, garment.limitation ?? 'Catalog revision is not proof of the purchased item.', 'Confirm actual label and variant; no garment mass or fit inferred.'].join(' · ')
    entries.push(entry(
      { key: variant.reference.productId, kind: 'garment', brand: 'AS Colour', name: garment.invoiceAlias },
      { key: variant.reference.variantId, name: variant.color, market: garment.market, packIdentifier: `${garment.invoiceAlias.split(' ')[0]}:${variant.color}` },
      variant.reference.evidenceRevisionId, garment.source,
      `${garment.invoiceAlias}, ${variant.color}: recorded material candidate ${variant.materialClaim}. ${conditions}`,
      [claim('material', 'material', variant.materialClaim, conditions)],
    ))
  }
}
for (const [model, facts] of Object.entries(archive.machines.exactModelCandidates)) {
  const conditions = 'Recorded brochure candidate; confirm actual model and manual revision. Drum volume does not establish a measured garment load or rinse contact time.'
  entries.push(entry(
    { key: `speed-queen-${slug(model)}`, kind: 'machine', brand: 'Speed Queen', name: model },
    { key: `speed-queen-${slug(model)}-us`, name: model, market: 'US', packIdentifier: model },
    facts.revision, facts.source, `${model}: brochure ${facts.revision}, drum volume ${facts.drumVolumeCuFt} cu ft. ${conditions}`,
    [claim('model', 'model', model, conditions), claim('drum-volume', 'drumVolumeCuFt', facts.drumVolumeCuFt, conditions)],
  ))
}
excluded.push({ kind: 'machine', name: archive.machines.familyCertification.modelPattern, reason: 'Family certification is not an exact model or brochure match.' })
const tide = archive.products.products.find((product) => product.fixtureKey === 'tide-ultra-concentrate')
for (const candidate of tide.candidates) {
  const conditions = 'Recorded SmartLabel candidate for this exact market/pack/revision only. Not confirmed as an owned pack; enzyme omission is not verified absence.'
  const claims = [claim('ingredients', 'ingredients', candidate.disclosedEnzymes, conditions), claim('lipase', 'lipaseDisclosure', 'not_listed', conditions)]
  if (candidate.dose !== null) claims.push(claim('directions', 'directions', `Medium: ${candidate.dose.medium}; large: ${candidate.dose.large}; HE full: ${candidate.dose.heFull}. ${candidate.doseLimit}`, conditions))
  entries.push(entry(
    { key: 'tide-original-liquid', kind: 'product', brand: 'Tide', name: 'Tide Original liquid' },
    { key: `tide-${candidate.providerId}-us`, name: candidate.name, market: 'US', packIdentifier: candidate.providerId },
    candidate.sourceUpdatedAt, candidate.sourceUrl,
    `${candidate.name}: disclosed enzymes ${candidate.disclosedEnzymes.join(', ')}; lipase not listed. ${candidate.doseLimit} ${conditions}`,
    claims, candidate.sourceUpdatedAt,
  ))
}
for (const product of archive.products.products.filter((product) => product.fixtureKey !== 'tide-ultra-concentrate')) excluded.push({ kind: 'product', name: product.fixtureKey, reason: `Exact identity unresolved: ${product.matchStatus}` })
const manifest = { schemaVersion: 1, extraction: { version: 'washcloset-research-import-v1', inputSha256: inputHash, inputVersion: archive.extraction.version, reviewStatus: 'unreviewed_candidates' }, entries, excluded }
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
process.stdout.write(`${JSON.stringify({ entries: entries.length, excluded: excluded.length, inputSha256: inputHash, reviewStatus: 'unreviewed_candidates' })}\n`)

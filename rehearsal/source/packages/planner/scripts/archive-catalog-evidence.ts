/** Archive our public, manually extracted research for reproducible reprocessing.
 * This does not fetch manufacturer pages, authorize their republication, or accept care facts.
 * Run: node --experimental-strip-types packages/planner/scripts/archive-catalog-evidence.ts
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { fixtureCatalogReviewedAt, invoiceCatalogMaterials, invoiceCatalogReference,
  roomMachineCatalog, frontLoaderCertification } from '../src/fixture-catalog.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const productsPath = resolve(root, 'docs/research/2026-10-03-product-source-candidates.json')
const output = resolve(root, 'docs/research/evidence')
const rawProducts = await readFile(productsPath, 'utf8')
const products = JSON.parse(rawProducts)
if (products.schemaVersion !== 1 || products.ingestionBoundary.householdWrites !== false
  || !Array.isArray(products.products) || products.products.length !== 6) {
  throw new Error('Expected the public six-product candidate research, without household writes')
}
const hash = (content: string) => createHash('sha256').update(content).digest('hex')
const payload = {
  schemaVersion: 1,
  extraction: { kind: 'manual_research', version: 'fixture-research-v1', reviewedAt: fixtureCatalogReviewedAt,
    sourceDocumentSnapshots: 'not_captured', sourceReusePermission: 'not_evaluated',
    inputFile: 'docs/research/2026-10-03-product-source-candidates.json', inputSha256: hash(rawProducts) },
  factsStatus: 'candidate', scope: 'public_catalog_only',
  garments: Object.entries(invoiceCatalogMaterials).map(([invoiceAlias, entry]) => ({
    invoiceAlias, source: entry.source, market: entry.market, limitation: entry.limitation ?? null,
    variants: Object.entries(entry.materials).map(([color, materialClaim]) => ({ color, materialClaim,
      reference: invoiceCatalogReference(invoiceAlias, color) })),
  })),
  machines: { exactModelCandidates: roomMachineCatalog, familyCertification: frontLoaderCertification },
  products,
}
const serialized = `${JSON.stringify(payload, null, 2)}\n`
const contentHash = hash(serialized)
await mkdir(output, { recursive: true })
const path = resolve(output, `${contentHash}.json`)
try { await writeFile(path, serialized, { flag: 'wx' }) }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  if (await readFile(path, 'utf8') !== serialized) throw new Error('Existing evidence content does not match its hash; refusing replacement')
}
console.log(JSON.stringify({ path, sha256: contentHash, garments: payload.garments.length,
  productCandidates: products.products.length, sourcePagesFetched: 0, householdWrites: 0 }))

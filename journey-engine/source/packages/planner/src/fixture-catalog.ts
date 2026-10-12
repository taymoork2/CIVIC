import { sha256 } from './index.ts'

/** Manually researched catalog candidates, not confirmation of the owner's labels.
 * Keep exact invoice names/colors: an unlisted variant must remain unknown.
 * Source limitations and unresolved identities are in docs/plans/2026-10-03-fixture-research.md.
 */
export const fixtureCatalogReviewedAt = '2026-10-03'

interface CatalogMaterial {
  readonly source: string
  readonly market: string
  readonly materials: Readonly<Record<string, string | null>>
  readonly limitation?: string
}

export const invoiceCatalogMaterials: Readonly<Record<string, CatalogMaterial>> = {
  '5001R Staple Raglan Tee': {
    source: 'https://www.ascolour.com.au/content/pricelist_pdf/chrome_4613.pdf',
    market: 'AU',
    materials: { White: 'cotton', Black: 'cotton' },
    limitation: 'Regional catalog candidate; the US outlet now uses SKU 5001RS.',
  },
  '5009 Ink LS Tee': {
    source: 'https://ascolour.com/ink-l-s-tee-5009/',
    market: 'US',
    materials: { Black: 'cotton' },
  },
  '5029 Base LS Tee': {
    source: 'https://ascolour.com/base-l-s-tee-5029/',
    market: 'US',
    materials: { 'Athletic Heather': '85% cotton, 15% viscose', Navy: 'cotton' },
    limitation: 'Model catalog states heathers contain 15% viscose; historical colors need label confirmation.',
  },
  '5056 General LS Tee': {
    source: 'https://ascolour.com/mens-general-l-s-tee-5056/',
    market: 'US',
    materials: { 'Athletic Heather': null },
    limitation: 'Older manufacturer price list states heathers contain 15% viscose; current page states cotton and lists only White/Black. Do not resolve that revision conflict by guessing.',
  },
  "5121 Men's Premium Crew": {
    source: 'https://ascolour.co.uk/content/UK_DIRECT_PRICE_LIST.pdf',
    market: 'UK',
    materials: { 'Athletic Heather': 'cotton', Black: 'cotton' },
    limitation: 'Indexed historical 5121 catalog lists cotton French terry; US outlet now uses 5121S. Historical PDF is no longer directly retrievable.',
  },
  '5145 Heavy Crew': {
    source: 'https://ascolour.com/mens-heavy-crew-5145/',
    market: 'US',
    materials: { Sand: '80% cotton, 20% polyester' },
    limitation: 'Current revision specifies recycled polyester and does not list Sand; do not infer recycled content for the older purchase.',
  },
  '5910 Court Shorts': {
    source: 'https://ascolour.com/mens-court-shorts-5910/',
    market: 'US',
    materials: { White: 'polyester' },
    limitation: 'Model composition is polyester; White is not in the current color range.',
  },
  '5917 Surplus Track Pants': {
    source: 'https://ascolour.com/mens-surplus-track-pants-5917/',
    market: 'US',
    materials: { White: '80% cotton, 20% polyester', 'White Heather': '80% cotton, 20% polyester' },
    limitation: 'Model composition is cotton/polyester fleece; invoice colors are not in the current color range.',
  },
}

export function invoiceCatalogMaterial(name: string, color: string): string | null {
  return invoiceCatalogMaterials[name]?.materials[color] ?? null
}

/** Registry-assigned IDs, never hashes of mutable titles or universal manufacturer codes.
 * These identify our candidate records, not an exact purchase revision or physical garment.
 * Size and historical product revision remain unmatched. Do not recycle IDs when correcting facts.
 */
const invoiceCatalogIds: Readonly<Record<string, { productId: string; variants: Readonly<Record<string, string>> }>> = {
  '5001R Staple Raglan Tee': { productId: 'garment-product-0001', variants: { White: 'garment-variant-0001', Black: 'garment-variant-0002' } },
  '5009 Ink LS Tee': { productId: 'garment-product-0002', variants: { Black: 'garment-variant-0003' } },
  '5029 Base LS Tee': { productId: 'garment-product-0003', variants: { 'Athletic Heather': 'garment-variant-0004', Navy: 'garment-variant-0005' } },
  '5056 General LS Tee': { productId: 'garment-product-0004', variants: { 'Athletic Heather': 'garment-variant-0006' } },
  "5121 Men's Premium Crew": { productId: 'garment-product-0005', variants: { 'Athletic Heather': 'garment-variant-0007', Black: 'garment-variant-0008' } },
  '5145 Heavy Crew': { productId: 'garment-product-0006', variants: { Sand: 'garment-variant-0009' } },
  '5910 Court Shorts': { productId: 'garment-product-0007', variants: { White: 'garment-variant-0010' } },
  '5917 Surplus Track Pants': { productId: 'garment-product-0008', variants: { White: 'garment-variant-0011', 'White Heather': 'garment-variant-0012' } },
}

export function invoiceCatalogReference(name: string, color: string) {
  const entry = invoiceCatalogMaterials[name]
  const ids = invoiceCatalogIds[name]
  const variantId = ids?.variants[color]
  if (entry === undefined || ids === undefined || variantId === undefined) return undefined
  return { brandId: 'garment-brand-0001', productId: ids.productId, variantId,
    evidenceRevisionId: `sha256:${sha256(JSON.stringify({ schemaVersion: 1, reviewedAt: fixtureCatalogReviewedAt, productId: ids.productId, entry }))}`,
    source: entry.source, market: entry.market, reviewedAt: fixtureCatalogReviewedAt, status: 'candidate' as const }
}

/** Manufacturer-authored brochures list these exact models. Capacity is per drum,
 * not garment packing units or a guarantee that the household enabled every cycle.
 */
export const roomMachineCatalog = {
  SWNNX2HP115TW01: {
    source: 'https://www.cleandesigns.com/brochures/products/73/SWNNC2HP115TW01.pdf',
    revision: 'AM19-0005 (2019)',
    drumVolumeCuFt: 2.83,
    ratedDryLoadLb: 14,
    maximumSpinRpm: 710,
  },
  SSGNCFGW113TW01: {
    source: 'https://assets.ajmadison.com/ajmadison/itemdocs/SSENCFGW173TW01-spec_sheet.pdf',
    revision: 'AM16-0063 (2016)',
    drumVolumeCuFt: 7,
    ratedDryLoadLb: 18,
    /** Dryer exhaust temperature per heat button, in F: the only source of a button's temperature.
     * Factory defaults from Speed Queen / Alliance Laundry manual D514575ENR11
     * (https://docs.alliancelaundry.com/tech_pdf/Production/D514575en.pdf, the current unrevised file).
     * An operator can reprogram them (100-160 F), so they are the documented default, not a reading.
     * Keys are the planner's DryerHeat values; no_heat has no temperature.
     */
    heatTempsF: { delicate: 115, low: 145, medium: 155, high: 160 },
  },
} as const

/** The documented exhaust temperature of one dryer button on an exact catalog model; undefined when the model or button is not documented. */
export function documentedHeatTempF(model: string | undefined, heat: string): number | undefined {
  if (model === undefined || !Object.hasOwn(roomMachineCatalog, model)) return undefined
  const temps: Readonly<Record<string, number>> | undefined = (roomMachineCatalog as Readonly<Record<string, { readonly heatTempsF?: Readonly<Record<string, number>> }>>)[model]?.heatTempsF
  return temps !== undefined && Object.hasOwn(temps, heat) ? temps[heat] : undefined
}

/** This wildcard certification matches the recorded front-loader's model family,
 * not an exact-model manual. Preserve the separate owner-reported 3.42 cu ft.
 */
export const frontLoaderCertification = {
  source: 'https://www.energystar.gov/productfinder/product/certified-commercial-clothes-washers/details/3477973/export/pdf/download',
  certificationId: '3477973',
  modelPattern: 'SFNN****115T***',
  market: 'US',
  drumVolumeCuFt: 3.4,
  match: 'model_family',
} as const

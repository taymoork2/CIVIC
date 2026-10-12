import { v, type Infer } from 'convex/values'

/**
 * Household water hardness (dose plan P1, docs/plans/2026-10-06-dose-intelligence-plan.md).
 * Pure: the backend classifies with it on save and for the planner input, and the Water sheet reads
 * the same ZIPs and areas. Nothing here changes a dose yet; no catalog rule can be keyed on water.
 */

export const waterBands = ['soft', 'moderate', 'hard', 'very_hard', 'unknown'] as const
export type WaterBand = typeof waterBands[number]
export const waterSources = ['lookup', 'strip', 'utility_report', 'softener', 'unknown'] as const
export type WaterSource = typeof waterSources[number]
export type WaterUtility = 'ebmud' | 'not_listed' | 'well'
export type ReadingUnit = 'gpg' | 'mg_l'

/** `reportYear` is the edition of a water report a number came from; required for that source. */
const reading = v.object({ value: v.number(), unit: v.union(v.literal('gpg'), v.literal('mg_l')), reportYear: v.optional(v.number()) })

/** What a household saved: its answers as typed (ZIP only, never coordinates) and the result at that moment. */
export const householdWater = v.object({
  zip: v.optional(v.string()),
  utility: v.optional(v.union(v.literal('ebmud'), v.literal('not_listed'), v.literal('well'))),
  area: v.optional(v.string()),
  source: v.union(...waterSources.map((source) => v.literal(source))),
  reading: v.optional(reading),
  /** The hardness the band was read from, as CaCO3 in mg/L; absent when not known. */
  mgL: v.optional(v.number()),
  band: v.union(...waterBands.map((band) => v.literal(band))),
  setAt: v.number(),
})
export type HouseholdWater = Infer<typeof householdWater>
export type WaterAnswers = Omit<HouseholdWater, 'mgL' | 'band'>

/** USGS Water Science School, "Hardness of Water" (S23): 0–60 soft, 61–120 moderately hard, 121–180 hard, over 180 very hard. */
export function bandOf(mgL: number): Exclude<WaterBand, 'unknown'> {
  return mgL <= 60 ? 'soft' : mgL <= 120 ? 'moderate' : mgL <= 180 ? 'hard' : 'very_hard'
}

/** EBMUD's own conversion (2025 WQR footnote R): 1 grain per gallon = 17 mg/L. */
export const mgLOf = (value: number, unit: ReadingUnit) => unit === 'gpg' ? value * 17 : value

type PlantId = 'walnut_creek' | 'lafayette' | 'orinda' | 'sobrante' | 'upper_san_leandro' | 'san_pablo'

/**
 * EBMUD (PWSID CA0110005), 2025 Annual Water Quality Report, https://www.ebmud.com/wqr, retrieved
 * 2026-10-06, PDF SHA-256 ec2834db9dfc1b16457ac4473c3f7e8ff1d98e994403585a2c4b630bdcca9af6.
 * Table 4 "Hardness as CaCO3" (ppm = mg/L; gpg from footnote R is rounded, so mg/L is the value of record).
 * Page 3 map legend: "YEAR-ROUND OPERATION: Orinda, Walnut Creek"; "SEASONAL OPERATION: Lafayette,
 * Sobrante, Upper San Leandro, San Pablo". Footnote M: "San Pablo Water Treatment plant was out of
 * service in 2025", so it has no figure and can never make an area soft.
 * Context only, never a band: the live data page on 9/1/2026 read Orinda, Lafayette and Walnut Creek
 * 16 mg/L and Sobrante 64 mg/L, with Upper San Leandro and San Pablo out of service.
 */
export const ebmud = {
  pwsid: 'CA0110005',
  name: 'EBMUD',
  reportYear: 2025,
  url: 'https://www.ebmud.com/wqr',
  sha256: 'ec2834db9dfc1b16457ac4473c3f7e8ff1d98e994403585a2c4b630bdcca9af6',
  plants: {
    walnut_creek: { name: 'Walnut Creek', operation: 'year_round', mgL: [15, 21] },
    lafayette: { name: 'Lafayette', operation: 'seasonal', mgL: [14, 27] },
    orinda: { name: 'Orinda', operation: 'year_round', mgL: [14, 40] },
    sobrante: { name: 'Sobrante', operation: 'seasonal', mgL: [64, 98] },
    upper_san_leandro: { name: 'Upper San Leandro', operation: 'seasonal', mgL: [140, 160] },
    san_pablo: { name: 'San Pablo', operation: 'seasonal', mgL: null },
  } satisfies Record<PlantId, { name: string; operation: 'year_round' | 'seasonal'; mgL: readonly [number, number] | null }>,
} as const

const westCounty: PlantId[] = ['orinda', 'sobrante']
const eastBay: PlantId[] = ['orinda', 'upper_san_leandro']
const lamorinda: PlantId[] = ['walnut_creek', 'lafayette']
/**
 * Town → every plant that can serve it, from the 2025 WQR page-3 map legend ("regions shown in more
 * than one color or pattern may be served from a different treatment plant"). Orinda's area: West
 * County towns "also served as needed by Sobrante WTP"; Piedmont to Hayward "also served as needed by
 * Upper San Leandro WTP". Walnut Creek's area: Orinda to Walnut Creek "also served as needed by
 * Lafayette WTP". Castro Valley sits on both lists, so it keeps Upper San Leandro.
 * Albany, Berkeley and Emeryville are unbracketed but sit beside the unmapped San Pablo plant; until
 * EBMUD confirms they are Orinda-only, San Pablo stays a possible source and blocks "soft".
 * "Not sure" takes every plant, so the utility-wide maximum of 160 mg/L.
 */
export const ebmudAreas: ReadonlyArray<readonly [id: string, town: string, plants: readonly PlantId[]]> = [
  ['alamo', 'Alamo', ['walnut_creek']],
  ['alameda', 'Alameda', eastBay],
  ['albany', 'Albany', ['orinda', 'san_pablo']],
  ['berkeley', 'Berkeley', ['orinda', 'san_pablo']],
  ['castro_valley', 'Castro Valley', [...eastBay, 'walnut_creek']],
  ['crockett', 'Crockett', westCounty],
  ['danville', 'Danville', ['walnut_creek']],
  ['el_cerrito', 'El Cerrito', westCounty],
  ['el_sobrante', 'El Sobrante', westCounty],
  ['emeryville', 'Emeryville', ['orinda', 'san_pablo']],
  ['hayward', 'Hayward', eastBay],
  ['hercules', 'Hercules', westCounty],
  ['kensington', 'Kensington', westCounty],
  ['lafayette', 'Lafayette', lamorinda],
  ['moraga', 'Moraga', ['orinda', ...lamorinda]],
  ['oakland', 'Oakland', eastBay],
  ['orinda', 'Orinda', ['orinda', ...lamorinda]],
  ['piedmont', 'Piedmont', eastBay],
  ['pinole', 'Pinole', westCounty],
  ['pleasant_hill', 'Pleasant Hill', lamorinda],
  ['richmond', 'Richmond', westCounty],
  ['rodeo', 'Rodeo', westCounty],
  ['san_leandro', 'San Leandro', eastBay],
  ['san_lorenzo', 'San Lorenzo', eastBay],
  ['san_pablo', 'San Pablo', westCounty],
  ['san_ramon', 'San Ramon', ['walnut_creek']],
  ['walnut_creek', 'Walnut Creek', lamorinda],
  ['not_sure', 'Not sure', Object.keys(ebmud.plants) as PlantId[]],
]

/**
 * ZIPs where EBMUD is a candidate bill. EBMUD publishes no ZIP list or lookup; this is an unverified
 * cross-check list from the October 6 research, to be replaced by the EPA CWS boundaries v3 × ZCTA
 * build. It only offers EBMUD as a choice: the person still confirms the bill, and the band comes
 * from the report. Partly-served ZIPs (another utility also serves them) are never preselected.
 */
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => String(from + index))
const ebmudPartlyZips = new Set(['94523', '94541', '94542', '94544', '94545', '94552', '94582', ...range(94595, 94598)])
const ebmudZips = new Set([
  '94501', '94502', '94506', '94507', '94525', '94526', '94528', '94530', '94546', '94547', '94549', '94556',
  '94563', '94564', '94572', '94577', '94578', '94579', '94580', '94583', ...range(94601, 94603), ...range(94605, 94613),
  '94618', '94619', '94621', ...range(94702, 94710), '94720', '94801', ...range(94803, 94806), ...ebmudPartlyZips,
])

export const validZip = (zip: string) => /^\d{5}$/.test(zip)
/** EBMUD as a candidate for this ZIP: 'only' when it is the one bill there, 'partly' when another utility shares it. */
export function ebmudForZip(zip: string): 'only' | 'partly' | null {
  return !ebmudZips.has(zip) ? null : ebmudPartlyZips.has(zip) ? 'partly' : 'only'
}

type Result = { band: WaterBand; mgL?: number }

/** A report older than last year's edition no longer counts. */
export const staleReport = (reportYear: number, now: number) => reportYear < new Date(now).getUTCFullYear() - 1

/**
 * What the ZIP, bill and area say, by the maximum of every plant that can serve the area (decisions 6
 * and 12). A plant with no figure keeps an otherwise soft area unknown. A well, an unlisted bill, an
 * unmatched ZIP, an unknown area or a report older than last year's edition is unknown.
 */
export function lookupWater(answers: Pick<WaterAnswers, 'zip' | 'utility' | 'area'>, now: number): Result {
  if (answers.utility !== 'ebmud' || answers.zip === undefined || ebmudForZip(answers.zip) === null) return { band: 'unknown' }
  if (staleReport(ebmud.reportYear, now)) return { band: 'unknown' }
  const plants = ebmudAreas.find(([id]) => id === answers.area)?.[2]
  if (plants === undefined) return { band: 'unknown' }
  const known = plants.map((plant) => ebmud.plants[plant].mgL).filter((value) => value !== null)
  const mgL = Math.max(...known.map(([, max]) => max))
  const band = bandOf(mgL)
  return band === 'soft' && known.length < plants.length ? { band: 'unknown' } : { band, mgL }
}

/** The household's band: an override always wins over the lookup; a softener counts only through its strip reading. */
export function classifyWater(answers: WaterAnswers, now: number): Result {
  if (answers.source === 'lookup') return lookupWater(answers, now)
  if (answers.source === 'unknown' || answers.reading === undefined) return { band: 'unknown' }
  const mgL = mgLOf(answers.reading.value, answers.reading.unit)
  return { band: bandOf(mgL), mgL }
}

const day = 24 * 60 * 60 * 1000

/**
 * The planner's water condition: 'soft' only while it still holds. Where a harder plant can serve the
 * area (or the area is unknown), only a strip unlocks it, for 30 days; a softener's strip lasts 6
 * months (decisions 10 and 12; both windows are settings, not sourced figures). A water report's
 * number counts only from last year's edition or newer, like the lookup.
 */
export function qualifyingWaterCondition(water: HouseholdWater | undefined, now: number): 'soft' | undefined {
  if (water === undefined || classifyWater(water, now).band !== 'soft') return undefined
  const lookupSoft = lookupWater(water, now).band === 'soft'
  const age = now - water.setAt
  const holds = water.source === 'lookup' ? true
    : water.source === 'softener' ? age <= 180 * day
    : water.source === 'strip' ? lookupSoft || age <= 30 * day
    : (lookupSoft || water.utility !== 'ebmud') && water.reading?.reportYear !== undefined && !staleReport(water.reading.reportYear, now)
  return holds ? 'soft' : undefined
}

/**
 * When a qualifying soft condition ends without any new write: the first strip, softener or report
 * window edge after `now` at which `qualifyingWaterCondition` stops saying soft. Undefined when the
 * water is not soft now, or stays soft with no end in sight. Every condition only lapses with time,
 * so the earliest failing edge is the end.
 */
export function softUntil(water: HouseholdWater | undefined, now: number): number | undefined {
  if (water === undefined || qualifyingWaterCondition(water, now) !== 'soft') return undefined
  const firstStale = (reportYear: number) => Date.UTC(reportYear + 2, 0, 1)
  const edges = [water.setAt + 30 * day + 1, water.setAt + 180 * day + 1, firstStale(ebmud.reportYear),
    ...(water.reading?.reportYear === undefined ? [] : [firstStale(water.reading.reportYear)])]
  return edges.filter((edge) => edge > now).sort((left, right) => left - right).find((edge) => qualifyingWaterCondition(water, edge) !== 'soft')
}

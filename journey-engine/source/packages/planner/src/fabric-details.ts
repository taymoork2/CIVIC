/** Label vocabulary; these descriptions never supply care permissions. */
export const fabricFibers = ['cotton', 'polyester', 'wool', 'silk', 'linen', 'nylon', 'rayon', 'elastane', 'modal', 'lyocell', 'acrylic', 'hemp', 'cashmere', 'alpaca', 'mohair', 'cupro', 'acetate', 'triacetate', 'ramie', 'polypropylene', 'olefin'] as const
export const fiberDetailSuggestions: Partial<Record<typeof fabricFibers[number], readonly string[]>> = {
  cotton: ['Pima', 'Supima', 'Egyptian', 'Long-staple', 'Extra-long-staple', 'Combed', 'Organic', 'Recycled'],
  wool: ['Merino', 'Lambswool', 'Virgin wool', 'Recycled'],
  silk: ['Mulberry', 'Tussar', 'Eri', 'Muga', 'Raw silk', 'Spun silk'],
  polyester: ['Microfiber', 'Recycled', 'COOLMAX', 'THERMOLITE'],
  nylon: ['Microfiber', 'Recycled', 'Nylon 6', 'Nylon 6,6', 'SUPPLEX', 'TACTEL'],
  elastane: ['LYCRA'], rayon: ['Made from bamboo', 'ECOVERO'],
  modal: ['TENCEL Modal', 'MicroModal'], lyocell: ['TENCEL Lyocell'], cupro: ['Bemberg'],
  linen: ['Organic', 'Recycled'], hemp: ['Organic', 'Recycled'], acrylic: ['Recycled'],
}
export const fabricConstructions = ['Knit', 'Woven', 'Jersey', 'Rib knit', 'Terry', 'Denim', 'Flannel', 'Fleece', 'Satin', 'Sateen', 'Velvet', 'Lace', 'Mesh', 'Corduroy', 'Ripstop'] as const
export const fabricFinishes = ['Mercerized', 'Pre-shrunk', 'Brushed', 'Stonewashed', 'Superwash / shrink-resist', 'Felted', 'Water-repellent / DWR', 'Waterproof membrane / coating', 'Flame-resistant treatment', 'Wrinkle-resistant'] as const
export interface FabricDetails {
  fibers?: { fiber: string; details: string[] }[]
  construction?: string[]
  finishes?: string[]
}

export interface FiberShare { fiber: typeof fabricFibers[number] | 'other'; name: string; percentage: number | null; details?: string[] }
export const fabricLabel = (fiber: string) => new Map([['rayon', 'Rayon / viscose'], ['nylon', 'Nylon / polyamide'], ['elastane', 'Elastane / spandex'], ['linen', 'Linen / flax']]).get(fiber) ?? `${fiber.charAt(0).toUpperCase()}${fiber.slice(1)}`

/** Keep older human-readable blends searchable without inferring care permission. */
export function parseFabric(material: string | null): FiberShare[] {
  if (!material?.trim()) return []
  return material.split(/[,/;]\s*/u).map(part => {
    const match = part.trim().match(/^(-?\d+(?:\.\d+)?)%\s*(.+)$/u)
    const name = (match?.[2] ?? part).trim()
    const found = namedFiber(name)
    const fiber = found?.fiber as FiberShare['fiber'] | undefined ?? 'other'
    return { fiber, name: fiber === 'other' && name.toLowerCase() !== 'other' ? name : '', percentage: match ? Number(match[1]) : null, ...(found?.details.length ? { details: found.details } : {}) }
  })
}

/** Only explicit, qualified names: an unfamiliar adjective or brand stays unknown. */
export function namedFiber(name: string): { fiber: string; details: string[] } | null {
  const word = name.trim().toLowerCase().replace(/[®™]/gu, '').replace(/\s+/gu, ' ')
  const aliases: Record<string, string> = { spandex: 'elastane', polyamide: 'nylon', viscose: 'rayon', flax: 'linen' }
  const fiber = Object.hasOwn(aliases, word) ? aliases[word]! : word
  if ((fabricFibers as readonly string[]).includes(fiber)) return { fiber, details: [] }
  const qualified: Record<string, [string, string]> = {
    'pima cotton': ['cotton', 'Pima'], 'supima cotton': ['cotton', 'Supima'], 'egyptian cotton': ['cotton', 'Egyptian'],
    'long-staple cotton': ['cotton', 'Long-staple'], 'extra-long-staple cotton': ['cotton', 'Extra-long-staple'],
    'combed cotton': ['cotton', 'Combed'], 'merino wool': ['wool', 'Merino'], lambswool: ['wool', 'Lambswool'],
    'tencel modal': ['modal', 'TENCEL Modal'], 'tencel lyocell': ['lyocell', 'TENCEL Lyocell'],
    'rayon made from bamboo': ['rayon', 'Made from bamboo'], 'viscose made from bamboo': ['rayon', 'Made from bamboo'],
  }
  const found = Object.hasOwn(qualified, word) ? qualified[word] : undefined
  return found ? { fiber: found[0], details: [found[1]] } : null
}

/** Bound descriptive metadata independently of composition and executable instructions. */
export function normalizeFabricDetails(value: FabricDetails | undefined): FabricDetails | undefined {
  if (value === undefined) return undefined
  const words = (values: readonly string[], max: number) => {
    if (values.length > max) throw new Error(`Choose at most ${max} fabric details.`)
    const unique = new Map<string, string>()
    for (const value of values) {
      const word = value.trim().replace(/\s+/gu, ' ')
      if (!word || word.length > 60) throw new Error('Fabric details must contain 1–60 characters.')
      if (!unique.has(word.toLowerCase())) unique.set(word.toLowerCase(), word)
    }
    return [...unique.values()]
  }
  if ((value.fibers?.length ?? 0) > 24) throw new Error('Record at most 24 fibers.')
  const fibers = (value.fibers ?? []).map(({ fiber, details }) => ({ fiber: words([fiber], 1)[0]!.toLowerCase(), details: words(details, 10) })).filter((entry) => entry.details.length > 0)
  if (new Set(fibers.map((entry) => entry.fiber)).size !== fibers.length) throw new Error('Record each fiber once.')
  const construction = words(value.construction ?? [], 15), finishes = words(value.finishes ?? [], 10)
  return fibers.length + construction.length + finishes.length === 0 ? undefined : { ...(fibers.length ? { fibers } : {}), ...(construction.length ? { construction } : {}), ...(finishes.length ? { finishes } : {}) }
}

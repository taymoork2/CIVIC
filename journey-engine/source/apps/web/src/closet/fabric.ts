import { fabricFibers, fiberDetailSuggestions, normalizeFabricDetails, parseFabric, fabricLabel, type FabricDetails, type FiberShare } from '@washcloset/planner'
export { parseFabric, fabricLabel, type FiberShare } from '@washcloset/planner'

export const fabrics = ['cotton', 'polyester', 'wool', 'silk', 'linen', 'nylon', 'rayon', 'elastane', 'modal'] as const
export const moreFabrics = [...fabricFibers.filter((fiber) => !(fabrics as readonly string[]).includes(fiber)), 'other'] as const
export type Fabric = typeof fabricFibers[number] | 'other'

/** Search the same reported details offered in Advanced; a name never grants care permission. */
export function searchFabrics(query: string): { fiber: Fabric; detail?: string; label: string }[] {
  const normal = (word: string) => word.toLowerCase().replace(/[®™]/gu, '').replace(/[^a-z0-9]+/gu, ' ').trim()
  const words = normal(query).split(' ').filter(Boolean)
  if (words.length === 0) return []
  return fabricFibers.flatMap((fiber) => [
    { fiber, label: fabricLabel(fiber) },
    ...(fiberDetailSuggestions[fiber] ?? []).map((detail) => ({ fiber, detail, label: `${detail} · ${fabricLabel(fiber)}` })),
  ]).filter((choice) => words.every((word) => normal(choice.label).includes(word)))
}

/** Recover explicit fiber details from older material descriptions. */
export function detailsFromMaterial(material: string | null): FabricDetails | undefined {
  const fibers = new Map<string, string[]>()
  for (const part of parseFabric(material)) {
    if (part.details?.length) fibers.set(part.fiber, [...fibers.get(part.fiber) ?? [], ...part.details])
  }
  return normalizeFabricDetails({ fibers: [...fibers].map(([fiber, details]) => ({ fiber, details })) })
}

export function detailsForMaterial(material: string | null, details: FabricDetails | undefined): FabricDetails | undefined {
  const fibers = parseFabric(material).map((part) => part.fiber === 'other' ? part.name.trim().toLowerCase() : part.fiber)
  return details === undefined ? undefined : normalizeFabricDetails({ ...details, fibers: details.fibers?.filter((entry) => fibers.includes(entry.fiber)) })
}

export function formatFabric(parts: readonly FiberShare[]): string | null {
  return parts.map((part) => `${part.percentage === null ? '' : `${part.percentage}% `}${part.fiber === 'other' ? part.name.trim() || 'other' : part.fiber}`).join(', ') || null
}

/** Balance the remaining shares as an editable suggestion, keeping known proportions. */
export function balanceFabric(parts: readonly FiberShare[], index: number, percentage: number | null): FiberShare[] {
  if (percentage === null) return parts.map((part) => ({ ...part, percentage: null }))
  const next = parts.map((part, at) => at === index ? { ...part, percentage } : { ...part })
  if (parts.length < 2 || !Number.isFinite(percentage) || percentage <= 0 || percentage >= 100) return next
  const others = parts.filter((_, at) => at !== index)
  const weighted = others.every((part) => part.percentage !== null && part.percentage > 0)
  const total = weighted ? others.reduce((sum, part) => sum + part.percentage!, 0) : others.length
  const remaining = 100 - percentage
  let assigned = 0
  let left = others.length
  return next.map((part, at) => {
    if (at === index) return part
    const share = Number((--left === 0 ? remaining - assigned : remaining * (weighted ? part.percentage! : 1) / total).toFixed(6))
    assigned += share
    return { ...part, percentage: share }
  })
}

export function fabricProblem(material: string | null): string | null {
  if ((material?.length ?? 0) > 240) return 'Keep the fabric composition within 240 characters.'
  const parts = parseFabric(material)
  const percentages = parts.map((part) => part.percentage)
  if (percentages.every((value) => value === null)) return null
  if (percentages.some((value) => value !== null && (!Number.isFinite(value) || value <= 0 || value > 100))) return 'Each percentage must be greater than 0 and no more than 100.'
  if (percentages.some((value) => value === null)) return 'Enter a percentage for each selected fiber, or leave them all blank.'
  if (Math.abs(percentages.reduce<number>((sum, value) => sum + (value ?? 0), 0) - 100) > 0.000001) return 'The fiber percentages must total 100%.'
  return null
}

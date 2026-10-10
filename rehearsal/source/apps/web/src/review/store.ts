import { getFunctionName, type FunctionReference } from 'convex/server'
import type { ConvexReactClient } from 'convex/react'
import type { Id, TableNames } from '@convex/_generated/dataModel'
import type { Care, Inventory, Machine, Supply, Textile } from '@/household/inventory-types'
import type { HouseholdWater } from '@convex/waterHardness'
import { classifyWater } from '@convex/waterHardness'
import { reviewTextiles, reviewGarmentRecord } from '@/dev/closet-preview'
import { reviewMachines, reviewSupplies, reviewWearers, reviewWater } from '@/dev/household-preview'

export type ReviewConfig = { scenario: string; persona: 'single' | 'student' | 'parent'; role: 'owner' | 'member'; condition: 'normal' | 'save-error' | 'offline' | 'missing-care'; theme: 'light' | 'dark'; textScale: 1 | 2; width: number }
export type ReviewSnapshot = { revision: { head: string; source: string; capturedAt: string }; design: { project: string; hashes: Record<string, string | null> } }
export type ReviewData = Pick<Inventory, 'textiles' | 'machines' | 'supplies' | 'wearers'> & { water: HouseholdWater; saved: Record<string, string[]> }
const provenance = { source: 'Synthetic review only; not care evidence', confidence: 'user-supplied' as const }
type Args = Record<string, any>

export function seedReview(config: ReviewConfig): ReviewData {
  const wearers = config.persona === 'parent' ? reviewWearers : [{ ...reviewWearers[0]!, name: config.persona === 'student' ? 'Jordan (student)' : 'Alex' }]
  return structuredClone({ saved: {}, wearers, machines: config.persona === 'student' ? reviewMachines.filter((machine) => machine.location === 'shared') : reviewMachines, supplies: config.persona === 'student' ? reviewSupplies.slice(0, 2) : reviewSupplies, water: reviewWater,
    textiles: reviewTextiles.filter((piece) => piece.wearerId === null || wearers.some((person) => person.wearerId === piece.wearerId)).map((piece) => ({ ...piece, private: false, canChangePrivacy: config.role === 'owner', care: config.condition === 'missing-care' ? null : piece.kind === 'towel' && piece.care !== null ? { ...piece.care, material: 'cotton 80%, polyester 20%' } : piece.care })) })
}

function careFrom(args: Args, previous: Care | null): Care {
  const { textileIds: _ids, washWithLikeColors, ...fields } = args
  return { material: null, washMethod: 'unknown', cycle: null, maxTemperatureC: null, dryMethod: 'unknown', dryMethodInferred: false, dryHeat: null, ironSteam: null, status: 'confirmed', ...previous, ...fields,
    restrictions: washWithLikeColors === undefined ? previous?.restrictions ?? [] : [...(previous?.restrictions ?? []).filter((word) => word !== 'Wash with like colors'), ...(washWithLikeColors ? ['Wash with like colors'] : [])], provenance }
}

/** Only named local simulation writes are supported; an unknown action fails visibly. */
export function applyReviewMutation(data: ReviewData, name: string, args: Args): unknown {
  const id = <T extends TableNames>() => `preview-${crypto.randomUUID()}` as Id<T>
  const editPieces = (ids: readonly string[], edit: (piece: Textile) => Textile) => {
    if (!ids.length || ids.some((key) => !data.textiles.some((piece) => piece.textileId === key))) throw new Error('Synthetic item not found')
    data.textiles = data.textiles.map((piece) => ids.includes(piece.textileId) ? edit(piece) : piece)
  }
  switch (name) {
    case 'inventory:createTextiles': {
      const colors = args.colors ?? [{ name: args.name, quantity: args.quantity, color: args.color, colorGroup: args.colorGroup, dyeRun: args.dyeRun }]
      if (!Number.isInteger(args.quantity) || args.quantity < 1 || args.quantity > 20 || !Array.isArray(colors) || colors.some((color: Args) => !Number.isInteger(color.quantity) || color.quantity < 1) || colors.reduce((sum: number, color: Args) => sum + color.quantity, 0) !== args.quantity) throw new Error('Invalid synthetic quantity')
      const pieces: Textile[] = colors.flatMap((color: Args) => Array.from({ length: color.quantity }, () => ({ ...structuredClone(reviewTextiles[0]!), textileId: id<'textiles'>(), name: color.name, color: color.color, colorGroup: color.colorGroup, dyeRun: color.dyeRun ?? 'unknown', kind: args.kind, wearerId: args.wearerId ?? null, status: args.status ?? 'clean', tags: args.tags ?? [], occasions: args.occasions ?? [], identity: args.identity ?? null, care: careFrom({ ...args.tag, material: args.material ?? null, fabricDetails: args.fabricDetails }, null), flag: null, firstWash: color.dyeRun === 'new', createdAt: Date.now(), statusSince: Date.now() })))
      data.textiles.push(...pieces)
      const ids = pieces.map((piece) => piece.textileId)
      if (['pack', 'towel'].includes(args.reviewFixture)) data.saved[args.reviewFixture] = ids
      return ids
    }
    case 'inventory:updateTextile': { const { textileId, ...fields } = args; editPieces([textileId], (piece) => ({ ...piece, ...fields })); return null }
    case 'inventory:answerTagQuestions': editPieces(args.textileIds, (piece) => ({ ...piece, care: careFrom(args, piece.care) })); return null
    case 'inventory:setMaterial': editPieces(args.textileIds, (piece) => ({ ...piece, care: careFrom({ material: args.material, ...(args.fabricDetails === undefined ? {} : { fabricDetails: args.fabricDetails }) }, piece.care) })); return null
    case 'inventory:setPrivacy': editPieces(args.textileIds, (piece) => ({ ...piece, private: args.private })); return null
    case 'inventory:updateTags': editPieces(args.textileIds, (piece) => ({ ...piece, tags: args.tags })); return null
    case 'inventory:addMatchingTextiles': {
      const piece = data.textiles.find((piece) => piece.textileId === args.textileId)
      if (!piece || !Number.isInteger(args.quantity) || args.quantity < 1 || args.quantity > 20) throw new Error('Invalid matching pieces')
      const added = Array.from({ length: args.quantity }, () => ({ ...structuredClone(piece), textileId: id<'textiles'>(), status: 'clean' as const, firstWash: true, dyeRun: 'new' as const }))
      data.textiles.push(...added); return added.map((piece) => piece.textileId)
    }
    case 'inventory:trashTextiles': { const count = data.textiles.length; data.textiles = data.textiles.filter((piece) => !args.textileIds.includes(piece.textileId)); return { changed: count - data.textiles.length } }
    case 'inventory:createWearer': { const wearerId = id<'wearers'>(); data.wearers.push({ wearerId, name: args.name, kind: args.kind, principalKey: null }); return wearerId }
    case 'inventory:createSupply': { const supplyId = id<'supplies'>(); data.supplies.push({ name: args.name, kind: args.kind, use: args.use ?? null, ...args, supplyId, archived: false, ranOutAt: null, rules: [], measure: args.measure ?? null, formulation: args.formulation ?? null, provenance }); data.saved.product = [supplyId]; return supplyId }
    case 'inventory:updateSupply': { const supply = data.supplies.find((entry) => entry.supplyId === args.supplyId); if (!supply) throw new Error('Synthetic product missing'); const { supplyId: _id, ...fields } = args; Object.assign(supply, fields); return null }
    case 'inventory:setRanOut': { const supply = data.supplies.find((entry) => entry.supplyId === args.supplyId); if (!supply) throw new Error('Synthetic product missing'); supply.ranOutAt = args.ranOut ? Date.now() : null; return null }
    case 'inventory:createMachines': {
      if (!Number.isInteger(args.count) || args.count < 1 || args.count > 20) throw new Error('Invalid synthetic appliance quantity')
      const machines: Machine[] = Array.from({ length: args.count }, (_, index) => ({ model: null, applianceType: 'front_load_washer', highEfficiency: null, heatSettings: [], capacityUnits: null, capacityConfidence: 'unknown', supportedCycles: [], placements: [], cycleMinutes: {}, availability: 'available', location: 'shared', pricePerStart: null, blockMinutes: null, drumVolume: null, archived: false, ...args, machineId: id<'machines'>(), name: args.count > 1 ? `${args.name} ${index + 1}` : args.name, provenance }))
      data.machines.push(...machines); data.saved.appliance = machines.map((machine) => machine.machineId); return data.saved.appliance
    }
    case 'inventory:updateMachineGroup': for (const machineId of args.machineIds) { const machine = data.machines.find((entry) => entry.machineId === machineId); if (!machine) throw new Error('Synthetic appliance missing'); const { machineIds: _ids, ...fields } = args; Object.assign(machine, fields) }; return null
    case 'inventory:updateMachine': { const machine = data.machines.find((entry) => entry.machineId === args.machineId); if (!machine) throw new Error('Synthetic appliance missing'); const { machineId: _id, ...fields } = args; Object.assign(machine, fields); return null }
    case 'inventory:updateWearer': { const person = data.wearers.find((entry) => entry.wearerId === args.wearerId); if (!person) throw new Error('Synthetic profile missing'); Object.assign(person, args); return null }
    case 'inventory:setWater': { data.water = { ...args.water, ...classifyWater({ ...args.water, setAt: Date.now() }, Date.now()), setAt: Date.now() }; return null }
    case 'inventory:setCareInstructions': editPieces([args.textileId], (piece) => ({ ...piece, care: careFrom({ instructions: args.instructions ?? undefined }, piece.care) })); return null
    default: throw new Error(`This action is not simulated yet: ${name}. No household request was sent.`)
  }
}

export function reviewClient(config: ReviewConfig, storage: Storage = localStorage) {
  const key = `laundered-review:v2:${config.persona}:${config.role}:${config.condition}`
  let data = seedReview(config)
  let loadError: string | undefined
  try {
    const saved = storage.getItem(key)
    if (saved !== null) {
      const parsed = JSON.parse(saved)
      if (!parsed || !['textiles', 'machines', 'supplies', 'wearers'].every((field) => Array.isArray(parsed[field])) || !parsed.saved || !parsed.water) throw new Error('Invalid synthetic dataset')
      data = parsed
    }
  } catch { loadError = 'Saved synthetic records could not be loaded. No stored records were changed.' }
  const subscribers = new Set<() => void>()
  const query = (name: string) => name === 'inventory:list' ? data : name === 'households:water' ? data.water : name === 'sessions:garmentRecord' ? reviewGarmentRecord : name === 'catalog:detail' ? null : []
  const mutate = async (name: string, args: Args) => {
    if (loadError) throw new Error(loadError)
    if (config.condition === 'save-error' || config.condition === 'offline') throw new Error(config.condition === 'offline' ? 'Review is simulating offline. Draft kept; use Retry writes to try again.' : 'Review save failure. Draft kept; use Retry writes to try again.')
    if (config.role === 'member' && /(?:Machine|Supply|Wearer|setWater|setRanOut|setPrivacy)/.test(name)) throw new Error('The synthetic member cannot manage household setup or ownership. Switch to Owner and restart.')
    if (args.householdId !== undefined && args.householdId !== 'preview-household') throw new Error('Review refuses non-synthetic households')
    const next = structuredClone(data)
    const result = applyReviewMutation(next, name, args)
    storage.setItem(key, JSON.stringify(next))
    data = next
    for (const callback of subscribers) callback()
    return result
  }
  const client = { watchQuery: (reference: FunctionReference<'query'>) => ({ localQueryResult: () => query(getFunctionName(reference)), onUpdate: (callback: () => void) => { subscribers.add(callback); return () => subscribers.delete(callback) }, journal: () => undefined }), mutation: (reference: FunctionReference<'mutation'>, args: Args) => mutate(getFunctionName(reference), args), action: async () => { throw new Error('Research and uploads are outside synthetic review.') } } as unknown as ConvexReactClient
  return { client, mutate, loadError, getData: () => data, subscribe: (callback: () => void) => { subscribers.add(callback); return () => { subscribers.delete(callback) } }, restart: () => { storage.removeItem(key) }, retryWrites: () => { config.condition = 'normal' } }
}

import { createPantry } from './pantry.js'

// CIVIC runs this per review run: the app's real backend functions over an in-memory store seeded from the chosen persona, role and condition.
export function createRuntime({ persona, role, condition }) {
  const db = {
    items: (persona.seed?.items ?? []).map(([name, quantity], index) => ({ id: String(index + 1), name, quantity })),
    next: (persona.seed?.items ?? []).length + 1,
    canWrite: role === 'cook',
    unavailable: condition === 'backend-down',
  }
  const pantry = createPantry(db)
  return {
    seed: { items: db.items.length },
    state: () => ({ items: db.items }),
    async execute(kind, name, args) {
      if (kind === 'query') return pantry.query(name, args)
      if (kind === 'mutation') return pantry.mutation(name, args)
      throw Error(`Unsupported operation ${kind}`)
    },
  }
}

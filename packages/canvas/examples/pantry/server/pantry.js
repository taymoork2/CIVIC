// The app's backend: named query and mutation functions over a store, the way a function backend
// (Convex, Firebase callable functions, tRPC procedures) exposes them. It knows nothing about CIVIC.
export function createPantry(db) {
  const writable = () => { if (db.unavailable) throw Error('The pantry backend is unavailable.'); if (!db.canWrite) throw Error('Guests can look but not change the pantry.') }
  const readable = () => { if (db.unavailable) throw Error('The pantry backend is unavailable.') }
  const queries = {
    'items:list': () => { readable(); return db.items.filter((item) => item.quantity > 0) },
    'items:shopping': () => { readable(); return db.items.filter((item) => item.quantity === 0) },
  }
  const mutations = {
    'items:add': ({ name, quantity }) => {
      writable()
      const title = typeof name === 'string' ? name.trim() : ''
      if (!title || title.length > 80) throw Error('Name the item.')
      const amount = Number.isInteger(quantity) && quantity > 0 && quantity < 1000 ? quantity : 1
      const existing = db.items.find((item) => item.name.toLowerCase() === title.toLowerCase())
      if (existing) { existing.quantity += amount; return existing }
      const item = { id: String(db.next++), name: title, quantity: amount }
      db.items.push(item)
      return item
    },
    'items:use': ({ id }) => {
      writable()
      const item = db.items.find((row) => row.id === id)
      if (!item || item.quantity === 0) throw Error('That item is not on the shelf.')
      item.quantity -= 1
      return item
    },
  }
  return {
    query: (name, args) => { if (!Object.hasOwn(queries, name)) throw Error(`Unknown query ${name}`); return queries[name](args ?? {}) },
    mutation: (name, args) => { if (!Object.hasOwn(mutations, name)) throw Error(`Unknown mutation ${name}`); return mutations[name](args ?? {}) },
  }
}

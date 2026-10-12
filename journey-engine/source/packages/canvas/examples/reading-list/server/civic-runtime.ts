import { library, resetLibrary } from '../src/server/library'

// CIVIC runs this per review run, in a worker of its own: the app's server functions over a library
// seeded from the chosen persona and condition. `context()` is what the app's auth middleware would give.
export function createServerFnRuntime({ persona, role, condition }: { persona: { seed?: { books?: { title: string; author: string }[] } }; role: string; condition: string }) {
  resetLibrary(persona.seed?.books ?? [], condition === 'service-down')
  return { seed: { books: library.books.length }, state: () => ({ books: library.books }), context: () => ({ role }) }
}

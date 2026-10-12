// Server only: the reading list's store. In production this would be a database client;
// the page never loads this module, because only server function handlers use it.
export type Book = { id: string; title: string; author: string; read: boolean; addedOn: Date }

export const library = {
  books: [] as Book[],
  next: 1,
  unavailable: false,
  open() {
    if (this.unavailable) throw new Error('The reading list is unavailable. Your draft is kept.')
    return this.books
  },
}

export function resetLibrary(books: { title: string; author: string }[], unavailable = false) {
  library.books = books.map((book, index) => ({ id: String(index + 1), ...book, read: false, addedOn: new Date() }))
  library.next = books.length + 1
  library.unavailable = unavailable
}

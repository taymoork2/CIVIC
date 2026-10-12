import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { library, type Book } from './server/library'

// TanStack Start server functions, written as for any Start app. The page calls them over RPC;
// their handlers, middleware and the library module stay on the server.
const editorsOnly = createMiddleware({ type: 'function' }).server(({ next, context }) => {
  if ((context as { role?: string }).role !== 'editor') throw new Error('Viewers cannot change the list.')
  return next()
})

export const listBooks = createServerFn({ method: 'GET' }).handler(async (): Promise<Book[]> => library.open())

export const addBook = createServerFn({ method: 'POST' })
  .middleware([editorsOnly])
  .inputValidator((input: { title: string; author: string }) => {
    const title = String(input?.title ?? '').trim(), author = String(input?.author ?? '').trim()
    if (!title || !author) throw new Error('Give the book a title and an author.')
    return { title, author }
  })
  .handler(async ({ data }): Promise<Book> => {
    const book = { id: String(library.next++), ...data, read: false, addedOn: new Date() }
    library.open().push(book)
    return book
  })

export const markRead = createServerFn({ method: 'POST' })
  .middleware([editorsOnly])
  .inputValidator((input: { id: string; read: boolean }) => ({ id: String(input.id), read: Boolean(input.read) }))
  .handler(async ({ data }): Promise<Book> => {
    const book = library.open().find((row) => row.id === data.id)
    if (!book) throw new Error('Unknown book.')
    book.read = data.read
    return book
  })

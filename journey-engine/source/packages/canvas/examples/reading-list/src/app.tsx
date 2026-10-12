import { useEffect, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { addBook, listBooks, markRead } from './books.functions'
import type { Book } from './server/library'
import './app.css'

export type View = { screen: string; dirty: boolean; pending: boolean }
type Props = { view: View; navigated: (to: string, action: string) => void; changed: () => void; loaded: () => void }

// The app itself: React over its own server functions. It knows nothing about CIVIC.
export function ReadingList({ view, navigated, changed, loaded }: Props) {
  const [screen, setScreen] = useState(view.screen)
  const [books, setBooks] = useState<Book[]>([])
  const [draft, setDraft] = useState({ title: '', author: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const list = useServerFn(listBooks), add = useServerFn(addBook), read = useServerFn(markRead)

  useEffect(() => { list().then(setBooks, (failure: Error) => setError(failure.message)).finally(loaded) }, [])
  useEffect(() => { view.dirty = screen === 'books.add' && Boolean(draft.title || draft.author); view.pending = busy; changed() }, [screen, draft, busy])

  const go = (to: string, action: string) => { view.screen = to; setScreen(to); setError(''); navigated(to, action) }
  const save = async () => {
    setBusy(true)
    try {
      const book = await add({ data: draft })
      setBooks((rows) => [...rows, book]); setDraft({ title: '', author: '' })
      go('books.list', 'Save')
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }
  const toggle = async (book: Book, done: boolean) => {
    try { const updated = await read({ data: { id: book.id, read: done } }); setBooks((rows) => rows.map((row) => row.id === updated.id ? updated : row)) }
    catch (failure) { setError((failure as Error).message) }
  }

  return (
    <section className="reading-screen">
      <h1>{screen === 'books.add' ? 'New book' : 'Reading list'}</h1>
      {screen === 'books.list' ? (
        <>
          {books.length ? (
            <ul>
              {books.map((book) => (
                <li key={book.id}>
                  <label><input type="checkbox" checked={book.read} onChange={(event) => toggle(book, event.target.checked)} /> {book.title}</label>
                  <span> by {book.author}, added {book.addedOn.toISOString().slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          ) : <p>Nothing to read yet.</p>}
          <button disabled={busy} onClick={() => go('books.add', 'Add book')}>Add book</button>
        </>
      ) : (
        <>
          <label>Title <input aria-label="Title" maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label>Author <input aria-label="Author" maxLength={120} value={draft.author} onChange={(event) => setDraft({ ...draft, author: event.target.value })} /></label>
          <button disabled={busy} onClick={save}>Save</button>
          <button disabled={busy} onClick={() => { setDraft({ title: '', author: '' }); go('books.list', 'Cancel') }}>Cancel</button>
        </>
      )}
      <p role="status">{error}</p>
    </section>
  )
}

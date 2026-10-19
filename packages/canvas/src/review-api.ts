import { projectFetch } from './project-request'

export class ReviewRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export async function reviewApi<T>(path: string, data?: unknown, options: { signal?: AbortSignal; fallback?: string } = {}): Promise<T> {
  const response = await projectFetch(`/api/review/${path}`, { signal: options.signal, ...(data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }) })
  if (response.ok) return response.json()
  let message = options.fallback ?? 'Review request failed. Your draft is kept.'
  try {
    const result = await response.json()
    if (typeof result?.error === 'string' && result.error) message = result.error
  } catch (error) {
    options.signal?.throwIfAborted()
    if (error instanceof Error && error.name === 'AbortError') throw error
  }
  throw new ReviewRequestError(message, response.status)
}

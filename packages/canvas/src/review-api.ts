import { projectFetch } from './project-request'

export async function reviewApi<T>(path: string, data?: unknown): Promise<T> {
  const response = await projectFetch(`/api/review/${path}`, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'Review request failed. Your draft is kept.')
  return result
}

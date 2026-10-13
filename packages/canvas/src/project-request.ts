let projectKey = ''

export function bindProjectRequests(key: string) { projectKey = key }

export function projectFetch(path: string, options: RequestInit = {}, fetcher: typeof fetch = fetch) {
  const headers = new Headers(options.headers)
  if (!projectKey) throw Error('Project requests must be bound before opening the workspace')
  headers.set('x-rehearsal-project', projectKey)
  return fetcher(path, { ...options, headers })
}

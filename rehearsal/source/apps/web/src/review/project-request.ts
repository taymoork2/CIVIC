let projectKey = ''

export function bindProjectRequests(key: string) { projectKey = key }

export function projectFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)
  if (!projectKey) throw Error('Project requests must be bound before opening the workspace')
  headers.set('x-rehearsal-project', projectKey)
  return fetch(path, { ...options, headers })
}

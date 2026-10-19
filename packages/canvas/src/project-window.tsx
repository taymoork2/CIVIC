import { useEffect, useState } from 'react'
import { projectFetch } from './project-request'
import { projectWindowDestination } from './project-choice'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@civic/shell/ui/empty'
import { Button } from '@civic/shell/ui/button'

export function ProjectWindow() {
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController(), params = new URLSearchParams(location.search)
    void projectFetch('/api/review/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'open-window', key: params.get('openProject'), workspace: params.get('workspace') || undefined }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw Error(result.error ?? 'The project window could not be opened')
      if (!controller.signal.aborted) location.replace(projectWindowDestination(result.url, params.get('desktop')))
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [])
  return <Empty role="status" className="cv:min-h-dvh"><EmptyHeader><EmptyTitle>{error ? 'Could not open project' : 'Opening project…'}</EmptyTitle><EmptyDescription>{error || 'Preparing an independent project window.'}</EmptyDescription></EmptyHeader>{error && <EmptyContent><Button variant="outline" onClick={() => location.reload()}>Retry</Button></EmptyContent>}</Empty>
}

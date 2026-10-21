import { lazy, Suspense } from 'react'
import { Button } from '@civic/shell/ui/button'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@civic/shell/ui/empty'
import { Skeleton } from '@civic/shell/ui/skeleton'

const AppCanvas = lazy(() => import('./app-canvas').then(module => ({ default: module.AppCanvas }), () => ({ default: () => <WorkspaceLoading failed /> })))

export function Workspace() {
  return <Suspense fallback={<WorkspaceLoading />}><AppCanvas /></Suspense>
}

export function WorkspaceLoading({ failed = false }: { failed?: boolean }) {
  return <Empty data-civic-ui className="cv:min-h-dvh" role={failed ? 'alert' : 'status'} aria-label={failed ? 'Workspace unavailable' : 'Loading workspace'}>
    <EmptyHeader><EmptyTitle>{failed ? 'Could not load workspace' : 'Opening workspace…'}</EmptyTitle><EmptyDescription>{failed ? 'Reload to try again. Saved reviews remain on this Mac.' : 'Loading project tools.'}</EmptyDescription></EmptyHeader>
    <EmptyContent>{failed ? <Button variant="outline" onClick={() => location.reload()}>Reload workspace</Button> : <Skeleton className="cv:h-8 cv:w-44" />}</EmptyContent>
  </Empty>
}

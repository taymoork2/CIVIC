import type { ReactNode } from 'react'
import { X } from '@civic/shell/icons'
import { Button } from '@civic/shell/ui/button'
import { IconButton } from '@civic/shell/ui/icon-button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@civic/shell/ui/tabs'
import { workspacePanels, type WorkspacePanel } from './workspace-tools'
import { RunControls } from './run-controls'
import type { MapScreen } from './app-map'
import type { AdapterState } from './adapter'
import type { ReplayStep } from './replay'
import type { ViewportController } from './use-preview-viewport'

type Props = {
  pane: WorkspacePanel | null; setPane: (pane: WorkspacePanel | null) => void; editing: boolean; scope: string
  inspect: ReactNode; review: ReactNode; contract: ReactNode; coverage: ReactNode
}

export function WorkspaceInspector({ pane, setPane, editing, scope, inspect, review, contract, coverage }: Props) {
  return <aside id="civic-details-panel" className="rh-inspector" aria-label="Contextual panel" hidden={!pane}>
    <div className="rh-inspector-title"><h2>{pane === 'coverage' ? 'Coverage' : pane === 'review' ? 'Review' : pane === 'contract' ? 'Product contract' : editing ? 'Edit proposal' : 'Inspect'}</h2><IconButton icon={X} label="Close panel" onClick={() => setPane(null)} /></div>
    <Tabs value={pane ?? 'inspect'} onValueChange={value => setPane(value as WorkspacePanel)}>
      <TabsList className="cv:w-full" aria-label="Details panel">{workspacePanels.map(item => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}</TabsList>
      <p className="rh-panel-scope">{pane === 'coverage' ? 'App coverage' : scope}</p>
      <TabsContent keepMounted value="inspect" className="rh-inspect-content">{inspect}</TabsContent>
      <TabsContent keepMounted value="review">{review}</TabsContent>
      <TabsContent keepMounted value="contract">{contract}</TabsContent>
      <TabsContent keepMounted value="coverage">{coverage}</TabsContent>
    </Tabs>
  </aside>
}

export function PreviewInspector({ frame, viewportController, guidedSelected, guidedContent, selectedScreen, generic, live, previewAvailable, adapterMode, visits, replaying, onPlay, onReplay, onDestination, onRetryCapture }: {
  frame: HTMLIFrameElement | null; viewportController: ViewportController; guidedSelected: boolean; guidedContent: ReactNode; selectedScreen?: MapScreen
  generic: boolean; live: boolean; previewAvailable?: boolean; adapterMode: boolean
  visits: { id: string; from: string; to: string; fields: AdapterState['fields']; screenshot?: string; error?: string }[]
  replaying: { target: string; steps: ReplayStep[]; status: 'running' | 'done' | 'missed'; message: string } | null
  onPlay: (screen: MapScreen) => void; onReplay: (screen: MapScreen) => void; onDestination: (id: string) => void; onRetryCapture: (id: string) => void
}) {
  return <><RunControls frame={frame} viewportController={viewportController} />{guidedSelected ? guidedContent : <><p>{selectedScreen ? 'Select a screen with supported proposal properties to edit it.' : 'Select a screen to inspect its properties.'}</p>{selectedScreen && <><p>{selectedScreen.partial ? 'Partial specimen · paths unverified' : 'Working app fixture'}</p><p>Scenario: {selectedScreen.scenario}</p>{selectedScreen.routeActions?.length ? <section className="rh-route-actions"><h3>Cross-route actions</h3><p>Source bindings, not observed runs. Linked specimens represent the destination; they do not replay its parameters.</p>{selectedScreen.routeActions.map((action) => <article key={`${action.action}-${action.route}`}><h4>{action.action}</h4><p><code>{action.route}</code></p><p>{action.when}</p>{action.returnTo && <p>Return: {action.returnTo}</p>}<p>{action.status}</p>{action.destination && action.status === 'source-declared; representative preview' && <Button variant="outline" onClick={() => { if (action.destination) onDestination(action.destination) }}>View destination specimen</Button>}<a href={`/api/review/evidence?file=${encodeURIComponent(action.source)}`} target="_blank" rel="noreferrer">Source</a></article>)}</section> : null}<Button variant="outline" disabled={generic && !previewAvailable} onClick={() => onPlay(selectedScreen)}>Play selected screen</Button>{generic && !live && <Button variant="outline" disabled={!previewAvailable || replaying?.status === 'running'} onClick={() => onReplay(selectedScreen)}>Replay from start</Button>}{generic && replaying && <p className={replaying.status === 'missed' ? 'rh-alert' : 'rh-muted'} role={replaying.status === 'missed' ? 'alert' : 'status'}>{replaying.message}</p>}</>}</>}{adapterMode && <details><summary>Run history ({visits.length})</summary>{visits.map((visit) => <article key={visit.id}><strong>{visit.from} → {visit.to}</strong><dl className="rh-fields">{visit.fields.map((field, i) => <div key={i}><dt>{field.label}</dt><dd>{field.value || '(empty)'}</dd></div>)}</dl>{visit.screenshot ? <a href={visit.screenshot} target="_blank" rel="noreferrer">Frozen screen</a> : <p>{visit.error ?? 'Saving evidence…'}</p>}{visit.error && <Button variant="outline" onClick={() => onRetryCapture(visit.id)}>Retry capture</Button>}</article>)}</details>}</>
}

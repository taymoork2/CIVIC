import { useCallback, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import project from 'virtual:civic-project'
import { TooltipProvider } from '@civic/shell/ui/tooltip'
import { Notifications } from '@civic/shell/ui/notifications'
import '@civic/shell/styles/ui.generated.css'
import '@civic/shell/styles/workspace.css'
import '@civic/shell/styles/scene.css'
import { AppOverview } from '../app-overview'
import { appFlows } from '../app-map'
import { ProjectPicker, type ProjectPickerHandle } from '../project-picker'
import { ReviewPanel } from '../review-panel'
import { WorkspaceInspector, PreviewInspector } from '../workspace-inspector'
import { usePreviewViewport } from '../use-preview-viewport'
import { WorkspaceSettings } from '../workspace-settings'
import { WorkspaceBody } from '../workspace-rails'
import { bindProjectRequests } from '../project-request'
import type { AdapterContext } from '../adapter'
import type { WorkspacePanel } from '../workspace-tools'
import notebook from '../../examples/notebook/civic.scenarios.json'

const flows = appFlows(notebook.map(row => ({ ...row, renderer: 'adapter' })), { adapter: 'module', navigation: ['Main'] })
const screens = flows.flatMap(flow => flow.screens)
const screen = screens[0]!
const noop = () => {}

function Specimen({ context }: { context: AdapterContext }) {
  const pickerOpened = useRef(false)
  const openPicker = useCallback((picker: ProjectPickerHandle | null) => {
    if (picker && !pickerOpened.current) { pickerOpened.current = true; picker.open('work') }
  }, [])
  const [open, setOpen] = useState(true)
  const [detail, setDetail] = useState('compact')
  const [focused, setFocused] = useState('')
  const [pane, setPane] = useState<WorkspacePanel | null>(context.scenario.id === 'civic.review' ? 'review' : 'inspect')
  const viewportController = usePreviewViewport({ getFrame: () => null, initial: { width: 393, height: 852, theme: context.config.theme, textScale: 1 } })
  const review = <ReviewPanel project={project} selected={screen} flowScreens={screens} allScreens={screens} frame={null} target={{ kind: 'screen', id: screen.id, label: screen.label }} canvas={null} fixture={{ source: context.snapshot.revision.source, snapshot: context.snapshot }} focus={noop} navigationReady />
  return <Notifications><TooltipProvider><main data-civic-ui className="rh-workspace" style={{ minHeight: '100vh', position: 'relative' }}>
    <AppOverview flows={flows} connections={[]} source="" active={false} focused={focused} pan={false} focus={setFocused} reviewConnection={noop} selectBundle={noop} selectedBundle={null} />
    {context.scenario.id === 'civic.picker' && <ProjectPicker blocked={false} activeRun={false} focusScreen={noop} onSearch={noop} searchOpen={false} ref={openPicker} />}
    {/* Rails portal into the workspace body, as in the real canvas. */}
    {['civic.inspector', 'civic.review'].includes(context.scenario.id) && <WorkspaceBody><WorkspaceInspector pane={pane} setPane={setPane} editing={false} scope={screen.label} inspect={<PreviewInspector frame={null} viewportController={viewportController} guidedSelected={false} guidedContent={null} selectedScreen={screen} generic live={false} previewAvailable={false} adapterMode={false} visits={[]} replaying={null} onPlay={noop} onReplay={noop} onDestination={noop} onRetryCapture={noop} />} review={review} contract={null} coverage={null} /></WorkspaceBody>}
    {context.scenario.id === 'civic.settings' && <WorkspaceSettings open={open} setOpen={setOpen} frame={null} canvasDetail={detail} changeDetail={setDetail} projectName="Notebook" onConnections={noop} />}
  </main></TooltipProvider></Notifications>
}

// Render bounded specimens so reviewing the canvas never recursively captures itself.
export function mount(container: HTMLElement, context: AdapterContext) {
  bindProjectRequests(project.key)
  const root = createRoot(container)
  root.render(<Specimen context={context} />)
  context.publish({ screen: context.scenario.id })
  return () => root.unmount()
}

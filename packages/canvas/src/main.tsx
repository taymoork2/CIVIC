import '@civic/shell/styles/ui.generated.css'
import { createRoot } from 'react-dom/client'
import project from 'virtual:civic-project'
import { bindProjectRequests } from './project-request'
import 'virtual:civic-shell-style'
import { TooltipProvider } from '@civic/shell/ui/tooltip'
import { Notifications } from '@civic/shell/ui/notifications'
import { Workspace } from './workspace'
import { extension } from './extension'
import { ProjectWindow } from './project-window'
import { initializeTheme } from '@civic/shell/theme'

await initializeTheme(window.civicDesktop)
bindProjectRequests(project.key)
document.title = `${project.name} · CIVIC`
const params = new URLSearchParams(location.search)
if (params.has('desktop')) document.documentElement.dataset.civicDesktop = params.get('desktop')!
const page = Object.entries(extension.pages ?? {}).find(([name]) => params.get(name) === '1')
if (params.has('openProject')) createRoot(document.getElementById('review-root')!).render(<ProjectWindow />)
else if (page) await page[1]()
else createRoot(document.getElementById('review-root')!).render(<Notifications><TooltipProvider delay={350}><Workspace /></TooltipProvider></Notifications>)

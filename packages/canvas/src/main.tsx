import '@civic/shell/styles/ui.generated.css'
import { createRoot } from 'react-dom/client'
import project from 'virtual:civic-project'
import { bindProjectRequests } from './project-request'
import 'virtual:civic-shell-style'
import './shell.css'
import './review.css'
import { TooltipProvider } from '@civic/shell/ui/tooltip'
import { Notifications } from '@civic/shell/ui/notifications'
import { AppCanvas } from './app-canvas'
import { extension } from './extension'
import { ProjectWindow } from './project-window'

bindProjectRequests(project.key)
document.title = `${project.name} · CIVIC`
const params = new URLSearchParams(location.search)
if (params.has('desktop')) document.documentElement.dataset.civicDesktop = params.get('desktop')!
const page = Object.entries(extension.pages ?? {}).find(([name]) => params.get(name) === '1')
if (params.has('openProject')) createRoot(document.getElementById('review-root')!).render(<ProjectWindow />)
else if (page) await page[1]()
else if (extension.legacy && params.get('legacy') === '1') await extension.legacy()
else createRoot(document.getElementById('review-root')!).render(<Notifications><TooltipProvider delay={350}><AppCanvas /></TooltipProvider></Notifications>)

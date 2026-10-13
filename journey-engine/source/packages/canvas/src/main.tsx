import { createRoot } from 'react-dom/client'
import project from 'virtual:civic-project'
import { bindProjectRequests } from './project-request'
import 'virtual:civic-shell-style'
import './shell.css'
import './review.css'
import { AppCanvas } from './app-canvas'
import { extension } from './extension'

bindProjectRequests(project.key)
document.title = `${project.name} · CIVIC`
const params = new URLSearchParams(location.search)
const page = Object.entries(extension.pages ?? {}).find(([name]) => params.get(name) === '1')
if (page) await page[1]()
else if (extension.legacy && params.get('legacy') === '1') await extension.legacy()
else createRoot(document.getElementById('review-root')!).render(<AppCanvas />)

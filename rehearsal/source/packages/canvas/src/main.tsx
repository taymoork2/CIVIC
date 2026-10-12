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
if (extension.legacy && new URLSearchParams(location.search).get('legacy') === '1') await extension.legacy()
else createRoot(document.getElementById('review-root')!).render(<AppCanvas />)

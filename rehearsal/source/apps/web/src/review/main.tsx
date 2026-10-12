import { createRoot } from 'react-dom/client'
import project from 'virtual:rehearsal-project'
import { bindProjectRequests } from './project-request'
import 'virtual:rehearsal-shell-style'
import './shell.css'
import './review.css'
import { AppCanvas } from './app-canvas'

bindProjectRequests(project.key)
document.title = `${project.name} · Rehearsal`
if (project.adapter === 'laundry' && new URLSearchParams(location.search).get('legacy') === '1') await import('./workspace')
else createRoot(document.getElementById('review-root')!).render(<AppCanvas />)

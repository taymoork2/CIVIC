import { createServer } from 'vite'
import { canvasPlugins } from '@civic/canvas'
import { canvasRoot } from '@civic/canvas/root'
import { loadProject } from '@civic/vite-connector/project'
import { projectWindows } from './project-windows.mjs'
import { store } from './store.mjs'
import { join } from 'node:path'

const port = Number(process.env.CIVIC_LOCAL_PORT ?? 3012)
const windows = projectWindows({
  current: loadProject(store).key, origin: `http://127.0.0.1:${port}`,
  async createHost(project, hostPort = 0) {
    const server = await createServer({ ...configuration({ manifest: project.manifestPath, applicationRoot: project.root }, hostPort), configFile: false })
    try {
      await server.listen()
      return { url: `http://127.0.0.1:${server.httpServer.address().port}/review`, close: () => server.close() }
    } catch (error) { await server.close(); throw error }
  },
})
function configuration(project = {}, hostPort = port) {
  return {
    root: canvasRoot,
    cacheDir: join(store, '.vite', project.manifest ? loadProject(store, project).key : 'main'),
    server: { host: '127.0.0.1', port: hostPort, strictPort: true },
    plugins: [...canvasPlugins({ store, project, picker: {
      openWindow: (project, lease) => windows.open(project, lease),
      releaseWindow: (project, lease) => windows.release(project.key, lease),
      windowOrigins: windows.origins,
    } }), { name: 'civic-project-window-cleanup', configureServer(server) {
      if (hostPort === port) server.httpServer.once('close', () => void windows.close())
    } }],
  }
}
export default configuration()

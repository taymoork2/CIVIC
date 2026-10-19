import { createRequire } from 'node:module'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import receipt from './receipt.json' with { type: 'json' }

/** Orca's real store and runtime, with no dispatcher, provider turns or host-command entry points. */
export async function createRuntime() {
  const source = receipt.source, require = createRequire(join(source, 'apps/server/package.json'))
  const Effect = require('effect/Effect'), Scope = require('effect/Scope'), Schema = require('effect/Schema')
  const native = file => import(/* @vite-ignore */ pathToFileURL(join(source, file)).href)
  const [{ makeStore }, { makeRuntime }, settings, { ClientMessage }] = await Promise.all([native('apps/server/src/store.ts'), native('apps/server/src/runtime.ts'), receipt.settings === false ? null : native('apps/server/src/settings.ts'), native('packages/contracts/src/index.ts')])
  const folder = await mkdtemp(join(tmpdir(), 'civic-orca-'))
  const projectPath = join(folder, 'project'); await mkdir(projectPath)
  // This code runs in CIVIC's dedicated runtime worker; it never changes the owner's process environment.
  process.env.ORCA_HOME = folder; process.env.ORCA_DISABLE_MODELS = '1'
  delete process.env.ORCA_ISOLATED_PREVIEW
  const scope = Effect.runSync(Scope.make())
  const store = await Effect.runPromise(Effect.provideService(makeStore(':memory:'), Scope.Scope, scope))
  const run = effect => Effect.runSync(effect)
  const runtime = makeRuntime(store, 'http://127.0.0.1:1/disabled', folder, { sourceDir: source, revision: receipt.server })
  const project = runtime.createProject('CIVIC synthetic project', projectPath)
  let screenSeed = {}
  if (receipt.screenDrafts) {
    const { WorkItem, Session, assistantSessionId } = await native('packages/contracts/src/index.ts')
    const now = '2026-10-18T00:00:00.000Z', workItemId = 'civic-synthetic-work', sessionId = 'civic-synthetic-session'
    const workItem = Schema.decodeUnknownSync(WorkItem)({ id: workItemId, projectId: project.id, title: 'Review the worktree draft', outcome: 'Inspect this version using synthetic data.', rung: 'dispatch', stage: null, needsHuman: null, coordinatorSessionId: sessionId, worktree: null, createdAt: now, updatedAt: now })
    const session = Schema.decodeUnknownSync(Session)({ id: sessionId, projectId: project.id, workItemId, parentId: null, role: 'coordinator', harness: 'claudeAgent', model: null, nativeSessionId: null, status: 'detached', stage: null, title: 'Synthetic draft conversation', createdAt: now, updatedAt: now })
    const home = Schema.decodeUnknownSync(Session)({ ...session, id: assistantSessionId(null), projectId: null, workItemId: null, role: 'assistant', title: 'Synthetic Home assistant' })
    for (const event of [{ _tag: 'WorkItemUpserted', workItem }, { _tag: 'SessionUpserted', session }, { _tag: 'SessionUpserted', session: home }, ...[sessionId, home.id].map(id => ({ _tag: 'TranscriptAppended', entry: { id: `civic-synthetic-message:${id}`, sessionId: id, role: 'assistant', text: 'This is synthetic preview content. No model or host command was executed.', at: now } }))]) run(store.append(event, { log: false }))
    screenSeed = { workItemId, sessionId }
  }
  const snapshot = () => run(store.snapshot)
  const projectSettings = id => {
    const project = snapshot().projects.find(row => row.id === id)
    if (!project) throw Error('Unknown isolated project')
    const get = key => run(store.kvGet(key))
    return settings.projectView(settings.loadSettings(project, get), get(settings.setupHashKey(id)))
  }
  return {
    seed: { projectId: project.id, projectPath, ui: receipt.ui, server: receipt.server, ...screenSeed },
    inspect: () => ({ account: 'owner', subject: 'synthetic-owner', accounts: ['owner'] }),
    state: () => ({ snapshot: snapshot(), settings: settings ? settings.parseApp(run(store.kvGet(settings.APP_SETTINGS_KEY))) : null }),
    async execute(kind, name, input) {
      if (name === 'snapshot' && kind === 'query') return snapshot()
      if (name === 'transcript' && kind === 'query') return run(store.transcript(input.sessionId))
      if (name !== 'command') throw Error('Unknown isolated Orca operation')
      const command = Schema.decodeUnknownSync(ClientMessage)({ _tag: 'Command', id: 'civic', command: input }).command
      const writes = ['CreateProject', 'SaveDraft', 'SaveAppSettings', 'SaveProjectSettings']
      const reads = ['GetAppSettings', 'GetProjectSettings', 'InspectInterruptedWork', 'SessionActivity', 'ListPreviews']
      if (!(kind === 'mutation' ? writes : reads).includes(command._tag)) throw Error('This isolated run cannot execute models, host commands, approvals, updates or external services')
      switch (command._tag) {
        case 'CreateProject':
          if (command.path !== projectPath) throw Error('Project path must be this run’s disposable project directory')
          return runtime.createProject(command.name, command.path)
        case 'SaveDraft': return run(store.append({ _tag: 'DraftSaved', draft: { key: command.key, text: command.text, updatedAt: new Date().toISOString() } }, { log: false }))
        case 'GetAppSettings': return { settings: settings.parseApp(run(store.kvGet(settings.APP_SETTINGS_KEY))), remote: { owner: null, url: null } }
        case 'SaveAppSettings': return run(store.kvSet(settings.APP_SETTINGS_KEY, JSON.stringify(command.settings)))
        case 'GetProjectSettings': return projectSettings(command.projectId)
        case 'SaveProjectSettings':
          if (command.target !== 'local' || !snapshot().projects.some(row => row.id === command.projectId)) throw Error('Only this isolated database’s project settings may be changed')
          run(store.kvSet(settings.projectSettingsKey(command.projectId), JSON.stringify(command.settings)))
          return projectSettings(command.projectId)
        case 'InspectInterruptedWork': return runtime.inspectInterruptedWork(command.projectId)
        case 'SessionActivity': return runtime.sessionActivity(command.workItemId)
        case 'ListPreviews': return runtime.previewStatus(command.sessionId)
      }
    },
  }
}

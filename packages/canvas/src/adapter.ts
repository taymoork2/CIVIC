import type { RuntimeBridge, RuntimePorts, RuntimeRecording } from './runtime-bridge'
import type { OpenRuntimeSession, PendingIntent } from './runtime-session'
import type { PreviewViewport } from './viewport-presets'
import type { Interaction } from './connection-semantics'

export type ReviewConfig = { scenario: string; persona: string; role: string; condition: string; theme: 'light' | 'dark'; textScale: 1 | 2; width: number; height?: number; preset?: string; simulation?: { pieces: 100 | 500 | 1000; stage: 'planning' | 'washing' | 'drying' | 'putaway' } }
export type ReviewSnapshot = { revision: { head: string; source: string; capturedAt: string }; design: { project: string; hashes: Record<string, string | null> } }
export type ProjectChoice = { id: string; label: string; description?: string; seed?: unknown }
export type ProjectProfile = { id: string; key: string; name: string; app?: { id: string; name: string }; connectionKind?: string; adapter: string; mode?: 'live-read-only'; preview: boolean; runtime?: boolean; personas: ProjectChoice[]; roles: ProjectChoice[]; conditions: ProjectChoice[]; navigation: string[] }
export type AdapterScenario = { id: string; label: string; journey: string; renderer?: string; route?: string; viewport?: { width: number; height: number }; fixture?: unknown; captureFields?: string[]; edges?: { action: string; destination: string; when?: string; returnTo?: string; interaction?: Interaction }[] }
export type AdapterState = { screen: string; dirty: boolean; pending: boolean; title: string; fields: { label: string; value: string }[] }
export type Presentation = Record<string, { title?: string; action?: string; color?: string }>
export type AdapterContext = {
  config: ReviewConfig; scenario: AdapterScenario; persona: ProjectChoice; role: ProjectChoice; condition: ProjectChoice; snapshot: ReviewSnapshot
  recording?: RuntimeRecording
  publish: (state: { screen: string; dirty?: boolean; pending?: boolean }) => void
  transition: (destination: string, action: string, origin?: 'app' | 'synthetic', departureHTML?: string) => void
  /**
   * Connects the app's runtime to the recorder. With `run`, the frame also offers the run's own steps (switching
   * synthetic account, the connection, the clock and saved steps) as recorded commands; `changed` lets the app
   * catch up after one, such as reloading what the new account may see.
   */
  connectRuntime: (ports: Omit<RuntimePorts, 'project' | 'source' | 'fields' | 'view' | 'interact'> & { screen: () => string; data: () => unknown; captureInputs: 'synthetic' | string[]; interact?: RuntimePorts['interact']; status?: () => { dirty: boolean; pending: boolean }; run?: OpenRuntimeSession; changed?: RunChange }) => RuntimeBridge
  /**
   * Starts an isolated run of the project's runtime entry and connects it: the clock, IDs and storage
   * are pinned, and the page's `fetch` calls under `routes` (default `/api/`) go to the run's backend.
   * Call `reset` to put the app back on its first screen with fresh data when a replay starts.
   * A persona with a review identity starts signed in (or out, for the manifest's `identity.signedOut` conditions);
   * the run holds the session, and password fields are filled with the run's credential.
   * A function backend (`createRuntime`) is called through the returned `query` and `mutation`, by function name;
   * mutations are recorded and checked on replay like any other write.
   */
  startRuntime: (options: RuntimeOptions) => Promise<{ bridge: RuntimeBridge; close: () => void; identity: RuntimeIdentity | null; query: RuntimeCall; mutation: RuntimeCall }>
}
export type RuntimeOptions = {
  routes?: string[]
  screen: () => string
  route?: () => string
  subscribe?: RuntimePorts['subscribe']
  captureInputs?: 'synthetic' | string[]
  status?: () => { dirty: boolean; pending: boolean }
  reset: () => Promise<void> | void
  /** Reads the app needs before its first screen is known, such as whether anyone is signed in. Runs after routing, before recording starts. */
  load?: () => Promise<void> | void
  /** Called after a run step: another synthetic account is acting, the connection changed, time moved or a saved step was sent. */
  changed?: RunChange
}
export type RunChange = (step: string) => Promise<void> | void
/** Calls one function of the run's backend by name, such as `items:list`. */
export type RuntimeCall = <T = unknown>(name: string, args?: Record<string, unknown>) => Promise<T>
/** The run behind a live preview, as the canvas sees it: who is acting, the connection and this account's saved steps. */
export type RunStatus = { run: string; account: string | null; subject: string | null; accounts: string[]; connected: boolean; now: number; pending: PendingIntent[]; path: string }
/** The persona's synthetic review identity for this run. The credential stays out of the app's preview code. */
export type RuntimeIdentity = { id: string; name: string; email: string; signedIn: boolean }
export type MountAdapter = (container: HTMLElement, context: AdapterContext) => void | (() => void) | Promise<void | (() => void)>
declare global {
  interface Window { reviewPreview?: { mode?: 'live-read-only'; retryWrites: () => void; restart: () => void; data: () => unknown; config: ReviewConfig; snapshot: ReviewSnapshot; flushDiscovery?: () => Promise<void>; exploration?: () => { state: unknown; targets: NonNullable<import('./runtime-bridge').RuntimeGesture['target']>[] }; explorationPoint?: (target: NonNullable<import('./runtime-bridge').RuntimeGesture['target']>) => Promise<{ x: number; y: number }>; setViewport?: (value: PreviewViewport) => Promise<void>; state?: () => AdapterState | null; recording?: RuntimeBridge['recording']; replay?: RuntimeBridge['replay']; replayMismatch?: RuntimeBridge['mismatch'] } }
  /** The live preview's run: its status, its recorded steps, and the frame address that reopens it. */
  interface Window { reviewRuntime?: { status: () => RunStatus; command: (name: string, value: unknown) => Promise<void>; reopen: () => string } }
}

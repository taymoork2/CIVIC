import type { RuntimeBridge, RuntimePorts, RuntimeRecording } from './runtime-bridge'

export type ReviewConfig = { scenario: string; persona: string; role: string; condition: string; theme: 'light' | 'dark'; textScale: 1 | 2; width: number; simulation?: { pieces: 100 | 500 | 1000; stage: 'planning' | 'washing' | 'drying' | 'putaway' } }
export type ReviewSnapshot = { revision: { head: string; source: string; capturedAt: string }; design: { project: string; hashes: Record<string, string | null> } }
export type ProjectChoice = { id: string; label: string; description?: string; seed?: unknown }
export type ProjectProfile = { id: string; key: string; name: string; adapter: string; preview: boolean; runtime?: boolean; personas: ProjectChoice[]; roles: ProjectChoice[]; conditions: ProjectChoice[]; navigation: string[] }
export type AdapterScenario = { id: string; label: string; journey: string; renderer?: string; route?: string; fixture?: unknown; captureFields?: string[]; edges?: { action: string; destination: string; when?: string; returnTo?: string }[] }
export type AdapterState = { screen: string; dirty: boolean; pending: boolean; title: string; fields: { label: string; value: string }[] }
export type Presentation = Record<string, { title?: string; action?: string; color?: string }>
export type AdapterContext = {
  config: ReviewConfig; scenario: AdapterScenario; persona: ProjectChoice; role: ProjectChoice; condition: ProjectChoice; snapshot: ReviewSnapshot
  recording?: RuntimeRecording
  publish: (state: { screen: string; dirty?: boolean; pending?: boolean }) => void
  transition: (destination: string, action: string, origin?: 'app' | 'synthetic') => void
  connectRuntime: (ports: Omit<RuntimePorts, 'project' | 'source' | 'fields' | 'view' | 'interact'> & { screen: () => string; data: () => unknown; captureInputs: 'synthetic' | string[]; interact?: RuntimePorts['interact']; status?: () => { dirty: boolean; pending: boolean } }) => RuntimeBridge
}
export type MountAdapter = (container: HTMLElement, context: AdapterContext) => void | (() => void) | Promise<void | (() => void)>
declare global {
  interface Window { reviewPreview?: { retryWrites: () => void; restart: () => void; data: () => unknown; config: ReviewConfig; snapshot: ReviewSnapshot; state?: () => AdapterState | null; recording?: RuntimeBridge['recording']; replay?: RuntimeBridge['replay']; replayMismatch?: RuntimeBridge['mismatch'] } }
}

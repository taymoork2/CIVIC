export type VersionHistory = {
  kind: 'code' | 'design' | 'pull-request'
  status: string
  key?: string
  baseKey?: string
  parentKey?: string
  sharedBase?: string
  revision?: string
  main?: boolean
  ahead?: number
  behind?: number
  updatedAt?: string
  capturedAt?: string
}
export type Choice = { key: string; workspace?: string; kind: string; available: boolean; sourceName?: string; workspaceName?: string; version?: { history?: VersionHistory } }
export type DraftScreen = { id: string; label: string; targetId?: string; componentId?: string; route?: string; component?: string; componentExport?: string; state?: string; fixture?: unknown }
export type AppVersion<T> = { id: string; name: string; description?: string; kind: string; history?: VersionHistory; connections: T[] }
export type VersionChoice<T> = AppVersion<T> & { preview: { id: string; row: T; screen: DraftScreen | undefined }; previews: { id: string; row: T; screen: DraftScreen | undefined }[]; current: boolean }
export function preferredConnection<T extends Choice>(rows: T[], remembered?: Pick<Choice, 'key' | 'workspace'>): T | undefined
export function matchingDraftScreens(rows: DraftScreen[], selected: DraftScreen, scope: 'screen' | 'component'): DraftScreen[]
export function versionChoices<T extends Choice>(versions: AppVersion<T>[], inventories: Record<string, DraftScreen[]>, selected: DraftScreen | undefined, active: string | undefined, query?: string): VersionChoice<T>[]
export function historyOrder<T extends { id: string; history?: VersionHistory }>(items: T[]): T[]

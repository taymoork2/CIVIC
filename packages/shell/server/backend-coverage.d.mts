import type { RecordedTape } from '../../../graph/src/index.ts'
import type { ReplayRecord } from '../../../importers/src/replay.ts'

export type BackendOperation = { id: string; file: string; export: string; kind: 'server-function' | 'route' | 'rpc' | 'query' | 'mutation' | 'action'; visibility?: 'public' | 'internal'; detector?: string; limits?: string[] }
export type BackendCoverage = { operations: (BackendOperation & { reachedBy: string[] })[]; unreached: string[]; unreachedInternal: string[] }
export function backendCoverage(operations: readonly BackendOperation[], tapes: ReadonlyMap<string, RecordedTape>, replays: readonly ReplayRecord[], options: { project: string; source: string; journeys: readonly { id: string; scenarios: readonly string[] }[] }): BackendCoverage

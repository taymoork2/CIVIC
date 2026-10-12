import type { MapScenario, MapScreen } from './app-map'
export const entryScreens: string[]
export const towelEdges: { from: string; to: string; label: string; when?: string }[]
export function journeyGraph(scenarios: MapScenario[], project?: { adapter: string }): { id: string; label: string; screens: MapScreen[] }[]
export function pathId(from: string, to: string, action: string): string

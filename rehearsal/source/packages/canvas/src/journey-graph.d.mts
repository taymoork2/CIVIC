import type { MapScenario, MapScreen } from './app-map'
export function journeyGraph(scenarios: MapScenario[], project?: { adapter: string }): { id: string; label: string; screens: MapScreen[] }[]
export function pathId(from: string, to: string, action: string): string

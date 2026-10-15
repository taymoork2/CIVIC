import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { indexGraph, type Graph } from './graph.ts'
import { resolveProfile, type MethodProfile, type ResolvedProfile } from './method.ts'
import { assertValid } from './validate.ts'

/** Reads a graph document from disk without validating it. */
export async function readGraphFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

/** Reads, validates and indexes a graph document. Throws with every error if it is invalid. */
export async function loadGraph(path: string): Promise<Graph> {
  const document = await readGraphFile(path)
  assertValid(document)
  return indexGraph(document)
}

/** The profiles CIVIC ships (decision 0014), as `graph/methods/<id>.json`. None is the default. */
export function bundledProfile(id: string): MethodProfile | undefined {
  if (!/^[a-z0-9-]+$/.test(id)) return undefined
  const file = new URL(`../methods/${id}.json`, import.meta.url)
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as MethodProfile) : undefined
}

/** Reads a team's `civic.method/0` file and applies the bundled profile it extends. Throws if it is invalid. */
export function readMethodProfile(path: string | URL): ResolvedProfile {
  return resolveProfile(JSON.parse(readFileSync(path, 'utf8')) as MethodProfile, bundledProfile)
}

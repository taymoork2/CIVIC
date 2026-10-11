import { readFile } from 'node:fs/promises'
import { indexGraph, type Graph } from './graph.ts'
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

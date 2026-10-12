import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The canvas package folder: `review.html`, `review-frame.html`, their `src/` and the Notebook example. */
export const canvasRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

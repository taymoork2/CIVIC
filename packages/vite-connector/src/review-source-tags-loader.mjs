/* oxlint-disable oxc/no-this-in-exported-function -- the webpack loader API passes its context only as `this`. */
import path from 'node:path'
import { tagHostElements } from './review-source-tags.mjs'

/** Development-only pre-loader for webpack, Rspack and Turbopack. */
export default function sourceTagsLoader(code, inputMap) {
  let result
  try {
    const { root, include } = this.getOptions()
    if (typeof root !== 'string' || !path.isAbsolute(root) || !Array.isArray(include) || !include.every(glob => typeof glob === 'string')) throw new Error('CIVIC source tags require an absolute root and an array of include globs.')
    const relative = path.relative(root, this.resourcePath).split(path.sep).join('/')
    result = include.some(glob => path.matchesGlob(relative, glob)) ? tagHostElements(code, this.resourcePath, { root }) : { code, map: inputMap }
  } catch (error) {
    this.callback(error)
    return
  }
  this.callback(null, result.code, result.code === code ? inputMap : result.map)
}

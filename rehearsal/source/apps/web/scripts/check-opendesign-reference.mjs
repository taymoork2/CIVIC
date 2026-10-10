#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { referenceInputHashes } from './opendesign-reference-inputs.mjs'

const [project, requestedCase] = process.argv.slice(2)
assert(project && requestedCase && process.argv.length === 4, 'Usage: check-opendesign-reference.mjs <project-directory> <case-name>')
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const projectRoot = resolve(project)
const digest = async (file) => createHash('sha256').update(await readFile(file)).digest('hex')
const receipt = JSON.parse(await readFile(resolve(projectRoot, 'source-reference/receipt.json'), 'utf8'))
assert.equal(receipt.version, 2, 'Older receipt: regenerate with complete UI/fixture input fingerprints.')
assert.equal(receipt.status, 'verified', 'Export did not finish successfully.')
assert.deepEqual(receipt.sourceHashes, await referenceInputHashes(webRoot), 'Stale reference: app, asset, fixture or dependency inputs changed; export/import again.')
const example = receipt.cases.find((entry) => entry.name === requestedCase)
assert(example, `No verified case named ${requestedCase}; export the required screen/state first.`)
assert(/^[a-z0-9][a-z0-9-]*$/.test(example.name), 'Unsafe case filename.')
assert.equal(example.geometryMatches, true, 'Source/reference metrics differ.')
assert.equal(example.pixelComparison.outsideImages, 0, 'Source/reference control or layout pixels differ.')
for (const [suffix, expected] of [['html', example.htmlSha256], ['png', example.referenceScreenshotSha256], ['source.png', example.sourceScreenshotSha256]]) {
  assert.equal(await digest(resolve(projectRoot, 'source-reference', `${example.name}.${suffix}`)), expected, `Modified reference ${suffix}; regenerate rather than restyling the baseline.`)
}
console.log(`Verified current reference: ${example.name}, ${example.screen}${example.state ? `/${example.state}` : ''}, ${example.width}×${example.height}, ${example.theme}, ${example.scale}× text. Proposal review and interaction verification remain separate.`)

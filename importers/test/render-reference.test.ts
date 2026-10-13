import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { readRenderReceipt, type RenderReceipt } from '../src/index.ts'

// A design tool with no Figma-style export: Open Design's source-render receipt read as a
// civic.design/0 file, one frame per rendered case.

const receipt = JSON.parse(readFileSync(new URL('../../journey-engine/design/laundry-reference/source-reference/receipt.json', import.meta.url), 'utf8')) as RenderReceipt
const options = { tool: 'open-design', key: 'laundry', name: 'Laundry design reference', designs: (screen: string) => (screen === 'missing' ? [] : [`target:laundry.legacy.${screen}`]) }

test('each case of the receipt is a frame on its screen, designing that screen', () => {
  const design = readRenderReceipt(receipt, options)
  assert.deepEqual({ schema: design.schema, tool: design.tool, key: design.key, version: design.version, frames: design.frames.length }, { schema: 'civic.design/0', tool: 'open-design', key: 'laundry', version: receipt.generatedAt, frames: receipt.cases.length })
  const first = design.frames[0]!
  assert.deepEqual({ ...first, hash: undefined }, { node: 'drying-phone-light', name: 'drying-home · 393×852 light', page: 'drying-home', hash: undefined, designs: ['target:laundry.legacy.drying-home'] })
  assert.match(first.hash, /^sha256:[0-9a-f]{64}$/)
  const invalid = design.frames.find((frame) => frame.node === 'signin-invalid-phone-light')!
  assert.equal(invalid.name, 'sign-in (invalid) · 393×852 light')
  assert.ok(design.frames.some((frame) => frame.name.endsWith('· text ×2')))
})

test('a frame changes when its reference image or render settings change, and not otherwise', () => {
  const hashOf = (edit: (item: RenderReceipt['cases'][number]) => void) => {
    const copy = structuredClone(receipt)
    edit(copy.cases[0]!)
    return readRenderReceipt(copy, options).frames[0]!.hash
  }
  const base = hashOf(() => {})
  assert.equal(readRenderReceipt(receipt, options).frames[0]!.hash, base)
  assert.notEqual(hashOf((item) => (item.referenceScreenshotSha256 = '0'.repeat(64))), base)
  assert.notEqual(hashOf((item) => (item.theme = 'dark')), base)
  // The app's render of the same case is the code side, not the design: it moves no frame.
  assert.equal(hashOf((item) => (item.htmlSha256 = '0'.repeat(64))), base)
})

test('a screen no target matches designs nothing, and an unverified or repeated receipt is refused', () => {
  const copy = structuredClone(receipt)
  copy.cases[0]!.screen = 'missing'
  assert.deepEqual(readRenderReceipt(copy, options).frames[0]!.designs, [])
  assert.throws(() => readRenderReceipt({ ...receipt, status: 'stale' }, options), /not verified/)
  assert.throws(() => readRenderReceipt({ ...receipt, cases: [receipt.cases[0]!, receipt.cases[0]!] }, options), /twice/)
  assert.throws(() => readRenderReceipt({} as RenderReceipt, options), /not a source-render receipt/)
})

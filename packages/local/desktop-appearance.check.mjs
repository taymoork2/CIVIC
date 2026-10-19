import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { readAppearance, saveAppearance } from './desktop-appearance.mjs'

test('desktop appearance persists one validated preference without replacing it on invalid input', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'civic-desktop-appearance-')), 'desktop/appearance.json')
  assert.equal(readAppearance(file), 'system')
  saveAppearance(file, 'dark')
  assert.equal(readAppearance(file), 'dark')
  const before = await readFile(file, 'utf8')
  for (const value of [null, {}, 'automatic', '../light']) assert.throws(() => saveAppearance(file, value), /Invalid appearance/)
  assert.equal(await readFile(file, 'utf8'), before)
  saveAppearance(file, 'system')
  assert.equal(readAppearance(file), 'system')
  await writeFile(file, '{invalid')
  assert.equal(readAppearance(file), 'system')
})

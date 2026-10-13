import { expect, test } from '@playwright/test'
import type { RuntimeRecording } from '@civic/canvas/runtime-bridge'

async function open(page: import('@playwright/test').Page, scenario: string, condition = 'normal') {
  await page.goto(`/review-frame.html?scenario=${scenario}&condition=${condition}`)
  await expect(page.locator('#review-root')).toHaveAttribute('data-rehearsal-ready', 'true')
}
const recording = (page: import('@playwright/test').Page) => page.evaluate(async () => window.reviewPreview!.recording!())
const replay = (page: import('@playwright/test').Page, tape: RuntimeRecording) => page.evaluate(async (input) => { try { return await window.reviewPreview!.replay!(input) } catch (error) { throw Error(`${(error as Error).message}\n${JSON.stringify(window.reviewPreview!.replayMismatch?.())}`) } }, tape)

test('Home uses the shipped Wear action, captures its real arguments and replays with no second wear', async ({ page }) => {
  await open(page, 'app.home')
  await page.getByRole('button', { name: 'Wear this', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Wearing ✓', exact: true })).toBeDisabled()
  const tape = await recording(page)
  expect(tape.steps.flatMap((step) => step.operations)).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'outfits:wear', args: expect.objectContaining({ planId: expect.any(String), signature: expect.any(String), date: expect.any(String), timeZone: expect.any(String) }) })]))
  expect(await replay(page, tape)).toEqual({ verified: tape.steps.length })
  const state = await page.evaluate(() => window.reviewPreview!.data() as { textiles: { name: string; wearsSinceClean?: number }[] })
  expect(state.textiles.filter((item) => item.name === 'Cotton tee').map((item) => item.wearsSinceClean)).toEqual([1, 1])
})

test('Drying empty has a real return path to Laundry and replay follows it', async ({ page }) => {
  await open(page, 'app.drying.empty')
  await page.getByRole('button', { name: 'Back to Laundry' }).last().click()
  await expect.poll(() => page.evaluate(() => (window.reviewPreview!.data() as { path: string }).path)).toBe('/laundry')
  const tape = await recording(page)
  expect(tape.steps.at(-1)!.route).toBe('/laundry')
  expect(await replay(page, tape)).toEqual({ verified: tape.steps.length })
})

test('put-away selection records inputs and actual effects across the empty branch and return', async ({ page }) => {
  await open(page, 'app.drying.putaway-one')
  await page.getByRole('button', { name: /1 piece dry, to put away/ }).click()
  await page.getByRole('button', { name: /^Put away/ }).click()
  await expect.poll(async () => (await recording(page)).steps.flatMap((step) => step.operations).some((operation) => operation.name === 'dryingQueue:putAway')).toBe(true)
  const tape = await recording(page)
  expect(tape.steps.flatMap((step) => step.operations).find((operation) => operation.name === 'dryingQueue:putAway')!.args).toMatchObject({ pieceIds: expect.any(Array) })
  expect(await replay(page, tape)).toEqual({ verified: tape.steps.length })
})

test('Home outfit editing records portalled inputs, quantities and Escape, then replays the return', async ({ page }) => {
  await open(page, 'app.home')
  await page.getByRole('button', { name: 'View today’s outfit', exact: true }).click()
  await page.getByRole('button', { name: 'Change today’s outfit', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Find ready clothes' }).fill('Cotton')
  await page.getByRole('button', { name: 'Fewer Cotton tee, White' }).click()
  await page.getByRole('button', { name: 'Save outfit', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: 'Find ready clothes' })).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  const tape = await recording(page)
  expect(tape.steps.some((step) => step.fields.some((field) => field.label === 'Find ready clothes' && field.value === 'Cotton'))).toBe(true)
  expect(tape.steps.flatMap((step) => step.operations).find((operation) => operation.name === 'outfits:save')!.args).toMatchObject({ items: [{ quantity: 1, textileId: expect.any(String) }] })
  expect(tape.steps.at(-1)!.gesture).toMatchObject({ kind: 'key', value: 'Escape' })
  expect(await replay(page, tape)).toEqual({ verified: tape.steps.length })
})

test('partial put-away captures quantity, clear/all branches and keeps the remaining piece', async ({ page }) => {
  await open(page, 'app.drying')
  await page.getByRole('button', { name: /2 pieces dry, to put away/ }).click()
  await page.getByRole('button', { name: 'Clear selection' }).click()
  await page.getByRole('button', { name: 'Select all dry pieces' }).click()
  await page.getByRole('button', { name: 'Fewer Cream towel' }).click()
  await page.getByRole('button', { name: /^Put away 1/ }).click()
  const tape = await recording(page)
  expect(tape.steps.some((step) => step.fields.some((field) => field.label === 'Cream towel' && field.value === '1'))).toBe(true)
  expect(await replay(page, tape)).toEqual({ verified: tape.steps.length })
  expect(await page.evaluate(() => (window.reviewPreview!.data() as { pieces: unknown[] }).pieces.length)).toBe(1)
})

test('no-ready outfit goes to Laundry; a failed Wear stays on Home with a replayable error receipt', async ({ page }) => {
  await open(page, 'app.home.no-ready')
  await page.getByRole('button', { name: 'Choose today’s outfit', exact: true }).click()
  await page.getByRole('link', { name: 'Go to Laundry', exact: true }).click()
  let tape = await recording(page)
  expect(tape.steps.at(-1)!.route).toBe('/laundry')
  expect(await replay(page, tape)).toEqual({ verified: tape.steps.length })
  await open(page, 'app.home', 'save-error')
  await page.getByRole('button', { name: 'Wear this', exact: true }).click()
  await expect(page.getByText('Isolated save failed. Your draft is kept.', { exact: true })).toBeVisible()
  tape = await recording(page)
  expect(tape.steps.flatMap((step) => step.operations).find((operation) => operation.name === 'outfits:wear')!.error).toContain('Isolated save failed')
  expect(await replay(page, tape)).toEqual({ verified: tape.steps.length })
})

test('saved recordings reopen on their original preset and clock in a fresh preview', async ({ page }) => {
  await open(page, 'app.home')
  await page.getByRole('button', { name: 'Wear this', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Wearing ✓', exact: true })).toBeDisabled()
  const tape = await recording(page)
  const response = await page.request.post('/api/review/runs', { data: tape })
  expect(response.ok()).toBe(true)
  const saved = await response.json()
  await page.goto(`/review-frame.html?recording=${saved.id}`)
  await expect(page.getByRole('button', { name: 'Wearing ✓', exact: true })).toBeDisabled()
  expect(await recording(page)).toEqual(tape)
  expect(await page.evaluate(() => [Date.now(), new Date().getTime()])).toEqual([tape.now, tape.now])
})

test('sensitive fields stay out of recordings and an ambiguous control stops replay before a mutation', async ({ page }) => {
  await open(page, 'app.home')
  await page.evaluate(() => {
    for (const [type, label] of [['password', 'Password'], ['text', 'Access token']]) {
      const input = document.createElement('input'); input.type = type!; input.setAttribute('aria-label', label!); document.body.append(input)
    }
  })
  await page.getByLabel('Password', { exact: true }).fill('never-record-this')
  await page.getByLabel('Access token', { exact: true }).fill('never-record-this')
  await page.getByRole('button', { name: 'Wear this', exact: true }).click()
  const tape = await recording(page)
  expect(JSON.stringify(tape)).not.toMatch(/never-record-this|Password|Access token/)
  await page.evaluate(() => { const button = document.createElement('button'); button.textContent = 'Wear this'; document.body.append(button) })
  await expect(replay(page, tape)).rejects.toThrow('ambiguous')
  expect(await page.evaluate(() => (window.reviewPreview!.data() as { textiles: { name: string; wearsSinceClean?: number }[] }).textiles.filter((item) => item.name === 'Cotton tee').map((item) => item.wearsSinceClean ?? 0))).toEqual([0, 0])
})

test('a finished replay is kept as CIVIC run evidence about the screen the run started from', async ({ page }) => {
  await open(page, 'app.drying.empty')
  await page.getByRole('button', { name: 'Back to Laundry' }).last().click()
  await expect.poll(() => page.evaluate(() => (window.reviewPreview!.data() as { path: string }).path)).toBe('/laundry')
  const tape = await recording(page)
  const receipt = await replay(page, tape)
  // The canvas's run controls post exactly this after a replay (decision 0009).
  const kept = await page.request.post('/api/review/replays', { data: { tape, outcome: 'pass', verified: receipt.verified } })
  expect(kept.status()).toBe(201)
  const { replay: record } = await kept.json()
  expect(record).toEqual(expect.objectContaining({ schema: 'civic.replay/0', scenario: 'app.drying.empty', outcome: 'pass', steps: tape.steps.length, source: tape.source }))
  const listed = await (await page.request.get('/api/review/replays')).json() as { tape: string }[]
  expect(listed.map((item) => item.tape)).toContain(record.tape)
})

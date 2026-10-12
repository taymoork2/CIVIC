import { expect, test, type Page } from '@playwright/test'
import type { RuntimeRecording } from '@civic/canvas/runtime-bridge'

const tape = (page: Page) => page.evaluate(() => window.reviewPreview!.recording!())
const replay = (page: Page, recording: RuntimeRecording) => page.evaluate(async (input) => {
  try { return await window.reviewPreview!.replay!(input) }
  catch (error) { throw Error(`${(error as Error).message}\n${JSON.stringify(window.reviewPreview!.replayMismatch?.())}`) }
}, recording)
const screen = (page: Page) => page.evaluate(() => window.guidedJourney?.state()?.screen)
const next = (page: Page) => page.locator('button[type="submit"]').click()

for (const branch of ['new', 'pre-owned']) test(`towel ${branch} branch captures real inputs, saves through the app and replays from a fresh seed`, async ({ page }) => {
  await page.goto(`/review-frame.html?scenario=intake.towel.fabric&journey=towel&branch=${branch}`)
  await expect(page.getByRole('heading', { name: 'What’s it made of?' })).toBeVisible()
  expect(await page.evaluate(() => typeof window.reviewPreview?.recording)).toBe('function')
  await page.getByLabel('Other material 1', { exact: true }).fill('Retained cotton')
  await next(page); await expect.poll(() => screen(page)).toBe('color')
  await next(page); await expect.poll(() => screen(page)).toBe('origin')
  await next(page); await expect.poll(() => screen(page)).toBe(branch === 'new' ? 'dye' : 'care:wash')
  if (branch === 'new') { await next(page); await expect.poll(() => screen(page)).toBe('care:wash') }
  for (const destination of ['care:bleach', 'care:dry', 'stain', 'final']) { await next(page); await expect.poll(() => screen(page)).toBe(destination) }
  await next(page); await expect.poll(() => screen(page)).toBe('saved')
  const recording = await tape(page)
  expect(recording.steps.some((step) => step.fields.some((field) => field.value === 'Retained cotton'))).toBe(true)
  expect(recording.steps.some((step) => step.route.endsWith('/dye'))).toBe(branch === 'new')
  const save = recording.steps.flatMap((step) => step.operations).find((operation) => operation.name === 'inventory:createTextiles')!
  expect(save.args).toMatchObject({ householdId: expect.any(String), material: expect.stringContaining('Retained cotton') })
  expect(save.args).not.toHaveProperty('reviewFixture')
  expect(save.result).toEqual([expect.any(String)])
  expect(await replay(page, recording)).toEqual({ verified: recording.steps.length })
  const response = await page.request.post('/api/review/runs', { data: recording }); expect(response.ok()).toBe(true)
  const saved = await response.json(); await page.goto(`/review-frame.html?recording=${saved.id}`)
  await expect(page.locator('#review-root')).toHaveAttribute('data-rehearsal-ready', 'true')
  expect(await tape(page)).toEqual(recording)
})

test('proposal commands are part of the shared tape and replay without discarding the towel draft', async ({ page }) => {
  await page.goto('/review-frame.html?scenario=intake.towel.fabric&journey=towel')
  await expect(page.getByLabel('Other material 1', { exact: true })).toBeVisible()
  await page.getByLabel('Other material 1', { exact: true }).fill('Proposal cotton')
  await page.evaluate(() => window.guidedJourney!.setPresentation({ fabric: { title: 'Your towel fibers', action: 'Try this composition', color: '#123456' } }, 7))
  await expect(page.getByRole('heading', { name: 'Your towel fibers' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try this composition' })).toHaveCSS('background-color', 'rgb(18, 52, 86)')
  await expect(page.getByLabel('Other material 1', { exact: true })).toHaveValue('Proposal cotton')
  await page.getByRole('button', { name: 'Try this composition' }).click()
  const recording = await tape(page)
  expect(recording.steps.some((step) => step.gesture.kind === 'command')).toBe(true)
  expect(await replay(page, recording)).toEqual({ verified: recording.steps.length })
  expect(await page.evaluate(() => window.guidedJourney!.state()?.draft)).toMatchObject({ material: expect.stringContaining('Proposal cotton') })
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your towel fibers' })).toBeVisible()
  const saved = await page.request.post('/api/review/runs', { data: await tape(page) }); expect(saved.ok()).toBe(true)
  await page.goto(`/review-frame.html?recording=${(await saved.json()).id}`)
  await expect(page.getByRole('heading', { name: 'Your towel fibers' })).toBeVisible()
  await expect(page.getByLabel('Other material 1', { exact: true })).toHaveValue('Proposal cotton')
})

test('a failed towel save keeps its draft, records recovery and replays the successful retry', async ({ page }) => {
  await page.goto('/review-frame.html?scenario=intake.towel.final&journey=towel&condition=save-error')
  await expect(page.getByRole('button', { name: 'Save item', exact: true })).toBeVisible()
  await next(page)
  await expect(page.getByText('Isolated save failed. Your draft is kept.', { exact: true })).toBeVisible()
  await page.evaluate(() => window.reviewPreview!.retryWrites())
  await next(page); await expect.poll(() => screen(page)).toBe('saved')
  const recording = await tape(page)
  expect(recording.steps.flatMap((step) => step.operations).filter((op) => op.name === 'inventory:createTextiles')).toEqual([expect.objectContaining({ error: expect.stringContaining('Isolated save failed') }), expect.objectContaining({ result: [expect.any(String)] })])
  expect(await replay(page, recording)).toEqual({ verified: recording.steps.length })
})

test('portalled towel screens and the saved outcome produce real snapshots', async ({ page }) => {
  await page.goto('/review')
  for (const id of ['fabric', 'care:bleach', 'saved']) {
    const response = await page.request.get(`/api/review/fixture.png?screen=${encodeURIComponent(id)}`)
    expect(response.ok(), response.ok() ? '' : await response.text()).toBe(true)
    expect(response.headers()['content-type']).toBe('image/png')
    expect([...(await response.body()).subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  }
})

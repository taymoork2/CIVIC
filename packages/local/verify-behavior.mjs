import assert from 'node:assert/strict'
import { moduleReviewAdapter } from '../canvas/server/module-adapter.mjs'

async function check(options, title, node, exercise) {
  try {
    return await moduleReviewAdapter.captureFixture(node, { ...options, writes: true, visit: async page => {
      page.setDefaultTimeout(10000)
      const assertions = await exercise(page)
      const tape = await page.evaluate(() => window.reviewPreview.recording())
      assert.ok(tape.steps.some(step => step.operations.some(operation => operation.kind === 'mutation')), 'A passing write check must retain the gesture and its actual backend operation')
      const { id } = await options.saveRecording(tape)
      return { title, outcome: 'pass', assertions, run: id }
    } })
  } catch (error) { return { title, outcome: 'fail', error: error.message.split('\n')[0].slice(0, 300) } }
}
const settle = page => page.evaluate(async () => { await window.reviewPreview.recording(); return window.reviewPreview.data() })
const node = (id, viewport = { width: 1440, height: 900 }) => ({ id, scenario: id, viewport })

export async function verifyOrca(options) {
  const checks = []
  checks.push(await check(options, 'Orca settings: save, read back and revert', node('orca.isolated.settings'), async page => {
    const toggle = page.getByRole('checkbox', { name: /Use fallback/ })
    assert.equal(await toggle.isChecked(), true)
    await toggle.uncheck()
    assert.equal((await settle(page)).settings.autoFallback, false)
    await toggle.check()
    assert.equal((await settle(page)).settings.autoFallback, true)
    return ['The actual settings control writes autoFallback=false to this run’s store.', 'A second write restores autoFallback=true; UI and backend agree.']
  }))
  checks.push(await check(options, 'Orca project: reject an outside path, create inside the run', node('orca.isolated.new-project'), async page => {
    const data = await settle(page), before = data.snapshot.projects.length
    await page.getByPlaceholder('/absolute/path/to/repo').fill('/outside-disposable-run')
    await page.getByPlaceholder('Name (defaults to folder)').fill('CIVIC write check')
    await page.getByRole('button', { name: 'Add project', exact: true }).click()
    assert.equal((await settle(page)).snapshot.projects.length, before)
    await page.getByRole('main').getByText(/Project path must be/).waitFor()
    await page.getByPlaceholder('/absolute/path/to/repo').fill(data.projectPath)
    await page.getByRole('button', { name: 'Add project', exact: true }).click()
    const saved = await settle(page)
    assert.equal(saved.snapshot.projects.length, before + 1)
    assert.equal(saved.snapshot.projects.filter(row => row.name === 'CIVIC write check').length, 1)
    assert.equal(saved.snapshot.projects.find(row => row.name === 'CIVIC write check').path, data.projectPath)
    return ['Outside paths are refused and create no project.', 'The actual Add project form creates exactly one project in the disposable directory and navigates to it.']
  }))
  return checks
}
export async function verifyLaundry(options) {
  const checks = []
  for (const condition of ['normal', 'save-error']) checks.push(await check(options, `Laundry intake: ${condition === 'normal' ? 'save and inspect retained records' : 'failed save retains draft and creates no records'}`, { ...node('intake.towel.final', { width: 393, height: 852 }), condition }, async page => {
    const before = await settle(page)
    await page.getByRole('button', { name: 'Save item', exact: true }).click()
    const after = await settle(page)
    if (condition === 'normal') {
      await page.getByRole('heading', { name: 'Saved', exact: true }).waitFor()
      assert.equal(after.textiles.length, before.textiles.length + 1)
      const added = after.textiles.find(row => !before.textiles.some(old => old._id === row._id))
      assert.ok(added); assert.match(added.name, /towel/i)
      return ['The real intake form saves through Laundry’s actual Convex mutation in a fresh convex-test database.', 'The saved screen appears and exactly one new towel is retained in backend state.']
    }
    assert.equal(after.textiles.length, before.textiles.length)
    await page.getByRole('button', { name: 'Save item', exact: true }).waitFor()
    assert.ok(after.draft)
    assert.equal(after.draft.name, before.draft.name)
    return ['The declared save-error condition rejects the actual mutation.', 'No textile is created; the draft and Save item control remain available.']
  }))
  return checks
}

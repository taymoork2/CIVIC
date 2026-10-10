import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { api } from '../src/api'
import type { Id } from '@convex/_generated/dataModel'
import { addBottle, addMachines, answerCards, careLabel, closetRows, convexAs, createHousehold, dryAndPutAway, email, openHousehold, password, signUp, topDialog } from './flows'

// Report capture, not acceptance: walks the consolidated journey as a new user on the actual routes.
// Run only on purpose: WASHCLOSET_JOURNEY_REPORT=1 (see docs/audits/2026-10-05-consolidated-journey).
test.skip(process.env.WASHCLOSET_JOURNEY_REPORT !== '1', 'Journey report capture runs only when asked')
test.describe.configure({ mode: 'serial' })
test.use({ locale: 'en-US', viewport: { width: 393, height: 852 }, contextOptions: { reducedMotion: 'reduce' } })

const out = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/audits/2026-10-05-consolidated-journey')
type Stage = 'Start' | 'Add clothes' | 'Plan and wash' | 'Dry and put away' | 'History and records' | 'Products and appliances' | 'Account and errors'
type Capture = { id: string; stage: Stage; title: string; caption: string; findings: string[]; url: string; screenshot: string; text: string; changedOn?: 'October 6' | 'October 6 (laundry day)' | 'October 7 (redesign)'; was?: 'October 6' | 'October 6 (laundry day)' }
type Tag = NonNullable<Capture['changedOn']>
const captures: Capture[] = []
/**
 * Captures that exist since October 5 or 6 but were redrawn in the October 7 redesign (line garment icons, grouped rows,
 * the day strip, pickers, dryer heat). They carry the October 7 tag and keep their earlier one in `was`.
 */
const redesigned = new Set(['intake-type-grid', 'intake-search', 'intake-back-keeps', 'intake-color', 'intake-saved', 'closet-after-intake', 'known-mark', 'laundry-hamper', 'what-goes-in', 'which-dryer',
  'drying-plan', 'is-it-dry', 'put-away-partial', 'home-after-load', 'me-history', 'garment-care-fabric', 'garment-history', 'water-row', 'wool-refused', 'drying-stain-check', 'care-stain-gone',
  'stain-what-next', 'stain-cleaner-first-wool', 'stain-cleaner-first', 'stain-second-try-plan', 'not-found', 'account', 'day-plan-card', 'day-spread-out', 'day-home-until', 'day-strip', 'day-strip-list',
  'day-settings', 'next-held', 'dryer-busy-home', 'dryer-busy-load', 'dryer-share', 'shared-whats-free', 'shared-start-one', 'shared-none-free-step', 'shared-none-free-drying', 'early-check-planned', 'early-check-take-out',
  // The October 7 night pass: stacked choices became rows, lists and symbol tiles, with "?" tips.
  'your-household', 'intake-fabric', 'intake-details', 'intake-stains-save', 'intake-set-in-stain', 'intake-pre-owned', 'intake-pre-owned-final', 'plan-needs-washer', 'cap-line-every-load',
  'prep-step-options', 'dryer-heat-unknown-low', 'plan-ready'])
/** Tag the capture just taken: the October 7 tag for a redesigned state (remembering the earlier one), else the given one. */
function tagLast(slug: string, tag: Tag | undefined) {
  const last = captures.at(-1)!
  if (redesigned.has(slug)) { last.changedOn = 'October 7 (redesign)'; if (tag !== undefined && tag !== 'October 7 (redesign)') last.was = tag } else if (tag !== undefined) last.changedOn = tag
}
const skipped: string[] = []
let count = 0

function writeManifest() {
  writeFileSync(join(out, 'captures.json'), `${JSON.stringify(captures, null, 2)}\n`)
  writeFileSync(join(out, 'skipped.json'), `${JSON.stringify(skipped, null, 2)}\n`)
}

/** Screenshot the viewport and record the open dialog's text, or the main region's. */
async function snap(page: Page, slug: string, stage: Stage, title: string, caption: string, findings: string[] = []) {
  count += 1
  const id = `${String(count).padStart(2, '0')}-${slug}`
  // Brief confirmations float over the top of the screen; capture the state once they have gone.
  await page.locator('[data-sonner-toast]').first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined)
  await page.waitForTimeout(400)
  const dialog = page.getByRole('dialog').last()
  const scope: Locator = await dialog.isVisible().catch(() => false) ? dialog : (await page.getByRole('main').count()) > 0 ? page.getByRole('main').first() : page.locator('body')
  const text = ((await scope.innerText().catch(() => '')) ?? '').trim().slice(0, 4000)
  await page.screenshot({ path: join(out, 'captures', `${id}.jpg`), type: 'jpeg', quality: 70 })
  const url = new URL(page.url())
  captures.push({ id, stage, title, caption, findings, url: url.pathname + url.search, screenshot: `captures/${id}.jpg`, text })
  tagLast(slug, undefined)
  writeManifest()
}

/** A state that landed on October 6; the report lists these in "What changed on October 6". */
async function snap6(page: Page, slug: string, stage: Stage, title: string, caption: string, findings: string[] = []) {
  // The last tap leaves a hover highlight on whatever row is under the pointer.
  await page.mouse.move(1, 1)
  await snap(page, slug, stage, title, caption, findings)
  tagLast(slug, 'October 6')
  writeManifest()
}

/** A state that is new or changed in the October 7 redesign (compact rows, line icons, pickers, dryer heat); listed in "What changed on October 7". */
async function snap7(page: Page, slug: string, stage: Stage, title: string, caption: string, findings: string[] = []) {
  await page.mouse.move(1, 1)
  await snap(page, slug, stage, title, caption, findings)
  tagLast(slug, 'October 7 (redesign)')
  writeManifest()
}

/** A laundry-day state (design docs/plans/2026-10-06-dryer-sharing-design.md); listed in the report's "Laundry day". */
async function snapDay(page: Page, slug: string, stage: Stage, title: string, caption: string) {
  await page.mouse.move(1, 1)
  await snap(page, slug, stage, title, caption)
  tagLast(slug, 'October 6 (laundry day)')
  writeManifest()
}

/** A laundry-day capture the app may not reach; recorded in skipped.json with the reason. */
const maybeDay = (name: string, fn: () => Promise<void>) => maybe(`laundry day: ${name}`, fn)

type Client = Awaited<ReturnType<typeof convexAs>>['client']
const evidence = { source: 'Synthetic machine plate', confidence: 'verified' as const }

/**
 * A fresh single-wearer household signed up in the app, with machines, a detergent and garments set up
 * through the API, as the laundry-day specs do (dryer-busy, next-step, day-plan, mid-run-check, shared-start).
 */
async function dayHousehold(page: Page, who: string, location: 'home' | 'shared') {
  await signUp(page, who, 'Robin Day')
  await createHousehold(page, location === 'home' ? 'At home' : 'Shared laundry room')
  const { client, householdId } = await convexAs(page)
  const detergent = await client.mutation(api.inventory.createSupply, { householdId, name: 'HE liquid detergent', kind: 'chemical', use: 'detergent',
    safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'HE liquid', form: 'liquid', highEfficiencyCompatible: true }, provenance: evidence })
  await client.mutation(api.inventory.saveRule, { supplyId: detergent, dose: { amount: 30, unit: 'ml' }, stage: 'wash', placement: 'direct_to_drum', timing: 'before loading garments', provenance: evidence })
  const washer = (name: string, minutes: number) => client.mutation(api.inventory.createMachine, { householdId, name, applianceType: 'top_load_washer', location, highEfficiency: false,
    capacityUnits: 20, capacityConfidence: 'verified', supportedCycles: ['normal', 'delicate'], placements: ['direct_to_drum'], cycleMinutes: { normal: minutes, delicate: minutes }, provenance: evidence })
  const dryer = (name: string, minutes?: number, paid: { pricePerStart: number; blockMinutes: number } | null = null) => client.mutation(api.inventory.createMachine, { householdId, name, applianceType: 'tumble_dryer', location, capacityUnits: 20, capacityConfidence: 'verified', ...(paid ?? {}),
    heatSettings: [{ heat: 'high', label: 'Hot' }, { heat: 'low', label: 'Delicate' }], ...(minutes === undefined ? {} : { cycleMinutes: { timed: minutes } }), provenance: evidence })
  const garment = async (name: string, options: { color?: string; colorGroup?: 'white' | 'light' | 'black' | 'saturated'; cycle?: string; heat?: 'high' | 'low'; kind?: 't_shirt' | 'towel'; bulkUnits?: number } = {}) => {
    const { color = 'White', colorGroup = 'white', cycle = 'normal', heat = 'high' } = options
    const textileId = await client.mutation(api.inventory.createTextile, { householdId, name, color, colorGroup, firstWash: colorGroup === 'black' || colorGroup === 'saturated', ...(options.bulkUnits === undefined ? {} : { bulkUnits: options.bulkUnits }) })
    if (options.kind !== undefined) await client.mutation(api.inventory.updateTextile, { textileId, kind: options.kind })
    await client.mutation(api.inventory.setCare, { textileId, material: 'cotton', washMethod: 'machine', cycle, maxTemperatureC: 40, restrictions: [], dryMethod: 'tumble_dry', dryHeat: heat, provenance: evidence })
    return textileId
  }
  return { client, householdId, washer, dryer, garment }
}

/** One planned load washed through the API: recipe confirmed, every wash step recorded; `finished` also confirms the washer's end. */
async function washLoad(client: Client, planId: Id<'plans'>, loadId: string, machineId: Id<'machines'>, key: string, minutes: number, finished = true) {
  await client.mutation(api.plans.confirmRecipe, { planId, loadId, machineId })
  const { sessionId } = await client.mutation(api.execution.start, { planId, loadId, machineId, idempotencyKey: key })
  for (let step = 0; step < 30; step++) {
    const detail = await client.query(api.execution.sessionDetail, { sessionId })
    const action = detail.actions.find((entry) => entry.status === 'pending' && !entry.phase.startsWith('dryer') && entry.phase !== 'hold_out')
    if (action === undefined) break
    if (action.kind === 'task' && action.task === 'drum_fullness') await client.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'medium' })
    // Not finished: started 2 minutes ago for 1 minute, so its time ran out and its own dryer step is next.
    else if (action.kind === 'task') await client.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status: 'confirmed', ...(action.task !== 'start' ? {} : finished ? { minutes } : { minutes: 1, at: Date.now() - 2 * 60_000 }) })
    else await client.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status: 'skipped' })
  }
  if (finished) await client.mutation(api.execution.washFinished, { sessionId })
  return sessionId
}

/** Plan these garments as their own plan and wash its first load through the API. */
async function washAlone(client: Client, householdId: Id<'households'>, textileIds: Id<'textiles'>[], machineId: Id<'machines'>, key: string, minutes: number) {
  const { planId } = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: textileIds, clientInputHash: key })
  const loadId = (await client.query(api.plans.get, { planId }))!.result.loads[0]!.id
  return washLoad(client, planId, loadId, machineId, key, minutes)
}

/** The staged intake from Closet with the fabric from the label: no stains, into the hamper. */
async function addToHamper(page: Page, tile: string, name: string, fabric: string) {
  await page.goto('/closet')
  await page.getByRole('button', { name: 'Add clothes', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: tile, exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: details', exact: true }).click()
  await sheet.getByLabel('Name', { exact: true }).fill(name)
  await sheet.getByRole('button', { name: 'Next: fabric', exact: true }).click()
  await sheet.getByRole('group', { name: 'What’s it made of?', exact: true }).getByRole('checkbox', { name: fabric, exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: color', exact: true }).click()
  await sheet.getByRole('radio', { name: 'White', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: where from', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: dye', exact: true }).click()
  await sheet.getByRole('radio', { name: 'Washed without dye running', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: care label', exact: true }).click()
  await careLabel(sheet, 'Cold', 'Low heat')
  await sheet.getByRole('radio', { name: 'No stains', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: review', exact: true }).click()
  await sheet.getByRole('radio', { name: 'Needs washing', exact: true }).click()
  await sheet.getByRole('button', { name: 'Save item', exact: true }).click()
  await expect(sheet.getByRole('status').first()).toContainText('added')
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

/** A started session through preparation and the wash, up to the drying queue. */
async function washToDryingQueue(page: Page) {
  const step = page.locator('section.machine-step').first()
  const washing = page.getByRole('heading', { level: 1, name: 'Washing', exact: true })
  const move = page.getByRole('button', { name: 'Move to drying queue', exact: true })
  for (let i = 0; i < 30; i += 1) {
    await expect(step.or(washing).or(move).first()).toBeVisible()
    if (await move.isVisible()) break
    if (await washing.isVisible()) { await page.getByRole('button', { name: /has finished$/ }).click(); continue }
    const title = ((await step.locator('.machine-step-title').textContent()) ?? '').trim()
    const before = await step.textContent()
    const next = page.getByRole('button', { name: 'Done · next step', exact: true })
    if (await next.isVisible()) await next.click()
    else if (title.startsWith('How full')) await step.getByRole('button', { name: 'Half', exact: true }).click()
    else if (title === 'Press Start') {
      await page.getByLabel(/^Minutes shown on /).fill('40')
      await page.getByRole('button', { name: /^I[’']ve started / }).click()
    } else if (await step.getByRole('button', { name: 'Done', exact: true }).isVisible()) await step.getByRole('button', { name: 'Done', exact: true }).click()
    else throw new Error(`Unexpected machine step: ${title}`)
    await expect.poll(async () => await washing.isVisible() || await move.isVisible() || await step.textContent().catch(() => before) !== before).toBe(true)
  }
  await move.click()
  await expect(page).toHaveURL(/\/drying(?:\?|$)/)
}

/** A capture that depends on a state the app may not show; recorded as skipped instead of faked. */
async function maybe(name: string, fn: () => Promise<void>) {
  try { await fn() } catch (error) {
    // eslint-disable-next-line no-control-regex -- strip terminal colors from matcher messages
    skipped.push(`${name}: ${String(error instanceof Error ? error.message : error).replace(/\x1b\[[0-9;]*m/g, '').split('\n')[0]}`)
    console.log(`SKIPPED ${skipped.at(-1)}`)
  }
}

const tees = 'White tee'

test('consolidated journey report', async ({ page }) => {
  test.setTimeout(20 * 60_000)
  mkdirSync(join(out, 'captures'), { recursive: true })
  // Captures from an earlier run are replaced, so the folder matches the manifest.
  for (const file of readdirSync(join(out, 'captures'))) if (file.endsWith('.jpg')) unlinkSync(join(out, 'captures', file))
  const nav = page.getByRole('navigation', { name: 'Primary navigation' })
  // Leaving a page with an open editor asks before unloading; the report moves on.
  page.on('dialog', (dialog) => { void dialog.accept() })

  // ── Start ──
  await page.goto('/create-account')
  await expect(page.getByLabel('Email', { exact: true })).toBeEnabled()
  await page.getByLabel('Name', { exact: true }).fill('Jordan Journey')
  await page.getByLabel('Email', { exact: true }).fill(email('journey'))
  await page.getByLabel('Password', { exact: true }).fill(password)
  await snap(page, 'create-account', 'Start', 'Create account', 'A new person signs up with a name, email and password. This is the only form before the household.')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your household' })).toBeVisible()
  await snap(page, 'your-household', 'Start', 'Your household', 'Right after sign-up, the person creates a household or joins one with an invite.')
  await page.getByRole('button', { name: /Create a household/ }).click()
  await snap(page, 'name-household', 'Start', 'Name the household', 'The household name is suggested from the first name, so most people only confirm it.')
  // E13: a typed name survives Back through the join path.
  await page.getByLabel('Household name', { exact: true }).fill('Lake house')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('button', { name: /Join a household/ }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('button', { name: /Create a household/ }).click()
  await expect(page.getByLabel('Household name', { exact: true })).toHaveValue('Lake house')
  await snap(page, 'name-kept', 'Start', 'Typed name kept', 'A typed name, “Lake house”, is still there after going Back, opening Join a household and coming back to Create.', ['E13'])
  await page.getByRole('button', { name: 'Create household', exact: true }).click()
  await maybe('setup checklist', async () => {
    await expect(page.getByRole('button', { name: /Where you wash/ })).toBeVisible()
    await snap(page, 'setup-checklist', 'Start', 'Setup checklist', 'Location, machines and products come first, with the household-created confirmation on this screen. Continue offers one clothes intake or invites; one Skip for now leaves onboarding.')
  })
  await page.getByRole('button', { name: /Where you wash/ }).click()
  await page.getByRole('radio', { name: 'Shared laundry room', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await snap(page, 'setup-next', 'Start', 'What’s next?', 'After household setup, add clothes, invite people or skip for now.')
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
  await expect(nav).toBeVisible()
  await snap(page, 'home-first', 'Start', 'Home, first visit', 'Home after setup leads with one first task, Add your first garment; household setup waits as a single To do row.')

  // ── Add clothes ──
  await nav.getByRole('link', { name: 'Closet', exact: true }).click()
  await page.getByRole('button', { name: 'Add clothes', exact: true }).click()
  const add = page.getByRole('dialog')
  await expect(add.getByRole('heading', { name: 'What is it?' })).toBeVisible()
  await snap(page, 'intake-type-grid', 'Add clothes', 'What is it? type grid', 'The one staged intake, opened here from Closet, starts with a search box and recognizable type tiles. Each tile is a line drawing from the one garment icon set (T-shirt, Shirt, Sweater, Pants and so on), not text chips or shaded art.', ['E01'])
  await maybe('clothing search', async () => {
    await add.getByRole('searchbox', { name: 'Search items' }).fill('hoodie')
    await expect(add.getByRole('button', { name: /^Hoodie/ }).first()).toBeVisible()
    await snap(page, 'intake-search', 'Add clothes', 'Search items', 'Typing replaces the tiles with matching articles, each with its line icon and the care type it belongs to (Hoodie, under Sweater).', ['E01'])
    await add.getByRole('searchbox', { name: 'Search items' }).fill('')
  })
  await add.getByRole('button', { name: 'T-shirt', exact: true }).click()
  await add.getByRole('button', { name: 'Next: details', exact: true }).click()
  await add.getByLabel('Name', { exact: true }).fill(tees)
  await add.getByLabel('Quantity', { exact: true }).fill('2')
  await snap(page, 'intake-details', 'Add clothes', 'Garment details', 'Name, typed quantity, optional brand and size, then a shared tag filter or new-tag field. Extra identifiers stay under More details.', ['E01'])
  await add.getByRole('button', { name: 'Next: fabric', exact: true }).click()
  const fabric = add.getByRole('group', { name: 'What’s it made of?', exact: true })
  await fabric.getByRole('checkbox', { name: 'Cotton', exact: true }).click()
  await snap6(page, 'intake-fabric', 'Add clothes', 'What’s it made of?', 'The fabric has its own screen: what the garment is made of, from the label (here Cotton). It is optional, but the plan uses it: wool and silk change which detergents are safe, and the fabric decides whether a stain gets another home try.')
  for (let back = 0; back < 3; back += 1) await add.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(add.getByRole('button', { name: 'T-shirt', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await snap(page, 'intake-back-keeps', 'Add clothes', 'Back keeps answers', 'Going Back from the fabric step, three steps, shows the picked type, T-shirt, still selected (a checked tile in the line-icon grid).', ['E01'])
  await add.getByRole('button', { name: 'Next: whose', exact: true }).click()
  await add.getByRole('button', { name: 'Next: details', exact: true }).click()
  await expect(add.getByLabel('Quantity', { exact: true })).toHaveValue('2')
  await add.getByRole('button', { name: 'Next: fabric', exact: true }).click()
  await add.getByRole('button', { name: 'Next: color', exact: true }).click()
  await add.getByRole('radio', { name: 'White', exact: true }).click()
  await snap(page, 'intake-color', 'Add clothes', 'Color', 'Color uses US words (Gray, not Grey) and is the only question on the screen. “Where is it from?” and “Could the dye run?” (here New, not washed yet) are the next two screens.', ['E02', 'E10'])
  await add.getByRole('button', { name: 'Next: where from', exact: true }).click()
  await add.getByRole('button', { name: 'Next: dye', exact: true }).click()
  await add.getByRole('radio', { name: 'New, not washed yet', exact: true }).click()
  await add.getByRole('button', { name: 'Next: care label', exact: true }).click()
  await add.getByRole('group', { name: 'Washtub on the tag' }).getByRole('button', { name: 'Cold', exact: true }).click()
  await snap(page, 'intake-care-label', 'Add clothes', 'Care label', 'The care label is asked as the symbols on the tag, one category at a time.', ['E01'])
  await add.getByRole('button', { name: 'Next', exact: true }).click()
  await add.getByRole('radio', { name: /Tag doesn.t say/ }).click()
  await add.getByRole('button', { name: 'Next', exact: true }).click()
  await add.getByRole('radio', { name: 'Low heat', exact: true }).click()
  await add.getByRole('button', { name: 'Next', exact: true }).click()
  await add.getByRole('radio', { name: 'No stains', exact: true }).click()
  await snap(page, 'intake-stains-save', 'Add clothes', 'Any stains?', 'Stains are their own question. The next screen asks where the pieces go (Hamper) and how dirty they are, and the care label can be reviewed before saving.', ['E02'])
  await add.getByRole('button', { name: 'Next: review', exact: true }).click()
  await add.getByRole('radio', { name: 'Needs washing', exact: true }).click()
  await add.getByRole('button', { name: 'Save item', exact: true }).click()
  await expect(add.getByRole('status')).toContainText('added')
  await expect(add.getByRole('heading', { name: /^(Saved|First items? added)$/ })).toBeVisible()
  await snap(page, 'intake-saved', 'Add clothes', 'Saved', 'After the first save the sheet stays open with the result visible (“2 White tee added to the hamper”) and offers Same again, another color or Add another beside Done; the counted White tee ×2 row is already behind it.', ['E03'])
  await add.getByRole('button', { name: /^Another color/ }).click()
  await add.getByRole('radio', { name: 'Gray', exact: true }).click()
  await snap(page, 'intake-same-again', 'Add clothes', 'Same again, another color', '“Same again, another color” reopens at Color with a note that the care answers are the same as last time; Gray is spelled the US way.', ['E01', 'E10'])
  await add.getByRole('button', { name: 'Close', exact: true }).click()
  await maybe('dirty close', async () => {
    await expect(add.getByRole('button', { name: 'Keep editing', exact: true })).toBeVisible()
    await snap(page, 'intake-discard', 'Add clothes', 'Discard your changes?', 'Closing with unsaved answers asks first instead of silently dropping them.', ['E01'])
    await add.getByRole('button', { name: 'Discard', exact: true }).click()
  })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await snap(page, 'closet-after-intake', 'Add clothes', 'Closet with the new pieces', 'The two matching tees show as one counted row, White tee ×2, with the line T-shirt icon and an In the hamper chip.', ['E04'])

  // An old, set-in stain is a known mark: it is saved with the garment and holds nothing up.
  await page.getByRole('button', { name: 'Add clothes', exact: true }).click()
  await add.getByRole('button', { name: 'T-shirt', exact: true }).click()
  await add.getByRole('button', { name: 'Next: details', exact: true }).click()
  await add.getByLabel('Name', { exact: true }).fill('Work tee')
  await add.getByRole('button', { name: 'Next: fabric', exact: true }).click()
  await add.getByRole('button', { name: 'Next: color', exact: true }).click()
  await add.getByRole('radio', { name: 'White', exact: true }).click()
  await add.getByRole('button', { name: 'Next: where from', exact: true }).click()
  await add.getByRole('button', { name: 'Next: dye', exact: true }).click()
  await add.getByRole('radio', { name: 'Washed without dye running', exact: true }).click()
  await add.getByRole('button', { name: 'Next: care label', exact: true }).click()
  await careLabel(add, 'Cold', 'Low heat')
  await add.getByRole('radio', { name: 'Food or drink', exact: true }).click()
  await add.getByRole('radio', { name: 'Old, set in', exact: true }).click()
  const setIn = add.getByText('May not come out. Saved as a known mark; washing can continue.', { exact: true })
  await setIn.scrollIntoViewIfNeeded()
  await snap6(page, 'intake-set-in-stain', 'Add clothes', 'Old, set-in stain', 'After a stain is picked, intake asks “Is it new, or old and set in?”. An old one is saved as a known mark: the piece can still go to Ready to wear, nothing is held up, and the app does not promise it will come out.')
  await add.getByRole('button', { name: 'Next: review', exact: true }).click()
  await add.getByRole('radio', { name: 'Ready to wear', exact: true }).click()
  await add.getByRole('button', { name: 'Save item', exact: true }).click()
  await expect(add.getByRole('status').first()).toContainText('added')
  await add.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await closetRows(page, 'Work tee').first().click()
  const markRecord = page.getByRole('dialog')
  await expect(markRecord.getByText('Old food stain')).toBeVisible()
  await markRecord.getByRole('button', { name: 'Try treating it at the next wash', exact: true }).scrollIntoViewIfNeeded()
  await snap6(page, 'known-mark', 'Add clothes', 'Known mark on the garment', 'The garment’s Care tab names the mark (“Old food stain”) and offers “Try treating it at the next wash” or “Remove mark”, side by side. The care routine, advice and label instructions above are one grouped list of rows. Nothing goes to the hamper until the person asks.')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // ── Products and the plan's missing washer ──
  await openHousehold(page, 'Products')
  await page.getByRole('button', { name: 'Add a product' }).click()
  const bottle = page.getByRole('dialog', { name: 'Add a product' })
  await expect(bottle.getByRole('group', { name: 'Product type', exact: true }).getByRole('button')).toHaveCount(7)
  await snap(page, 'product-form-grid', 'Products and appliances', 'Add a product: form grid', 'The product form is seven picture tiles (liquid, pods, powder, scent beads, dryer sheets, dryer balls, dispenser) instead of text-only buttons.', ['E17'])
  await bottle.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(bottle).toHaveCount(0)
  await addBottle(page, 'Tide HE liquid', ['1', '3', '5'])
  await addMachines(page, { kind: 'Dryer', name: 'Laundry room dryer', count: 1, price: '1.50', minutes: '45', heat: { 'Low heat': 'Delicates' } })

  await nav.getByRole('link', { name: /^Laundry/ }).click()
  await expect(page.getByText(/^2 of 2 selected(?: ·|$)/)).toBeVisible()
  await snap(page, 'laundry-hamper', 'Plan and wash', 'Laundry hamper', 'Laundry shows the hamper with the matching tees as one row (White tee, 2 of 2 selected, with a quantity stepper) and a single sort action.', ['E04'])
  await page.getByRole('button', { name: 'Sort 2 pieces into loads', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your wash plan' })).toBeVisible()
  const addWasher = page.getByRole('button', { name: /^Add your washer/ }).first()
  await expect(addWasher).toBeVisible()
  await snap(page, 'plan-needs-washer', 'Plan and wash', 'Plan needs a washer', 'The plan names what is missing: there is no washer yet.', ['E14'])
  await addWasher.click()
  const washer = page.getByRole('dialog').last()
  await expect(washer).toBeVisible()
  await snap(page, 'plan-washer-editor', 'Plan and wash', 'Add your washer from the plan', 'The plan opens the shared appliance editor at its required questions only; other details can wait.', ['E14'])
  const where = washer.getByRole('button', { name: 'Shared room', exact: true })
  if (await where.count() > 0) await where.click()
  await washer.getByRole('group').filter({ hasText: 'Door' }).getByRole('button', { name: 'Front', exact: true }).click()
  // The label sits under the optional details; it names the washer picked at the laundry room.
  await washer.getByRole('button', { name: 'Washer details (optional)', exact: true }).click()
  await washer.getByLabel('Number or label as printed', { exact: true }).fill('Laundry room washer')
  await washer.getByRole('button', { name: /^Save washer/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: 'Whites load' })).toBeVisible()
  // The cap line asked while making loads must say whether it holds for every load.
  const pack = page.getByRole('button', { name: 'Check the pack', exact: true }).first()
  if (await pack.count() === 0) skipped.push('cap-line-every-load: the plan did not ask for the cap line')
  else {
    await pack.click()
    const card = page.getByRole('main')
    await card.getByRole('radio', { name: '3', exact: true }).click()
    const everyLoad = card.getByText('Same amount for every load?', { exact: true }).first()
    await expect(everyLoad).toBeVisible()
    await everyLoad.scrollIntoViewIfNeeded()
    await snap6(page, 'cap-line-every-load', 'Plan and wash', 'Cap line: every load, or it depends', 'Picking line 3 is not enough on its own: the label offers both answers, so the card asks, as its own step, whether that line is the same amount for every load or depends on load size, and “Pick an answer” stays disabled until one is chosen.')
    await card.getByRole('button', { name: 'Yes', exact: true }).click()
    await page.getByRole('button', { name: 'Update plan', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Whites load' })).toBeVisible()
  }
  await answerCards(page)
  await page.getByRole('button', { name: 'I’m at the laundry room', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Confirm recipe for / })).toBeEnabled()
  await snap(page, 'plan-ready', 'Plan and wash', 'Recipe for the washer', 'With one washer in the room, the plan uses it without asking and opens its recipe, to confirm before anything starts. The load line counts the matching tees as “White tee ×2”.', ['E14', 'E04'])
  if (await page.getByText('Your private product guidance', { exact: true }).count() === 0) skipped.push('plan-influence (carried over from October 5): a new user\'s plan with one detergent has no optional product suggestions, so the private guidance and its personal influence controls do not show')
  else await maybe('personal influence on the plan', async () => {
    await page.getByText('Your private product guidance', { exact: true }).click()
    await page.getByText('Personal influence controls', { exact: true }).click()
    const control = page.getByRole('region', { name: /^Personal influence: White tee/ })
    await expect(control).toHaveCount(1)
    await control.scrollIntoViewIfNeeded()
    await snap(page, 'plan-influence', 'History and records', 'Personal influence per group', 'Personal influence has one control for the matching group of tees, not one per piece.', ['E04'])
  })
  await page.getByRole('button', { name: /^Confirm recipe for / }).click()
  await page.getByRole('button', { name: 'See what goes in', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'What goes in' })).toBeVisible()
  await snap6(page, 'what-goes-in', 'Plan and wash', 'What goes in', 'The run sheet for this load is “What goes in”: the products and amounts, reviewed before preparation starts. The internal word “Chemistry” no longer appears anywhere a person reads.')
  await page.getByRole('button', { name: 'Start preparation', exact: true }).click()
  const step = page.locator('section.machine-step').first()
  await expect(step).toBeVisible()
  const sessionUrl = page.url()

  // Preparation through the wash, capturing the step hierarchy and the timer.
  const washing = page.getByRole('heading', { level: 1, name: 'Washing', exact: true })
  const move = page.getByRole('button', { name: 'Move to drying queue', exact: true })
  let shotPrep = false, shotOptions = false
  for (let i = 0; i < 24; i += 1) {
    await expect(step.or(washing).or(move).first()).toBeVisible()
    if (await move.isVisible()) break
    if (await washing.isVisible()) {
      await snap(page, 'washing-timer', 'Plan and wash', 'Washing', 'The running washer shows its countdown ring and the load card, so it is clear which pieces are inside.')
      await page.getByRole('button', { name: /has finished$/ }).click()
      await expect(move).toBeVisible()
      break
    }
    const title = ((await step.locator('.machine-step-title').textContent()) ?? '').trim()
    const why = step.getByRole('button', { name: /^Why (here|now)\?/ })
    if (!shotPrep && await why.count() > 0) {
      const cap = await step.getByText(/^Fill the cap to /).count() > 0
      await (cap ? snap6 : snap)(page, 'prep-step', 'Plan and wash', `Preparation: ${title}`, cap
        ? 'The dose step draws the cap from the marks recorded for this product (1, 3 and 5), filled to the planned line 3, beside “How much”. No cap is drawn when its marks are not recorded. One instruction, “Why here?” beside it, one Done action in the footer.'
        : 'A preparation step: one instruction with “Why here?” or “Why now?” beside it and one Done action in the footer.', ['E16'])
      shotPrep = true
    }
    const options = step.getByRole('button', { name: 'Something different?', exact: true })
    if (!shotOptions && await options.count() > 0) {
      await options.click()
      const sheet = page.getByRole('dialog', { name: 'Something different?' })
      await expect(sheet).toBeVisible()
      await snap(page, 'prep-step-options', 'Plan and wash', `Something different?: ${title}`, 'Departures and recovery (a different amount, ran out, Skip, a problem with the washer) are one quiet “Something different?” row that opens a sheet with one list of symbol rows.', ['E16'])
      shotOptions = true
      await sheet.getByRole('button', { name: 'Close', exact: true }).first().click()
      await expect(sheet).toHaveCount(0)
    }
    const before = await step.textContent()
    const next = page.getByRole('button', { name: 'Done · next step', exact: true })
    if (await next.isVisible()) await next.click()
    else if (title.startsWith('How full')) await step.getByRole('button', { name: 'Half', exact: true }).click()
    else if (title === 'Press Start') {
      await page.getByLabel(/^Minutes shown on /).fill('40')
      await page.getByRole('button', { name: /^I[’']ve started / }).click()
    } else throw new Error(`Unexpected machine step: ${title}`)
    await expect.poll(async () => await washing.isVisible() || await move.isVisible() || await step.textContent().catch(() => before) !== before).toBe(true)
  }
  if (!shotPrep) skipped.push('prep-step: no step showed Why here?/Why now?')
  if (!shotOptions) skipped.push('prep-step-options: no step showed Something different?')
  await expect(page.getByRole('heading', { level: 1, name: 'Washed', exact: true })).toBeVisible()
  await snap(page, 'washer-finished', 'Plan and wash', 'Washed', 'The finished washer is a record: “Washed” and the time it finished, with no countdown or progress bar.', ['E11'])
  await move.click()

  // ── Dry and put away ──
  await expect(page).toHaveURL(/\/drying(?:\?|$)/)
  await expect(page.getByRole('button', { name: new RegExp(`^${tees}, 2 pieces · `) })).toBeVisible()
  await snap(page, 'drying-plan', 'Dry and put away', 'Drying plan', 'The drying plan shows the matching tees as one row with a quantity.', ['E04'])
  await page.getByRole('button', { name: 'Load into a dryer', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Which dryer?', exact: true })).toBeVisible()
  await page.getByLabel(/^Minutes on /).fill('45')
  await snap(page, 'which-dryer', 'Dry and put away', 'Which dryer?', 'The chosen dryer, what goes into it and its steps, then the minutes set on it. The tee’s low-heat tag gives “Choose Delicates”, with “Pay $1.50 if asked”, and a line under the steps says why: Low may run hotter than this tag allows.')
  const acknowledge = async () => { const box = page.getByRole('checkbox', { name: 'I’ve followed these label instructions', exact: true }); if (await box.count() > 0) await box.check() }
  await acknowledge()
  await page.getByRole('button', { name: /^I[’']ve started / }).click()
  await expect(page.getByRole('heading', { name: 'Drying now', exact: true })).toBeVisible()
  const run = page.getByRole('button', { name: /^Laundry room dryer / })
  await run.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Is it dry?', exact: true })).toBeVisible()
  await page.getByRole('button', { name: `Fewer dry ${tees}`, exact: true }).click()
  await expect(page.getByText(/^Dry 1 of 2/)).toBeVisible()
  await snap(page, 'is-it-dry', 'Dry and put away', 'Is it dry?', 'The ×2 group is checked with a “Dry n of m” stepper: one tee is dry, the other still damp.', ['E04', 'E05'])
  await page.getByRole('button', { name: 'Drying', exact: true }).click()
  await expect(run).toContainText('Unsaved check')
  await snap(page, 'unsaved-check', 'Dry and put away', 'Unsaved check kept', 'Going Back keeps the unsaved answer; the dryer row says “Unsaved check” instead of losing it.', ['E05'])
  await run.click()
  await expect(page.getByText(/^Dry 1 of 2/)).toBeVisible()
  // Before the dryer's end the damp tee keeps the run's time: no extra minutes (design 9.3).
  await expect(page.getByLabel('Extra minutes on Laundry room dryer', { exact: true })).toHaveCount(0)
  await acknowledge()
  await page.getByRole('button', { name: 'Put away 1 · keep 1 drying', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Put away 1 piece', exact: true })).toBeVisible()
  await snap(page, 'put-away-partial', 'Dry and put away', 'Put away the dry one', 'Put-away counts what goes back: the dry tee goes away now and the other is listed as not dry yet, still drying.', ['E04'])
  await page.getByRole('button', { name: 'Put away 1 piece', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Drying', exact: true })).toBeVisible()
  await run.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Is it dry?', exact: true })).toBeVisible()
  await acknowledge()
  await page.getByRole('button', { name: 'Put away 1 dry piece', exact: true }).click()
  await page.getByRole('button', { name: 'Put away 1 piece', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Drying', exact: true })).toBeVisible()
  await page.goto(sessionUrl)
  await expect(page.getByRole('heading', { level: 1, name: /, done\.$|^Load complete$/ })).toBeVisible()
  await snap(page, 'load-complete', 'Dry and put away', 'Load complete', 'The load is complete once every piece is put away: a done moment, a receipt of how it was cared for, and one row per piece (matching tees count as ×2) that opens its History.', ['E04', 'E07'])

  // ── History and records ──
  await page.goto('/')
  await expect(nav).toBeVisible()
  await snap(page, 'home-after-load', 'History and records', 'Home after the first load', 'Home after the first load: nothing is waiting to wash, with Closet, Add clothes and Plan a wash below, then the care overview counting the pieces as Ready.')
  await nav.getByRole('link', { name: 'Me', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Laundry history', exact: true })).toBeVisible()
  await snap(page, 'me-history', 'History and records', 'Me: laundry history', 'Me lists finished loads.', ['E07'])
  await page.getByRole('button', { name: new RegExp(tees) }).first().click()
  await expect(page.getByRole('heading', { name: /, done\.$|^Load complete$/ })).toBeVisible()
  await snap(page, 'load-from-me', 'History and records', 'Completed load from Me', 'Opened from Me, the completed load shows the shared care history and returns with “Back to Me”.', ['E07'])
  await page.getByRole('button', { name: 'Back to Me' }).or(page.getByRole('link', { name: 'Back to Me' })).first().click()
  await expect(page.getByRole('heading', { name: 'Laundry history', exact: true })).toBeVisible()
  await nav.getByRole('link', { name: 'Closet', exact: true }).click()
  await closetRows(page, tees).first().click()
  await maybe('care tab fabric row', async () => {
    await page.getByRole('tab', { name: 'Care', exact: true }).click()
    const fabricRow = page.getByRole('dialog').getByText('Cotton', { exact: true })
    await expect(fabricRow).toBeVisible()
    // Centred, so the last row clears the sticky footer.
    await fabricRow.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    await snap6(page, 'garment-care-fabric', 'History and records', 'Care tab: Fabric', 'The garment’s Care tab has a Fabric row with what intake recorded (Cotton), in one grouped facts card with Sorts into and Recent care. Tapping it changes the fabric for every matching piece. The routine, advice and label instructions above it are one grouped list.')
  })
  await maybe('garment history tab', async () => {
    await page.getByRole('tab', { name: 'History', exact: true }).click()
    await snap(page, 'garment-history', 'History and records', 'Garment history', 'The garment record’s History tab uses the same care-history presenter as the load: where it was washed and tumble dried, and the product used. “How did a wash turn out?” opens below it.', ['E07', 'E04'])
  })
  await page.keyboard.press('Escape')

  // ── Products and appliances ──
  await openHousehold(page, 'Products')
  await page.getByRole('main').getByRole('button', { name: /Tide HE liquid/ }).click()
  const record = page.getByRole('dialog', { name: 'Tide HE liquid' })
  await record.getByRole('tab', { name: 'Directions', exact: true }).click()
  await snap(page, 'product-directions', 'Products and appliances', 'Product directions', 'Saved directions show as read-only rows with dose, placement, timing and source instead of a bare count.', ['E09'])
  // The "Label directions" row appears while the label's lines are unconfirmed; planning may already have saved them.
  const directionsRow = record.getByRole('button', { name: /^Label directions/ })
  if (await directionsRow.count() === 0) skipped.push('product-directions-edit (carried over from October 5): no "Label directions" row once planning saved the directions (Edit details only)')
  else {
    await directionsRow.click()
    await expect(record.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
    await snap(page, 'product-directions-edit', 'Products and appliances', 'Directions row opens its editor', 'Tapping the Directions row opens the editor at that section, with the cap marks beside it.', ['E08'])
    await record.getByRole('button', { name: 'Cancel', exact: true }).click()
  }
  await page.keyboard.press('Escape')
  await openHousehold(page, 'Machines')
  await page.getByRole('button', { name: /^Laundry room washer/ }).click()
  const machine = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Laundry room washer', exact: true }) })
  await snap(page, 'washer-record', 'Products and appliances', 'Washer record', 'The washer saved from the plan, with the details that can wait shown as rows.')
  await machine.getByRole('button', { name: /^Capacity/ }).click()
  await expect(machine.getByLabel('Drum size in cu. ft.', { exact: true })).toBeFocused()
  await snap(page, 'washer-capacity-edit', 'Products and appliances', 'Capacity row opens its editor', 'Tapping Capacity opens the appliance editor with the drum size field focused.', ['E08'])

  // Water hardness: recorded now, used by no dose yet.
  await page.goto('/')
  await maybe('water', async () => {
    await openHousehold(page, 'Appliances')
    const water = page.getByRole('button', { name: /^Water: Not set/ })
    await water.scrollIntoViewIfNeeded()
    await snap6(page, 'water-row', 'Products and appliances', 'Appliances: Water', 'Household > Appliances lists the appliances as one grouped list, then a Water row for how hard the tap water is (Not set for a new household), then Laundry day.')
    await water.click()
    const sheet = topDialog(page)
    await sheet.getByLabel('What’s your ZIP code?').fill('94526')
    await snap6(page, 'water-zip', 'Products and appliances', 'Water: ZIP code', 'The Water sheet starts from the ZIP code.')
    await sheet.getByRole('button', { name: 'Continue', exact: true }).click()
    await sheet.getByLabel('Which town is your home in?').selectOption({ label: 'Danville' })
    await snap6(page, 'water-town', 'Products and appliances', 'Water: which town', '94526 has one water company, so it asks only which town the home is in (Danville here).')
    await sheet.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(sheet.getByText('Soft', { exact: true })).toBeVisible()
    await snap6(page, 'water-result', 'Products and appliances', 'Water: Soft, from the water company', 'The answer is a plain band (Soft, Moderately hard, Hard or Not known) with where it came from (EBMUD, Danville). One quiet row, Have a test strip or water report?, opens a strip, report or softener reading that overrides it. Done saves. It changes no dose yet.')
    await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  })

  // ── A second wash: wool, and stains that may not come out ──
  await maybe('wool refused', async () => {
    await addToHamper(page, 'Sweater', 'Wool sweater', 'Wool')
    await nav.getByRole('link', { name: /^Laundry/ }).click()
    await page.getByRole('button', { name: 'Sort 1 piece into loads', exact: true }).click()
    await answerCards(page)
    const refused = page.getByText(/Waits for a wool-safe detergent/).first()
    await expect(refused).toBeVisible()
    await refused.scrollIntoViewIfNeeded()
    await snap6(page, 'wool-refused', 'Plan and wash', 'Wool refused with this detergent', 'A wool sweater and a detergent whose enzymes are not recorded: the plan will not wash them together and says why in plain words, with how to fix it (a wool-safe detergent, or checking the label).')
    await page.goto('/closet')
    await closetRows(page, 'Wool sweater').first().click()
    // The first tap asks how many; the footer's Remove from hamper confirms.
    await page.getByRole('dialog').getByRole('button', { name: 'Remove from hamper', exact: true }).click()
    await expect(page.getByRole('dialog').getByText('How many to remove?')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove from hamper', exact: true }).last().click()
    await expect(page.getByText('1 item is Ready again.')).toBeVisible()
  })
  await maybe('stain checks', async () => {
    await addToHamper(page, 'T-shirt', 'Stained tee', 'Cotton')
    await addToHamper(page, 'T-shirt', 'Gym tee', 'Cotton')
    // Synthetic label facts for a pretreatment spray, entered as the proven stain spec does; not a product recommendation.
    const { client, householdId } = await convexAs(page)
    const inventory = await client.query(api.inventory.list, { householdId })
    const stained = inventory.textiles.filter((entry) => entry.name === 'Stained tee' || entry.name === 'Gym tee')
    expect(stained).toHaveLength(2)
    const washerId = inventory.machines.find((entry) => entry.name === 'Laundry room washer')!.machineId
    const pretreat = (name: string, stainChemistry: 'protease' | 'oxygen_bleach') => client.mutation(api.inventory.createSupply, { householdId, name, kind: 'chemical',
      formulation: { form: 'liquid' }, safety: { bleachKind: stainChemistry === 'oxygen_bleach' ? 'oxygen' : 'none', incompatibleSupplyIds: [], incompatibleMaterials: [], pretreatment: {
        stainChemistry, stainKinds: ['protein'], dose: { amount: 10, unit: 'ml' }, timing: 'Synthetic label directions', safeMaterials: ['cotton'], maximumTemperatureC: 30, maximumPH: 8,
      } }, provenance: { source: `${name} synthetic label`, confidence: 'verified' } })
    const enzyme = await pretreat('Enzyme stain spray', 'protease')
    await client.mutation(api.closet.flagDirty, { textileIds: stained.map((entry) => entry.textileId), reasons: ['food'], soilLevel: 'normal', stainReport: { kind: 'protein', priorTreatmentAttempts: [] } })
    const planned = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: stained.map((entry) => entry.textileId),
      pretreatmentChoices: stained.map((entry) => ({ textileId: entry.textileId, supplyId: enzyme })), clientInputHash: 'journey-stain-wash' })
    const loads = (await client.query(api.plans.get, { planId: planned.planId }))!.result.loads
    expect(loads).toHaveLength(1)
    await client.mutation(api.plans.confirmRecipe, { planId: planned.planId, loadId: loads[0]!.id, machineId: washerId })
    const { sessionId } = await client.mutation(api.execution.start, { planId: planned.planId, loadId: loads[0]!.id, idempotencyKey: 'journey-stain-wash' })
    await page.goto(`/session/${sessionId}`)
    await page.getByRole('button', { name: 'Start preparation', exact: true }).click()
    await washToDryingQueue(page)

    // Drying: a stained piece air dries until "Stain gone?" is answered.
    await page.getByRole('button', { name: /^Stained tee, / }).first().click()
    const dryingSheet = page.getByRole('dialog')
    const dryingAsk = dryingSheet.getByRole('group', { name: 'Stain gone?' }).first()
    await expect(dryingAsk).toBeVisible()
    await dryingAsk.scrollIntoViewIfNeeded()
    await snap6(page, 'drying-stain-check', 'Dry and put away', 'Stain gone? while drying', 'A piece that went into the wash with a stain air dries (Hang to dry, chosen), because dryer heat would set what is left. Its drying sheet says so and asks “Stain gone?” as one row: Gone, Lighter or Still there.')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await dryAndPutAway(page, [])

    // The Care tab asks the same question once the piece is dry.
    await page.goto(`/closet?item=${stained.find((entry) => entry.name === 'Stained tee')!.textileId}`)
    await page.getByRole('tab', { name: 'Care', exact: true }).click()
    const record = page.getByRole('dialog')
    const careAsk = record.getByRole('group', { name: 'Stain gone?' }).first()
    await expect(careAsk).toBeVisible()
    await careAsk.scrollIntoViewIfNeeded()
    await snap6(page, 'care-stain-gone', 'Dry and put away', 'Stain gone? on the Care tab', 'The Care tab shows the stain check (the stain, what was tried and how many washes) and asks “Stain gone?” as one row: Gone, Lighter or Still there.')
    await careAsk.getByRole('button', { name: 'Still there', exact: true }).click()
    await expect(page.getByText(/Keep it out of the dryer/)).toBeVisible()
    await page.getByRole('button', { name: /^Stained tee,/ }).click()
    await page.getByRole('tab', { name: 'Care', exact: true }).click()
    const next = record.getByRole('group', { name: 'What next?' }).first()
    await expect(next.getByRole('button', { name: 'Try once more', exact: true })).toBeVisible()
    await next.scrollIntoViewIfNeeded()
    await snap6(page, 'stain-what-next', 'Dry and put away', 'What next? after “Still there”', '“Still there” (or “Lighter”) leads to What next? as one grouped list: Try once more, Take it to a cleaner, Keep as a known mark, and Retire it last and quieter. Cotton allows one more home try; the hint says a cleaner is safest for a valuable piece.')
    // Silk, wool, rayon and dry-clean-only lead with the cleaner. No wool piece can be washed with this detergent,
    // so the walk tells the app this tee is wool through its Fabric row, captures, and sets Cotton back.
    const setFabric = async (fabric: string) => {
      await record.getByRole('button', { name: /^Fabric/ }).click()
      const edit = topDialog(page)
      const choices = edit.getByRole('group', { name: 'What’s it made of?', exact: true })
      for (const choice of await choices.getByRole('checkbox', { checked: true }).all()) await choice.uncheck()
      await choices.getByRole('checkbox', { name: fabric, exact: true }).check()
      await edit.getByRole('button', { name: 'Save changes', exact: true }).click()
      await expect(record.getByRole('button', { name: new RegExp(`^Fabric.*${fabric}`) })).toBeVisible()
    }
    await maybe('stain-cleaner-first-fabric', async () => {
      await setFabric('Wool')
      const wool = record.getByRole('group', { name: 'What next?' }).first()
      await expect(wool.getByText('Silk, wool, rayon and dry-clean-only pieces are safest with a cleaner.', { exact: false })).toBeVisible()
      await wool.scrollIntoViewIfNeeded()
      await snap6(page, 'stain-cleaner-first-wool', 'Dry and put away', 'Wool leads with the cleaner', 'With the fabric set to Wool on the Fabric row, What next? drops Try once more and leads with “Take it to a cleaner”: the hint says silk, wool, rayon and dry-clean-only pieces are safest with a cleaner. (The walk sets this tee to Wool only for this capture and back to Cotton after; no wool piece can be washed with the walk’s detergent.)')
      await setFabric('Cotton')
    })
    await expect(next.getByRole('button', { name: 'Try once more', exact: true })).toBeVisible()
    await next.getByRole('button', { name: 'Try once more', exact: true }).click()
    await expect(page.getByText('In the hamper for one more try with something different.')).toBeVisible()

    // A stain that got worse leads with the cleaner and offers no home try.
    await maybe('stain got worse', async () => {
      await page.goto(`/closet?item=${stained.find((entry) => entry.name === 'Gym tee')!.textileId}`)
      await page.getByRole('tab', { name: 'History', exact: true }).click()
      await page.getByText('How did a wash turn out?', { exact: true }).click()
      await page.getByLabel('What are you checking?').selectOption('stain')
      await page.getByLabel('When did you check?').selectOption('after_drying')
      await page.getByRole('button', { name: 'Record result', exact: true }).click()
      const assess = topDialog(page)
      await assess.getByLabel('What changed?').selectOption('worse')
      await assess.getByRole('button', { name: 'Save assessment', exact: true }).click()
      await expect(assess.getByText('Assessment saved.')).toBeVisible()
      await assess.getByRole('button', { name: 'Close', exact: true }).click()
      await page.getByRole('tab', { name: 'Care', exact: true }).click()
      const worse = page.getByRole('dialog').getByRole('group', { name: 'What next?' }).first()
      await expect(worse.getByText(/It got worse after washing/)).toBeVisible()
      await expect(worse.getByRole('button', { name: 'Try once more', exact: true })).toHaveCount(0)
      await worse.scrollIntoViewIfNeeded()
      await snap6(page, 'stain-cleaner-first', 'Dry and put away', 'A stain that got worse goes to a cleaner', '“Worse”, recorded under “How did a wash turn out?”, leaves What next? without “Try once more” and leading with “Take it to a cleaner”: the hint says it got worse after washing, so a cleaner is the safest next step.')
      await page.keyboard.press('Escape')
    })

    // "Try once more": the next plan proposes a different label-safe treatment.
    await pretreat('Oxygen bleach soak', 'oxygen_bleach')
    await page.goto('/laundry')
    await page.getByRole('button', { name: 'Sort 1 piece into loads', exact: true }).click()
    await answerCards(page)
    const retry = page.getByRole('button', { name: 'Pretreat with Oxygen bleach soak' }).first()
    await expect(retry).toBeVisible()
    await retry.scrollIntoViewIfNeeded()
    await snap6(page, 'stain-second-try-plan', 'Plan and wash', 'One more try, with something different', 'Back in the hamper after “Try once more”, the plan does not ask what was used before: it proposes a different pretreatment whose label allows cotton (“Pretreat with Oxygen bleach soak”, not the enzyme spray already tried), beside Inspect stain and Leave out.')
  })

  // ── Pre-owned intake (last, so the new garment joins no earlier plan) ──
  await maybe('pre-owned intake', async () => {
    await page.goto('/closet')
    await page.getByRole('button', { name: 'Add clothes', exact: true }).click()
    await add.getByRole('button', { name: 'T-shirt', exact: true }).click()
    await add.getByRole('button', { name: 'Next: details', exact: true }).click()
    await add.getByLabel('Name', { exact: true }).fill('Thrifted tee')
    await add.getByRole('button', { name: 'Next: fabric', exact: true }).click()
    await add.getByRole('button', { name: 'Next: color', exact: true }).click()
    await add.getByRole('radio', { name: 'Navy', exact: true }).click()
    await add.getByRole('button', { name: 'Next: where from', exact: true }).click()
    await add.getByRole('checkbox', { name: 'Pre-owned (thrift, hand-me-down)' }).check()
    await add.getByRole('button', { name: 'Musty', exact: true }).click()
    await expect(add.getByText(/check the rinse water/)).toBeVisible()
    await snap7(page, 'intake-pre-owned', 'Add clothes', 'Pre-owned origin', '“Where is it from?” offers a Pre-owned checkbox (thrift, hand-me-down). Checking it skips the dye question, keeps dye unconfirmed until a wash, and asks “Smells of…” with an inline optional label (Musty here). Thin or damaged is a separate checkbox for hand wash or a cleaner; vintage age alone establishes no damage.')
    await add.getByRole('button', { name: 'Next: care label', exact: true }).click()
    await careLabel(add, 'Cold', 'High heat')
    await add.getByRole('radio', { name: 'No stains', exact: true }).click()
    await add.getByRole('button', { name: 'Next: review', exact: true }).click()
    await expect(add.getByRole('radio', { name: 'Ready to wear', exact: true })).toBeChecked()
    await add.getByRole('radio', { name: 'Needs washing', exact: true }).click()
    await snap7(page, 'intake-pre-owned-final', 'Add clothes', 'Review a pre-owned garment', '“Review item” confirms the name, destination, soil level, and recorded care label. Pest treatment stays in a closed optional section; high-heat treatment is offered only when the recorded tag allows it and is never on by default.')
    await add.getByRole('button', { name: 'Save item', exact: true }).click()
    await expect(add.getByRole('status').first()).toContainText('added')
    await add.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  // ── Account and errors ──
  await page.goto('/no-such-page')
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
  await snap(page, 'not-found', 'Account and errors', 'Page not found', 'An unknown address shows a designed recovery page with Go home, signed in.', ['E12'])
  await page.getByRole('link', { name: 'Go home', exact: true }).click()
  await nav.getByRole('link', { name: 'Me', exact: true }).click()
  await page.getByRole('button', { name: /^Account/ }).click()
  await expect(page).toHaveURL(/\/account$/)
  await snap(page, 'account', 'Account and errors', 'Account', 'Account settings as one grouped list: Email, Change password, Sign out and Delete account.', ['E06'])
  await page.getByRole('main').getByRole('button', { name: /^Sign out/ }).click()
  await page.getByRole('dialog', { name: 'Sign out?' }).getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/sign-in')
  expect(new URL(page.url()).searchParams.has('redirect')).toBe(false)
  await snap(page, 'signed-out', 'Account and errors', 'Signed out', 'Sign-out lands on a clean /sign-in with no nested redirect.', ['E15'])
  await page.goto('/forgot-password')
  await expect(page.getByRole('heading', { level: 1, name: 'Reset password' })).toBeVisible()
  await snap(page, 'reset-password', 'Account and errors', 'Reset password', 'The reset page is honest: email reset is not set up yet, and it names Me → Account → Change password instead of promising a code.', ['E06'])
  writeManifest()
  console.log(`CAPTURES ${captures.length}; SKIPPED ${JSON.stringify(skipped)}`)
})

// ── Laundry day (October 6): each household is new, signed up in the app; machines, garments, plans and
// the washes before each captured step are set up through the API. Every captured screen is walked in the app. ──

test('laundry day: plan the day at home', async ({ page }) => {
  test.setTimeout(5 * 60_000)
  const { client, householdId, washer, dryer, garment } = await dayHousehold(page, 'journey-day', 'home')
  await washer('Home washer', 30)
  await dryer('Home dryer', 45)
  // Whites, new darks and a delicate-cycle piece: 3 loads.
  const ids = [await garment('White tee'), await garment('Black jeans', { color: 'Black', colorGroup: 'black' }), await garment('White blouse', { cycle: 'delicate' })]
  const { planId } = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: ids, clientInputHash: 'journey-day' })
  expect((await client.query(api.plans.get, { planId }))!.result.loads).toHaveLength(3)

  await page.goto('/laundry')
  const card = page.getByRole('region', { name: 'Plan the day' })
  await expect(card.getByRole('heading', { name: '3 loads' })).toBeVisible()
  await card.scrollIntoViewIfNeeded()
  await snapDay(page, 'day-plan-card', 'Plan and wash', 'Plan the day', 'With 3 or more loads at home (one washer, one dryer), Laundry offers “Plan the day” as two grouped rows under “How should today go?”: All today, with the time the last load is done, and Spread out, with loads a day and when it ends. The planned loads below tell same-named loads apart by what is in them (“Whites · White blouse”, “Whites · White tee”).')
  await card.getByRole('button', { name: 'All today', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('radio', { name: 'Spread out', exact: true }).click()
  await expect(sheet.getByRole('radiogroup', { name: 'How many loads a day?' })).toBeVisible()
  await expect(sheet.getByText('Whose day is it?')).toHaveCount(0)
  await snapDay(page, 'day-spread-out', 'Plan and wash', 'Spread out', 'Spread out asks “How many loads a day?” (1, 2 or 3), then Plan today; urgent and needed-soon loads go first. “Whose day is it?” appears only when the household has more than one wearer, so this single-wearer household is not asked.')

  const until = await page.evaluate(() => { const at = new Date(Date.now() + 100 * 60_000); return at.getDate() === new Date().getDate() ? `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}` : null })
  await sheet.getByRole('radio', { name: 'All today', exact: true }).click()
  if (until === null) skipped.push('laundry day: All today, the day strip and its list: “Home until?” 100 minutes from now would cross midnight')
  else {
    await sheet.getByLabel('Home until?').fill(until)
    await sheet.getByLabel('Home until?').blur()
    await snapDay(page, 'day-home-until', 'Plan and wash', 'All today: Home until?', 'All today asks “Home until?” (here a time about 100 minutes from now), with the hint “Plan ends before you leave.”, and fits the day so the last dryer run ends before it.')
    await sheet.getByRole('button', { name: 'Plan today', exact: true }).click()
    const strip = page.getByRole('region', { name: 'Plan the day' })
    await expect(strip.getByRole('heading', { name: /^\d+ loads?$/ })).toBeVisible()
    await expect(strip).toContainText(/Done about \d{1,2}:\d{2} [AP]M/)
    await strip.scrollIntoViewIfNeeded()
    await snapDay(page, 'day-strip', 'Plan and wash', 'The day strip', 'After “Plan today”, a heading says how many loads today has (“2 loads”) with when the day is done. A bar shows washer and dryer time, then one row per load with a status chip: Next (start now), Hang to dry (wash now, hang because its dryer run would end too late) and Tomorrow (waits). A note says how many loads fit before “Home until”. Row names are as the app shows them (“Whites”, “Black jeans alone”, “Whites · White tee”).')
    await page.locator('summary').click()
    await expect(page.locator('.day-plan-order li').first()).toBeVisible()
    await page.locator('summary').scrollIntoViewIfNeeded()
    await snapDay(page, 'day-strip-list', 'Plan and wash', 'Where the day’s times come from', '“Where these times come from” opens each load’s wash and dryer minutes with where each figure came from (your washer’s time, your dryer’s time), or “hang to dry”, numbered as in the strip (Load 1 of 2, Load 2 of 2).')
  }

  await openHousehold(page, 'Appliances')
  const settings = page.getByRole('region', { name: 'Laundry day' })
  await expect(settings).toBeVisible()
  // Centred, so both rows clear the dock above the tabs.
  await settings.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await snapDay(page, 'day-settings', 'Products and appliances', 'Household > Appliances: Laundry day', 'Laundry day holds the room to hang clothes (loads you can hang at once) and the loads a day used by Spread out, one tap each.')
})

test('laundry day: the next wash joined to this trip', async ({ page }) => {
  test.setTimeout(5 * 60_000)
  const { client, householdId, washer, dryer, garment } = await dayHousehold(page, 'journey-joined', 'home')
  const washerId = await washer('Home washer', 30)
  await dryer('Home dryer', 45)
  // Whites and new darks: 2 loads that both tumble. Load 1's wash ends through the API; the dryer is free.
  const { planId } = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: [await garment('White tee'), await garment('Black jeans', { color: 'Black', colorGroup: 'black' })], clientInputHash: 'journey-joined' })
  const next = (await client.query(api.plans.upNext, { householdId }))!
  expect(next.planId).toBe(planId)
  await washLoad(client, planId, next.loads[0]!.loadId, washerId, 'journey-joined-1', 30)
  await page.goto('/')
  const joined = page.getByText(/^Move them to the dryer, then start load 2$/).first()
  await expect(joined).toBeVisible()
  await joined.scrollIntoViewIfNeeded()
  await snapDay(page, 'next-joined', 'Plan and wash', 'Next: move them, then start load 2', 'Load 1’s wash has ended (set up through the API) and the home dryer is free. Load 2 would wait 30 minutes or less for the dryer, so Home joins the steps: “Move them to the dryer, then start load 2”.')
})

test('laundry day: the next wash held back, then the dryer busy', async ({ page }) => {
  test.setTimeout(5 * 60_000)
  const { client, householdId, washer, dryer, garment } = await dayHousehold(page, 'journey-busy', 'home')
  const washerId = await washer('Home washer', 30)
  const dryerId = await dryer('Home dryer', 60)
  // Load 1 goes into the dryer for 120 minutes; load 2 is planned, not started.
  await client.mutation(api.dryingQueue.queueFromWasher, { sessionId: await washAlone(client, householdId, [await garment('Bath towel', { colorGroup: 'light' })], washerId, 'journey-busy-first', 30) })
  const queued = (await client.query(api.dryingQueue.queue, { householdId })).pieces.map((piece) => piece.pieceId)
  await client.mutation(api.dryingQueue.startDryer, { householdId, pieceIds: queued, dryerId, minutes: 120 })
  const { planId } = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: [await garment('Gray tee', { colorGroup: 'light' })], clientInputHash: 'journey-busy-second' })

  await page.goto('/laundry')
  const next = page.getByRole('region', { name: 'Next' })
  await expect(next.getByRole('heading', { name: /^Start load 1 at about \d{1,2}:\d{2} [AP]M$/ })).toBeVisible()
  await expect(next).toContainText(/We’ll remind you at about \d{1,2}:\d{2}/)
  await next.scrollIntoViewIfNeeded()
  await snapDay(page, 'next-held', 'Plan and wash', 'Next: a held start with a reminder', 'The dryer runs for another two hours (set up through the API), so the next wash is held back to end with it: “Start load 1 at about …”, done with the dryer, with a reminder at that time. “Dryer says” re-times it. The dryer’s usual minutes are the ones recorded on the dryer, so no separate “How long do your machines take?” card is asked. Held starts and reminders are for home only.')

  // Load 2's wash ends while the dryer still runs it.
  await washLoad(client, planId, (await client.query(api.plans.get, { planId }))!.result.loads[0]!.id, washerId, 'journey-busy-second', 30)
  await page.goto('/')
  const hero = page.getByRole('region', { name: /Dryer busy until about \d{1,2}:\d{2}/ })
  await expect(hero).toBeVisible()
  await snapDay(page, 'dryer-busy-home', 'Dry and put away', 'Home: dryer busy', 'Load 2’s wash ended (through the API) while the household’s own dryer still runs load 1. Home says the dryer is busy until about when and offers “Hang or wait”; it never says to move them to a dryer.')
  await hero.getByRole('link', { name: 'Hang or wait', exact: true }).click()
  const busy = page.getByRole('status').filter({ hasText: /^Dryer busy until about/ })
  await expect(busy.getByRole('button', { name: 'Wait for the dryer', exact: true })).toBeVisible()
  await busy.scrollIntoViewIfNeeded()
  await snapDay(page, 'dryer-busy-load', 'Dry and put away', 'Hang them · Wait for the dryer', 'The load says the dryer is busy and offers “Hang them” (only pieces that may hang, rack permitting) or “Wait for the dryer”, which reminds when its timer ends.')

  // Six hours later (the browser clock moved on; the wash and the dryer run are real): the smell check.
  await maybeDay('smell check', async () => {
    await page.clock.setFixedTime(Date.now() + 6 * 60 * 60_000 + 5 * 60_000)
    await page.goto('/')
    const smell = page.getByText('It sat wet a long time. Smell it; rewash if it smells musty.').first()
    await expect(smell).toBeVisible()
    await smell.scrollIntoViewIfNeeded()
    await snapDay(page, 'smell-check', 'Dry and put away', 'The smell check', 'After 6 hours wet (or overnight) the hub asks for a smell check. By then load 1’s dryer time is up, so it says “Take out Home dryer first” and “It sat wet a long time. Smell it; rewash if it smells musty.” For this capture the browser clock was moved 6 hours ahead; the wash and the dryer run are real. The 6 hours is our own cautious limit, not a sourced figure.')
  })
})

test('laundry day: dryer sharing and the early check', async ({ page }) => {
  test.setTimeout(5 * 60_000)
  const { client, householdId, washer, dryer, garment } = await dayHousehold(page, 'journey-share', 'home')
  const washerId = await washer('Home washer', 40)
  await dryer('Home dryer', 60)
  // A tee whose tag says low heat and a towel that may take high heat, washed apart through the API and waiting to dry.
  const tee = await garment('Blue tee', { colorGroup: 'light', heat: 'low', kind: 't_shirt', bulkUnits: 0.5 })
  const towel = await garment('Bath towel', { colorGroup: 'light', kind: 'towel', bulkUnits: 1.5 })
  for (const [id, key] of [[tee, 'journey-share-tee'], [towel, 'journey-share-towel']] as const) {
    const sessionId = await washAlone(client, householdId, [id], washerId, key, 40)
    await client.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  }
  await page.goto('/drying')
  const share = page.getByRole('region').filter({ has: page.getByRole('heading', { name: /1 dryer run instead of 2/ }) })
  await expect(share.getByRole('button', { name: 'Hang the tees', exact: true })).toBeVisible()
  await share.scrollIntoViewIfNeeded()
  await snapDay(page, 'dryer-share', 'Dry and put away', '1 dryer run instead of 2', 'Mixed heats would take two dryer runs. The Drying page offers “1 dryer run instead of 2” at the lowest heat every piece allows, beside “Separate by heat”, which stays chosen. It warns that heavier pieces may need more time, and for the tee offers “Hang the tees”. No money line at home.')

  await maybeDay('early check', async () => {
    await share.getByRole('radio', { name: /^All on low heat/ }).click()
    await page.getByRole('button', { name: /^Load into Home dryer/ }).first().click()
    // The dryer's Delicate button has no recorded temperature, so the heat line says why Low is not used.
    const heatLine = page.getByText(/may run hotter than this tag allows/).first()
    await expect(heatLine).toBeVisible()
    await heatLine.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    await snap7(page, 'dryer-heat-unknown-low', 'Dry and put away', 'Dryer heat: Low not known', 'At a home dryer whose low button is printed “Delicate” and whose model has no spec-sheet temperatures, a tee with a low-heat tag still uses that button (the step says “Choose Delicate”), and one line says it is the low setting, may run hotter than the tag allows, and there is no cooler setting. Here the tee and a towel share one low-heat run.')
    await page.getByLabel(/Minutes on Home dryer/i).fill('50')
    const early = page.getByText('We’ll remind you in about 25 min to take out the Blue tee.')
    await expect(early).toBeVisible()
    await early.scrollIntoViewIfNeeded()
    await snapDay(page, 'early-check-planned', 'Dry and put away', 'The early check, planned', 'With 50 minutes typed, the step says “We’ll remind you in about 25 min to take out the Blue tee.”: the tee is a likely knit next to a heavy towel, so it comes out at about half the time. The reminder is planned before the dryer starts.')
    await page.getByRole('button', { name: /^I[’']ve started Home dryer/ }).click()
    await expect.poll(async () => (await client.query(api.dryingQueue.queue, { householdId })).runs.length).toBe(1)
    const { startedAt } = (await client.query(api.dryingQueue.queue, { householdId })).runs[0]!
    // The browser clock moves to 5 minutes into the run, then 26; the run itself is real.
    await page.clock.setFixedTime(startedAt + 5 * 60_000)
    await page.goto('/laundry')
    const countdown = page.getByRole('region', { name: 'Home dryer · early check' })
    await expect(countdown).toContainText(/\d+ min/)
    await countdown.scrollIntoViewIfNeeded()
    await snap7(page, 'early-check-timer', 'Dry and put away', 'Timer card for the early check', 'Once the run is going, Laundry shows a timer card: the minutes left until the Blue tee comes out (20 min here, 5 minutes into the run; the browser clock was moved ahead for this capture) and “Home dryer keeps going for the rest.”')
    await page.clock.setFixedTime(startedAt + 26 * 60_000)
    await page.goto('/drying')
    const row = page.getByRole('button', { name: /Home dryer/ }).filter({ hasText: 'Check now: Blue tee' })
    await expect(row).toBeVisible()
    await snapDay(page, 'early-check-now', 'Dry and put away', 'Check now', 'At 26 minutes (browser clock moved ahead for this capture) the dryer row on the Drying page says “Check now: Blue tee”.')
    await row.click()
    await expect(page.getByRole('heading', { name: 'Take out early' })).toBeVisible()
    await expect(page.getByText('Take out the Blue tee and hang it. Leave the Bath towel in, Home dryer keeps going.')).toBeVisible()
    await snapDay(page, 'early-check-take-out', 'Dry and put away', 'Take out early', 'The check is one instruction (“Take out the Blue tee and hang it. Leave the Bath towel in, Home dryer keeps going.”), then “Take out now” with one row per piece: the tee set to Hang it and “Bath towel stays in”, each with Change, and “Then close the door and press Start on Home dryer.” No extra minutes are asked.')
    await page.getByRole('button', { name: 'Change' }).first().click()
    await expect(page.getByRole('radiogroup', { name: 'Blue tee: dry, hang it, or not yet' })).toBeVisible()
    await snap7(page, 'early-check-change', 'Dry and put away', 'Change for one piece', 'Change opens the three answers for that piece only: Dry, Hang it (chosen) and Not yet.')
    await page.getByRole('button', { name: 'Done, dryer keeps going' }).click()
    await expect(page.getByText('1 hanging to dry · 1 still in the dryer.')).toBeVisible()
    await snap7(page, 'early-check-done', 'Dry and put away', 'After the early check', 'After “Done, dryer keeps going”, Drying says “1 hanging to dry · 1 still in the dryer.” The Home dryer row holds the towel with its minutes left, and a Hang to dry row holds the tee (Check when dry).')
    skipped.push('laundry day: history “Tumbled N min, then hung”: not walked; the walk ends once the tee hangs and the towel keeps running')
  })
})

// A paid shared dryer: the owner's room sells 16 minutes for $0.50; the dryer is picked by its number.
test('laundry day: a paid dryer picked by number', async ({ page }) => {
  test.setTimeout(5 * 60_000)
  const { client, householdId, washer, dryer, garment } = await dayHousehold(page, 'journey-paid', 'shared')
  const washerId = await washer('Washer 3', 40)
  for (let number = 1; number <= 12; number += 1) await dryer(`Dryer ${number}`, 60, { pricePerStart: 0.5, blockMinutes: 16 })
  const tee = await garment('Blue tee', { colorGroup: 'light', heat: 'low', kind: 't_shirt', bulkUnits: 0.5 })
  const towel = await garment('Bath towel', { colorGroup: 'light', kind: 'towel', bulkUnits: 1.5 })
  for (const [id, key] of [[tee, 'journey-paid-tee'], [towel, 'journey-paid-towel']] as const) await client.mutation(api.dryingQueue.queueFromWasher, { sessionId: await washAlone(client, householdId, [id], washerId, key, 40) })
  await page.goto('/drying')
  await page.getByRole('button', { name: 'Load into a dryer', exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Which dryer?', exact: true })).toBeVisible()
  await snap7(page, 'dryer-picker-number', 'Dry and put away', 'Which dryer? number first', 'In a shared room, “Which dryer?” asks for the number first (“Number printed on it, e.g. 14”), with “All 12 dryers” collapsed and “None free” below. The primary stays disabled until a dryer is entered. Shortcuts only: nothing is assumed free or reserved.')
  await page.getByRole('button', { name: /^All 12 dryers/ }).click()
  await snap7(page, 'dryer-picker-all', 'Dry and put away', 'Which dryer? Show all', '“All 12 dryers” lists them as chips (Dryer 1 to Dryer 12) under the number field.')
  await page.getByRole('button', { name: 'Dryer 7', exact: true }).first().click()
  await page.getByLabel(/Minutes on Dryer 7/i).fill('32')
  await expect(page.getByText(/Pay about 2 blocks · \$1\.00 if asked/)).toBeVisible()
  await snap7(page, 'dryer-paid-blocks', 'Dry and put away', 'A paid dryer: blocks and price', 'A paid dryer shows its price as blocks: the room sells 16 minutes for $0.50, so 32 minutes reads “about 2 blocks · $1.00”, in the steps (“Pay about 2 blocks · $1.00 if asked”) and under the minutes field. The tee’s low tag uses Delicate here too, with the same may-run-hotter line.')
  const labelBox = page.getByRole('checkbox', { name: 'I’ve followed these label instructions', exact: true })
  if (await labelBox.count() > 0) await labelBox.check()
  await page.getByRole('button', { name: /^I[’']ve started Dryer 7/ }).click()
  await expect.poll(async () => (await client.query(api.dryingQueue.queue, { householdId })).runs.length).toBe(1)
  await page.goto('/drying')
  await page.getByRole('button', { name: 'Load into a dryer', exact: true }).first().click()
  await expect(page.getByRole('button', { name: 'Dryer 7', exact: true }).first()).toBeVisible()
  await snap7(page, 'dryer-picker-recent', 'Dry and put away', 'Which dryer? recent machines', 'After a first run on Dryer 7, the next load’s (the towel’s) “Which dryer?” lists it under “Previously used”, above “All 12 dryers”.')
})

test('laundry day: a shared room', async ({ page }) => {
  test.setTimeout(5 * 60_000)
  const { client, householdId, washer, dryer, garment } = await dayHousehold(page, 'journey-shared', 'shared')
  // The owner's kind of room: 12 washers and 20 dryers, with no machine status.
  const washers: Id<'machines'>[] = []
  for (let number = 1; number <= 12; number += 1) washers.push(await washer(`Washer ${number}`, 47))
  for (let number = 1; number <= 20; number += 1) await dryer(`Dryer ${number}`)
  const ids = [await garment('White tee'), await garment('Black jeans', { color: 'Black', colorGroup: 'black' }), await garment('Red tee', { color: 'Red', colorGroup: 'saturated' })]
  const { planId } = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: ids, clientInputHash: 'journey-shared' })
  const plan = (await client.query(api.plans.get, { planId }))!

  await page.goto('/laundry')
  const footer = page.locator('[data-slot=task-footer]')
  await expect(footer.getByText('What’s free right now?')).toBeVisible()
  await snapDay(page, 'shared-whats-free', 'Plan and wash', 'What’s free right now?', 'In a shared room, the first start of a pass asks two quick questions in the footer: Washers free and Dryers free (1, 2 or 3+), each one row of choices. The answers stay on this phone. No machine is ever called free, and no planned or predicted times or held starts appear.')
  await footer.getByRole('radiogroup', { name: 'Washers free' }).getByRole('radio', { name: '3+', exact: true }).click()
  await footer.getByRole('radiogroup', { name: 'Dryers free' }).getByRole('radio', { name: '1', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Start 1 wash now.' })).toBeVisible()
  await snapDay(page, 'shared-start-one', 'Plan and wash', 'Start 1 wash now', 'With 3+ washers and 1 dryer free: start one wash per free dryer, plus loads that hang to dry. The loads are marked Start now or Later in wash order; “Start all now” is the person’s explicit choice.')

  await maybeDay('washer picker', async () => {
    await page.getByRole('button', { name: /Open .+ load$/ }).click()
    await expect(page).toHaveURL(/plan|load/)
    await page.getByRole('button', { name: 'I’m at the laundry room', exact: true }).click()
    await expect(page.getByLabel('Which washer are you using?')).toBeVisible()
    await snap7(page, 'washer-picker-number', 'Plan and wash', 'Which washer? number first', 'At the laundry room, the plan asks “Which washer are you using?” with the number first (“Number printed on it, e.g. 14”), “All 12 washers” collapsed, “No number on it?” and a disabled “Enter the washer you are using”. Shortcuts only: nothing is assumed free or reserved.')
    await page.getByRole('button', { name: /^All 12 washers/ }).click()
    await snap7(page, 'washer-picker-all', 'Plan and wash', 'Which washer? Show all', '“All 12 washers” lists them as chips (Washer 1 to Washer 12) under the number field.')
  })

  // Load 1's wash time ran out (set up through the API): its own dryer step is next.
  const first = await washLoad(client, planId, plan.result.loads[0]!.id, washers[0]!, 'journey-shared-first', 47, false)
  await page.goto(`/session/${first}`)
  await expect(page.getByRole('heading', { level: 2, name: 'Which dryer?', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'None free', exact: true }).click()
  const none = page.getByText('No dryer free right now. Hang them, or wait for one.')
  await expect(none).toBeVisible()
  await none.scrollIntoViewIfNeeded()
  await snapDay(page, 'shared-none-free-step', 'Dry and put away', 'None free, at the wash’s dryer step', 'At the wash’s own “Which dryer?” step (step 5 of 7; load 1’s wash time ran out), “None free” replaces the picker with “No dryer free right now. Hang them, or wait for one.” and offers Hang them, Wait for one and “A dryer is free now” to undo. The wash’s recorded start (“started …” at the top) and its own timer (“Time is up”) still show; no planned or predicted time does.')
  await page.getByRole('button', { name: 'Wait for one', exact: true }).click()
  await expect(page).toHaveURL(/\/drying/)
  await page.getByRole('button', { name: 'Load into a dryer' }).first().click()
  await page.getByRole('button', { name: 'None free', exact: true }).click()
  await expect(none).toBeVisible()
  await none.scrollIntoViewIfNeeded()
  await snapDay(page, 'shared-none-free-drying', 'Dry and put away', 'None free, on the Drying page', 'The same choice on the Drying page’s “Which dryer?”: “None free” replaces the picker with “No dryer free right now. Hang them, or wait for one.” and offers Hang them, Wait for one and “A dryer is free now”.')
  await maybeDay('washer picker, used before', async () => {
    await page.goto('/laundry')
    await page.getByRole('button', { name: /Open .+ load$/ }).click()
    await page.getByRole('button', { name: 'I’m at the laundry room', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Washer 1', exact: true }).first()).toBeVisible()
    await snap7(page, 'washer-picker-recent', 'Plan and wash', 'Which washer? recent machines', 'After load 1 ran on Washer 1, load 2’s “Which washer?” lists it under “Previously used”, above “All 12 washers”.')
  })
  writeManifest()
})

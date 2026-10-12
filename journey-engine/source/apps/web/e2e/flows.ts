import { expect, type Browser, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../src/api'
import { kindTileWords } from '../src/copy'
export const baseURL = process.env.WASHCLOSET_E2E_BASE_URL ?? 'http://localhost:3000'

// Test-only accounts on a local or preview deployment; each run and worker uses fresh addresses.
export const run = `${Date.now().toString(36)}w${process.env.TEST_WORKER_INDEX ?? 0}`
export const password = 'washcloset-e2e-password'
export const email = (who: string) => `${who}-${run}@example.invalid`

/** Use normal page authentication for isolated test data and server-side assertions. */
export async function convexAs(page: Page) {
  const response = await page.request.get('/api/auth/convex/token')
  expect(response.status(), 'Authenticated Convex token endpoint').toBe(200)
  const { token } = await response.json() as { token: string }
  const client = new ConvexHttpClient(process.env.WASHCLOSET_E2E_CONVEX_URL ?? 'http://127.0.0.1:3210')
  client.setAuth(token)
  const { households } = await client.query(api.households.onboardingStatus, {})
  return { client, householdId: households[0]!.householdId }
}

/** Regular-expression text for a name read inside an accessible label. */
const escapeName = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Closet list rows. Each row is one button named "<owner>, <Name>, …" when several closets show,
 * otherwise "<Name>, …" (closet-view.tsx GarmentRow); the quantity rides on the name as "<Name>, 3, …".
 */
export function closetRows(page: Page, name?: string): Locator {
  return page.getByRole('main').getByRole('listitem').getByRole('button', { name: name === undefined ? /, / : new RegExp(`(^|, )${escapeName(name)}, `) })
}

/** Laundry hamper rows under "In the hamper"; the quantity steppers beside them are named Fewer and More. */
export function hamperRows(page: Page, name?: string): Locator {
  const section = page.getByRole('main').locator('section').filter({ has: page.getByRole('heading', { name: 'In the hamper', exact: true }) })
  return section.getByRole('listitem').getByRole('button', { name: name === undefined ? /, / : new RegExp(`^${escapeName(name)}, `) })
}

/** Home's "Ready to wear" tiles: links named "<Name>, <color>, <n> pieces, Ready to wear". */
export function homeReadyTiles(page: Page): Locator {
  return page.getByRole('region', { name: 'Ready to wear pages', exact: true }).getByRole('link')
}

/** The topmost open sheet: an editor opens over the garment record, which stays open beneath it. */
export function topDialog(page: Page): Locator {
  return page.getByRole('dialog').last()
}

export async function signUp(page: Page, who: string, name: string) {
  await page.goto('/create-account')
  await expect(page.getByLabel('Email', { exact: true })).toBeEnabled()
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.getByLabel('Email', { exact: true }).fill(email(who))
  await page.getByLabel('Password', { exact: true }).fill(password)
  // Production auth rate-limits sign-up per client; wait out the window instead of failing.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    const onboarding = page.getByRole('heading', { name: 'Your household' })
    const limited = page.getByRole('alert').filter({ hasText: 'Too many attempts' })
    await expect(onboarding.or(limited)).toBeVisible()
    if (await onboarding.isVisible()) return
    await page.waitForTimeout(11_000)
  }
  await expect(page.getByRole('heading', { name: 'Your household' })).toBeVisible()
}

/** All acceptance users go through real registration; no test-auth bypass is enabled. */
export async function signInAs(page: Page, who: string, name: string) {
  await signUp(page, who, name)
}

/** First run: create a household with its suggested name ("{First name}'s home"), set where you wash, then Home. */
export async function createHousehold(page: Page, where: 'At home' | 'Shared laundry room' | 'Both' = 'Shared laundry room') {
  await page.getByRole('button', { name: /Create a household/ }).click()
  await page.getByRole('button', { name: 'Create household', exact: true }).click()
  await page.getByRole('button', { name: /Where you wash/ }).click()
  await page.getByRole('radio', { name: where, exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
}

/** A named invitation independent of clothing profiles; returns the code from the invite sheet. */
export async function inviteNewPerson(page: Page, name: string): Promise<string> {
  await openHousehold(page, 'People')
  await page.getByRole('button', { name: /^Invite someone\./ }).click()
  const someoneNew = page.getByRole('dialog').getByRole('button', { name: /^Someone new\b/ })
  if (await someoneNew.isVisible()) await someoneNew.click()
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.getByRole('button', { name: 'Make invite link', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: `Invite ${name}`, exact: true })
  const code = (await sheet.getByRole('button', { name: /^Copy code/ }).textContent())!.match(/[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}/)![0]
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(sheet).toHaveCount(0)
  return code
}

/** First run's fallback way in to someone else's household: the code, then the preview, then Join. */
export async function joinWithCode(page: Page, code: string) {
  await page.getByRole('button', { name: /Join a household/ }).click()
  await page.getByLabel('Invite code').fill(code)
  await page.getByRole('button', { name: 'Check code', exact: true }).click()
  await page.getByRole('button', { name: /^Join household:/ }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
}

/** Open Household's People landing page, then select the requested section explicitly. */
export async function openHousehold(page: Page, section: 'Machines' | 'Appliances' | 'Products' | 'People') {
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Household' }).click()
  await page.getByRole('group', { name: 'Show', exact: true }).getByRole('button', { name: section === 'Machines' ? 'Appliances' : section, exact: true }).click()
}

export type BottleUseWord = 'Detergent' | 'Booster' | 'Softener' | 'Sanitizer' | 'Rinse sanitizer' | 'Dryer sheet'

/** A product from Household's Products, with the marks printed on its cap; "Detergent" unless another use is given. */
export async function addBottle(page: Page, name: string, marks: readonly string[], use: BottleUseWord = 'Detergent') {
  await openHousehold(page, 'Products')
  await page.getByRole('button', { name: 'Add a product' }).click()
  const bottle = topDialog(page)
  await bottle.getByRole('button', { name: 'Liquid', exact: true }).click()
  await bottle.getByRole('button', { name: 'Next', exact: true }).click()
  await bottle.getByRole('button', { name: use, exact: true }).click()
  await bottle.getByRole('button', { name: 'Next', exact: true }).click()
  await bottle.getByLabel('Product name', { exact: true }).fill(name)
  await bottle.getByRole('button', { name: 'Next', exact: true }).click()
  for (const mark of marks) await bottle.getByRole('button', { name: mark, exact: true }).click()
  await bottle.getByRole('button', { name: 'Next', exact: true }).click()
  await bottle.getByRole('button', { name: 'Save', exact: true }).click()
  await bottle.getByRole('button', { name: 'Add details', exact: true }).click()
  await bottle.getByRole('button', { name: 'Contents and ingredients', exact: true }).click()
  // These synthetic fixtures explicitly have no bleach; production entry defaults to unknown.
  await bottle.getByRole('group', { name: 'Bleach', exact: true }).getByRole('button', { name: 'None', exact: true }).click()
  await bottle.getByRole('checkbox', { name: 'I’ve checked the pack', exact: true }).check()
  await bottle.getByRole('button', { name: 'Save', exact: true }).click()
  await bottle.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(bottle).toHaveCount(0)
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible()
}

export type MachineEntry = {
  readonly kind: 'Washer' | 'Dryer'
  readonly name: string
  readonly count: number
  /** "2.50": the coin price per start, for a shared room. */
  readonly price?: string
  /** A washer's normal cycle, or the minutes one dryer start gives. */
  readonly minutes?: string
  /** The dryer's heat buttons in its own words, by the app's heat names ("Low heat"). */
  readonly heat?: Readonly<Record<string, string>>
  readonly programMode?: 'fixed' | 'sensor' | 'unknown'
  /** A washer's door; a front-loader unless a top-loader is asked for. */
  readonly door?: 'Front' | 'Top'
  /** Whether the HE logo is on it; "Yes" unless told otherwise (a top-loader is usually "No"). */
  readonly he?: 'Yes' | 'No' | 'Not sure'
  /** The dispenser slots to tap on; ["Detergent"] unless given. A top-loader with none passes []. */
  readonly slots?: readonly ('Detergent' | 'Softener' | 'Bleach')[]
}

/** Machines from Household's Machines: "How many like it?" makes "{name} 1…n". */
export async function addMachines(page: Page, entry: MachineEntry, place: 'At home' | 'Shared room' = 'Shared room') {
  await openHousehold(page, 'Machines')
  // The add row's words follow the household's wash place; any of them opens the same editor.
  await page.getByRole('button', { name: /^Add (an|another) appliance/ }).click()
  const sheet = topDialog(page)
  // Asked only when the household uses both kinds of place.
  const where = sheet.getByRole('button', { name: place, exact: true })
  if (await where.count() > 0) await where.click()
  await sheet.getByRole('button', { name: entry.kind, exact: true }).click()
  await sheet.getByRole('button', { name: 'Next', exact: true }).click()
  if (entry.kind === 'Washer') {
    await sheet.getByRole('group', { name: 'Door' }).getByRole('button', { name: entry.door ?? 'Front', exact: true }).click()
  }
  for (const [heat, words] of Object.entries(entry.heat ?? {})) await sheet.getByLabel(heat, { exact: true }).fill(words)
  await sheet.getByRole('button', { name: 'Next', exact: true }).click()
  if (entry.price !== undefined) await sheet.getByLabel('Price per start').fill(entry.price)
  await sheet.getByLabel('Number or label as printed', { exact: true }).fill(entry.name)
  for (let count = 1; count < entry.count; count += 1) await sheet.getByRole('button', { name: 'More: How many like it?' }).click()
  const noun = entry.kind.toLowerCase()
  await sheet.getByRole('button', { name: 'Next', exact: true }).click()
  await sheet.getByRole('button', { name: entry.count > 1 ? `Save ${entry.count} ${noun}s` : `Save ${noun}` }).click()
  if (entry.kind === 'Washer') {
    await sheet.getByRole('button', { name: 'Add details', exact: true }).click()
    await sheet.getByRole('button', { name: 'HE logo and dispensers', exact: true }).click()
    await sheet.getByRole('group', { name: 'Do you see this logo on it?' }).getByRole('button', { name: entry.he ?? 'Yes', exact: true }).click()
    for (const slot of entry.slots ?? ['Detergent']) await sheet.getByRole('group', { name: 'Slots you see' }).getByRole('button', { name: slot, exact: true }).click()
    await sheet.getByRole('button', { name: 'Save washer', exact: true }).click()
  }
  if (entry.minutes !== undefined || entry.programMode !== undefined) {
    if (entry.kind === 'Dryer') {
      await sheet.getByRole('button', { name: 'Add details', exact: true }).click()
      await sheet.getByRole('button', { name: 'Cycle time', exact: true }).click()
    } else await sheet.getByRole('button', { name: /^Normal cycle\b/ }).click()
    if (entry.minutes !== undefined) await sheet.getByLabel(entry.kind === 'Dryer' ? 'Minutes one start gives' : 'Minutes for a normal wash').fill(entry.minutes)
    if (entry.programMode !== undefined) await sheet.getByLabel('Checked dryer program mode', { exact: true }).selectOption(entry.programMode)
    await sheet.getByRole('button', { name: `Save ${noun}`, exact: true }).click()
  }
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByText(entry.count > 1 ? `${entry.name} ×${entry.count}` : entry.name, { exact: true })).toBeVisible()
}

/** A detergent with its cap marks, and one shared washer with a 40 minute cycle. */
export async function addProductAndWasher(page: Page) {
  await addBottle(page, 'Tide HE liquid', ['1', '3', '5'])
  await addMachines(page, { kind: 'Washer', name: 'Laundry room washer', count: 1, price: '2.50', minutes: '40' })
}

/** The one staged intake from Closet: type tile, details, color, care label, then stains and where it goes, one question to a screen; Done closes. */
export async function addClothes(page: Page, { name, color = 'White', kind = 't_shirt', count = 1, target = 'hamper', wash = 'Cold', dryer = 'Low heat', photo, firstWash = false }: {
  name: string; color?: string; kind?: string; count?: number; target?: 'closet' | 'hamper'; wash?: string; dryer?: string; photo?: string; firstWash?: boolean
}) {
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Closet', exact: true }).click()
  await page.getByRole('button', { name: 'Add clothes', exact: true }).click()
  const add = page.getByRole('dialog')
  await add.getByRole('button', { name: kindTileWords[kind as keyof typeof kindTileWords], exact: true }).click()
  // Use the selected closet's prefilled owner, as a person adding their own clothes would.
  await expect(add.getByRole('radiogroup', { name: 'Whose is it?', exact: true }).getByRole('radio', { checked: true })).toHaveCount(1)
  await add.getByRole('button', { name: 'Next: details', exact: true }).click()
  await add.getByLabel('Name', { exact: true }).fill(name)
  await add.getByLabel('Quantity', { exact: true }).fill(String(count))
  await add.getByRole('button', { name: 'Next: fabric', exact: true }).click()
  await add.getByRole('button', { name: 'Next: color', exact: true }).click()
  await add.getByRole('radio', { name: color === 'Dark' ? 'Black' : color, exact: true }).click()
  await add.getByRole('button', { name: 'Next: where from', exact: true }).click()
  await add.getByRole('button', { name: 'Next: dye', exact: true }).click()
  await add.getByRole('radio', { name: firstWash ? 'New, not washed yet' : 'Washed without dye running', exact: true }).click()
  await add.getByRole('button', { name: 'Next: care label', exact: true }).click()
  await add.getByRole('group', { name: 'Washtub on the tag' }).getByRole('button', { name: wash, exact: true }).click()
  await add.getByRole('button', { name: 'Next', exact: true }).click()
  // A washable tag asks the bleach triangle, then the dryer square; a tag that rules out washing asks neither.
  if (wash !== 'Do not wash' && wash !== 'Dry clean only') {
    await add.getByRole('radio', { name: /Tag doesn.t say/ }).click()
    await add.getByRole('button', { name: 'Next', exact: true }).click()
    await add.getByRole('radio', { name: dryer, exact: true }).click()
    await add.getByRole('button', { name: 'Next', exact: true }).click()
  }
  await add.getByRole('radio', { name: 'No stains', exact: true }).click()
  await add.getByRole('button', { name: 'Next: review', exact: true }).click()
  if (photo !== undefined) {
    await add.getByRole('button', { name: 'Edit more on the label', exact: true }).click()
    await add.locator('input[type=file]').setInputFiles(photo)
    await add.getByRole('button', { name: 'Next: review', exact: true }).click()
  }
  await add.getByRole('radio', { name: target === 'hamper' ? 'Needs washing' : 'Ready to wear', exact: true }).click()
  await add.getByRole('button', { name: 'Save item', exact: true }).click()
  // The saved panel keeps the result visible until Done.
  await expect(add.getByRole('status')).toContainText('added')
  await add.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(add).toHaveCount(0)
  await expect(page.getByRole('button', { name: new RegExp(`^${name},`) })).toBeVisible()
}

export async function planAndStart(page: Page, itemCount: number) {
  await page.getByRole('navigation').getByRole('link', { name: /^Laundry/ }).click()
  await expect(page.getByText(new RegExp(`^${itemCount} of ${itemCount} selected(?: ·|$)`))).toBeVisible()
  await page.getByRole('button', { name: `Sort ${itemCount} ${itemCount === 1 ? 'piece' : 'pieces'} into loads`, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Whites load' })).toBeVisible()
  await answerCards(page)
  await page.getByRole('button', { name: 'I’m at the laundry room', exact: true }).click()
  await page.getByRole('button', { name: /^Confirm recipe for / }).click()
  await page.getByRole('button', { name: 'See what goes in', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'What goes in' })).toBeVisible()
  await page.getByRole('button', { name: 'Start preparation', exact: true }).click()
  await expect(page.locator('section.machine-step')).toBeVisible()
  return page.url()
}

/** The drying queue after a wash: each planned dryer load into the first dryer, then dry and put away. */
export async function dryAndPutAway(page: Page, seen: string[], timer?: { suggested: string; shown: string }) {
  await expect(page).toHaveURL(/\/drying(?:\?|$)/)
  await expect(page.getByRole('heading', { level: 1, name: 'Drying' })).toBeVisible()
  for (let i = 0; i < 6; i += 1) {
    const load = page.getByRole('button', { name: /^Load into / }).first()
    if (await load.count() === 0) break
    await load.click()
    seen.push('Load into a dryer')
    await expect(page.getByRole('heading', { level: 1, name: 'Which dryer?', exact: true })).toBeVisible()
    if (timer !== undefined) {
      await expect(page.getByLabel(/^Minutes on /)).toHaveValue('')
      await page.getByRole('button', { name: `Use suggested ${timer.suggested} min`, exact: true }).click()
      await expect(page.getByLabel(/^Minutes on /)).toHaveValue(timer.suggested)
    }
    await page.getByLabel(/^Minutes on /).fill(timer?.shown ?? '45')
    const labelInstructions = page.getByRole('checkbox', { name: 'I’ve followed these label instructions', exact: true })
    if (await labelInstructions.count() > 0) {
      await expect(page.getByRole('button', { name: /^I’ve started |^I've started / })).toBeDisabled()
      await labelInstructions.check()
    }
    await page.getByRole('button', { name: /^I’ve started |^I've started / }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Drying' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Drying now', exact: true })).toBeVisible()
  }
  const air = page.getByRole('button', { name: /^Hang \d+ pieces? to dry/ })
  if (await air.count() > 0) {
    await air.click()
    await expect(page.getByRole('heading', { name: 'Drying now', exact: true })).toBeVisible()
  }
  for (let i = 0; i < 6; i += 1) {
    // Dryer runs and air-drying runs (a stained piece air dries until its stain is checked).
    const run = page.getByRole('button', { name: /^(Laundry room dryer|Hang to dry|Lay flat|Air drying) / }).first()
    if (await run.count() === 0) break
    await run.click()
    // Before its end, a run with an early check opens "Take out early": leave everything in, then check dryness.
    const early = page.getByRole('heading', { name: 'Take out early', exact: true })
    await expect(page.getByRole('button', { name: /^Put away / }).or(early)).toBeVisible()
    if (await early.isVisible()) {
      for (const change of await page.getByRole('button', { name: 'Change', exact: true }).all()) await change.click()
      for (const piece of await page.getByRole('radiogroup', { name: /: dry, hang it, or not yet$/ }).all()) await piece.getByRole('radio', { name: 'Not yet', exact: true }).click()
      await page.getByRole('button', { name: 'Leave them all in', exact: true }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Drying' })).toBeVisible()
      await run.click()
    }
    seen.push('Is it dry?')
    const labelHandling = page.getByRole('checkbox', { name: 'I’ve followed these label instructions', exact: true })
    if (await labelHandling.count() > 0) {
      await expect(page.getByRole('button', { name: /^Put away / })).toBeDisabled()
      await labelHandling.check()
    }
    await page.getByRole('button', { name: /^Put away / }).click()
    await page.getByRole('button', { name: /^Put away \d+ piece/ }).click()
    seen.push('Put away')
    await expect(page.getByRole('heading', { level: 1, name: 'Drying' })).toBeVisible()
  }
}

/** Test label answers describe synthetic products, not instructions for a real bottle. */
export async function answerCards(page: Page) {
  const card = page.getByRole('main')
  for (let asked = 0; asked < 12; asked += 1) {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const care = page.getByRole('button', { name: /\. Check care label$/ }).first()
    const pack = page.getByRole('button', { name: 'Check the pack', exact: true }).first()
    if (await care.count() > 0) await care.click()
    else if (await pack.count() > 0) await pack.click()
    else return
    await expect(card).toBeVisible()
    const question = (await card.textContent()) ?? ''
    if (question.includes('Grab the')) {
      await card.getByRole('radio', { name: '3', exact: true }).click()
      await card.getByRole('button', { name: 'Yes', exact: true }).click()
    } else if (question.includes('have this logo')) await card.getByRole('button', { name: 'Yes', exact: true }).click()
    else if (question.includes('Check the tag inside')) {
      await card.getByRole('group', { name: 'Washtub on the tag' }).getByRole('button', { name: 'Cold', exact: true }).click()
      await card.getByRole('button', { name: /Tag doesn.t say/ }).click()
      await card.getByRole('button', { name: 'Low heat', exact: true }).click()
    } else if (question.includes('How dirty is each')) {
      for (const line of await card.locator('.soil-line').all()) await line.getByRole('button').nth(1).click()
    } else throw new Error(`Unexpected planning question: ${question}`)
    await page.getByRole('button', { name: 'Update plan', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Whites load' })).toBeVisible()
  }
  throw new Error('Planning did not reach the load cards')
}

export async function finishSession(page: Page, timer?: { suggested: string; shown: string }) {
  const step = page.locator('section.machine-step').first()
  const complete = page.getByRole('heading', { level: 1, name: /, done\.$|^Load complete$/ })
  const seen: string[] = []
  for (let i = 0; i < 24; i += 1) {
    const washing = page.getByRole('heading', { level: 1, name: 'Washing', exact: true })
    // The finished washer is also titled Drying. Its back action is a link;
    // the independent queue has a button, so do not mistake one for the other.
    const queue = page.locator('main').filter({ has: page.getByRole('button', { name: 'Back to Laundry', exact: true }) }).getByRole('heading', { level: 1, name: 'Drying', exact: true })
    const move = page.getByRole('button', { name: 'Move to drying queue', exact: true })
    await expect(step.or(complete).or(washing).or(queue).or(move).first()).toBeVisible()
    if (await complete.isVisible()) return seen
    if (await queue.isVisible()) { await dryAndPutAway(page, seen, timer); return seen }
    if (await move.isVisible()) {
      await move.click()
      await expect(queue).toBeVisible()
      await dryAndPutAway(page, seen, timer)
      return seen
    }
    if (await washing.isVisible()) {
      await page.getByRole('button', { name: /has finished$/ }).click()
      await expect(move).toBeVisible()
      continue
    }
    const title = ((await step.locator('.machine-step-title').textContent()) ?? '').trim()
    const before = await step.textContent()
    seen.push(title)
    const next = page.getByRole('button', { name: 'Done · next step', exact: true })
    if (await next.isVisible()) await next.click()
    else if (title.startsWith('How full')) await step.getByRole('button', { name: 'Half', exact: true }).click()
    else if (title === 'Press Start') {
      await page.getByLabel(/^Minutes shown on /).fill('40')
      await page.getByRole('button', { name: /^I’ve started / }).click()
    }
    else if (title.startsWith('Washing')) await step.getByRole('button', { name: 'It finished early', exact: true }).click()
    else if (title.endsWith('has finished')) {
      // The washer is done: its pieces join the drying queue, planned apart from wash loads.
      await step.getByRole('button', { name: 'Move to drying queue', exact: true }).click()
      await dryAndPutAway(page, seen, timer)
      return seen
    }
    else if (title === 'Which dryer?') await step.getByRole('button', { name: /dryer 1$/i }).click()
    else if (title === 'Pull out the hang items') await step.getByRole('button', { name: 'They’re out', exact: true }).click()
    else if (title === 'Take it out and hang it') await step.getByRole('button', { name: 'It’s hanging', exact: true }).click()
    else if (title === 'Start the dryer') await step.getByRole('button', { name: 'Dryer started', exact: true }).click()
    else if (title === 'Collect from the dryer') await step.getByRole('button', { name: 'All dry', exact: true }).click()
    else if (title === 'That’s everything') await step.getByRole('button', { name: 'Finish this load', exact: true }).click()
    else if (await step.getByRole('button', { name: 'Done', exact: true }).isVisible()) await step.getByRole('button', { name: 'Done', exact: true }).click()
    else throw new Error(`Unexpected machine step: ${title}`)
    await expect.poll(async () => await complete.isVisible() || await washing.isVisible() || await step.textContent().catch(() => before) !== before).toBe(true)
  }
  throw new Error(`Session did not complete: ${seen.join(' → ')}`)
}

export async function freshPage(browser: Browser, permissions: string[] = []) {
  const context = await browser.newContext({ permissions })
  return context.newPage()
}

/** Opens an explicit editor section when requested, then its closed "Advanced" rows. */
export async function openAdvanced(scope: Page | Locator, section?: 'Care' | 'More') {
  if (section !== undefined) {
    const editItem = scope.getByRole('button', { name: 'Edit item details', exact: true })
    if (await editItem.count()) await editItem.click()
    await scope.getByRole('tab', { name: section, exact: true }).last().click()
  }
  const rows = scope.getByRole('button', { name: 'Advanced', exact: true })
  for (const row of await rows.all()) if (await row.getAttribute('aria-expanded') !== 'true') await row.click()
}

/** Fixture sign-in keeps each caller's original readiness assertion. */
export async function signIn(page: Page, email = 'demo@example.invalid', ready: 'navigation' | 'today' = 'navigation') {
  const accounts = JSON.parse(await readFile(new URL('../.data/fixture-accounts.json', import.meta.url), 'utf8'))
  const account = accounts.find((entry: { email: string }) => entry.email === email)
  await page.goto('/')
  if (ready === 'navigation') await expect(page.getByLabel('Email', { exact: true })).toBeEnabled()
  await page.getByLabel('Email', { exact: true }).fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  if (ready === 'today') await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible()
  else await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
}

/** Home's garment links open the closet record over Home: a Ready to wear tile, or the care-label flag when nothing is ready. */
export function homeGarmentLinks(page: Page): Locator {
  return homeReadyTiles(page).or(page.getByRole('main').getByRole('link', { name: 'Check care labels', exact: true }))
}

/** The care questions with the tag's tub, an unread bleach triangle and a dryer heat. */
export async function careLabel(sheet: Locator, wash: string, dryer: string) {
  await sheet.getByRole('group', { name: 'Washtub on the tag' }).getByRole('button', { name: wash, exact: true }).click()
  await sheet.getByRole('button', { name: 'Next', exact: true }).click()
  await sheet.getByRole('radio', { name: /Tag doesn.t say/ }).click()
  await sheet.getByRole('button', { name: 'Next', exact: true }).click()
  const drying = sheet.getByRole('radio', { name: dryer, exact: true })
  if (!await drying.isChecked()) await drying.click()
  await sheet.getByRole('button', { name: 'Next', exact: true }).click()
}

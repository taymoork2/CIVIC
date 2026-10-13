import { createElement } from 'react'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'

import { machineStepText, productText } from '@/copy'
import { recipeActions } from '@/dev/laundry-preview'
import { DryingPreview } from '@/dev/drying-preview'
import { Route } from '@/routes/design-preview'
import { stepActions, stepOptionLabels, stepRecoveryLabels } from '@/laundry/session-view'
import { renderWithConvex } from '@/test/markup'

// The specimens render outside a router; navigation is never reached while rendering.
vi.mock('@tanstack/react-router', async (original) => ({ ...await original<typeof import('@tanstack/react-router')>(), useNavigate: () => () => {} }))

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
// The route's component is split into its own chunk; load it before rendering synchronously.
beforeAll(async () => { await (Route.options.component as { preload?: () => Promise<void> }).preload?.() })

const screen = (name: string) => {
  vi.spyOn(Route, 'useSearch').mockReturnValue({ screen: name, state: undefined, textScale: 1 } as never)
  return renderWithConvex(createElement(Route.options.component!)).replace(/&amp;/g, '&')
}

test('Rehearsal drying fixtures use the requested family inventory size', () => {
  for (const pieceCount of [100, 500, 1000] as const) {
    const markup = renderWithConvex(createElement(DryingPreview, { variant: 'scale-check', pieceCount }))
    expect(markup).toContain(`${pieceCount} dry · 0 still drying`)
    expect(markup.match(/role="checkbox"/g)).toHaveLength(40)
    expect(markup).toContain('Interactive preview · changes stay on this page')
  }
})

test('development visual previews are available without redirecting to the live app', () => {
  vi.stubEnv('DEV', true)
  expect(() => Route.options.beforeLoad!({} as never)).not.toThrow()
})

test('visual previews are unavailable in production', () => {
  vi.stubEnv('DEV', false)
  let result: unknown
  try { Route.options.beforeLoad!({} as never) } catch (error) { result = error }
  expect(result).toMatchObject({ isNotFound: true })
})

test('the preparation specimen offers the live step’s options and recovery behind "Something different?", labeled as a preview', () => {
  // The live controller's eligibility for the fixture's detergent step in a planned load.
  const eligible = stepActions(recipeActions[1]!, { paused: false, readOnly: false, preparing: true, isDetergent: true, hasLoad: true })
  expect([...eligible.options.map((key) => stepOptionLabels[key]), ...eligible.recovery.map((key) => stepRecoveryLabels[key])]).toHaveLength(4)
  for (const name of ['laundry-preparation', 'preparation']) {
    const markup = screen(name)
    expect(markup).toContain(machineStepText.previewOnly)
    expect(markup).toContain(machineStepText.somethingDifferent)
    // The retired preview-only composition and its wording are gone.
    expect(markup).not.toContain('Pour 25 mL')
  }
})

test('product form specimens render the real fields for a new, a barcode-matched and a saved product', () => {
  const blank = screen('product-new')
  expect(blank).toContain(productText.addProduct)
  expect(blank).toContain(machineStepText.previewOnly)
  expect(blank).not.toContain('aria-pressed="true"')

  const barcode = screen('product-barcode')
  expect(barcode).toContain('value="Tide Free & Clear liquid laundry detergent"')
  expect(barcode).toContain('aria-pressed="true"')

  const sheets = screen('product-sheets')
  expect(sheets).toContain('value="Free & clear dryer sheets"')
  expect(sheets).toContain(productText.forms.sheets)
  expect(sheets).toContain('aria-pressed="true"')
})

test('the garment-safety specimens reach the states the reference captures', () => {
  const expected: Record<string, string[]> = {
    'closet-add-stain-set-in': ['Is it new, or old and set in?', 'saved as a known mark'],
    'closet-add-details': ['Item details'],
    'closet-stain-check': ['Stain gone?'],
    'closet-stain-next': ['What next?', 'Take it to a cleaner'],
    'drying-stain': ['Stain gone?', 'air dry until you check it'],
    'household-water': ['EBMUD, Oakland'],
    'household-water-sheet': ['Edit water details', 'EBMUD, Oakland', '94610'],
    'household-people-removed': ['Sam', 'Access removed · private clothes stay protected'],
    'laundry-completed': ['White cotton tee ×2', 'Low heat, 40 min'],
  }
  for (const [name, texts] of Object.entries(expected)) {
    const markup = screen(name)
    for (const text of texts) expect(markup, name).toContain(text)
  }
  // The cap is drawn only when the product's marks are recorded.
  expect(screen('laundry-preparation-cap').match(/<svg/g)?.length).toBeGreaterThan(screen('laundry-preparation').match(/<svg/g)?.length ?? 0)
})

test('the laundry-day specimens reach the states the reference captures', () => {
  // States a first render reaches; the tapped steps, the phone-stored day plan and Home (router links) are checked in the browser.
  const expected: Record<string, string[]> = {
    'laundry-next-joined': ['Move them to the dryer, then start load 2', 'it may wait about 10 min for the dryer'],
    'laundry-next-held': ['Start load 2', 'Dryer says', 'remind you at about'],
    // No minutes recorded for any machine: no card asks for a blunt number, and no clock is shown.
    'laundry-times': ['We’ll show times after the first wash and dry.'],
    'laundry-day-plan': ['4 loads', 'All today', 'Up next'],
    'laundry-early-check': ['Dryer 7 · early check', 'until you take out the Blue tee. Dryer 7 keeps going for the rest.'],
    'laundry-early-check-due': ['Take out the Blue tee now'],
    'laundry-shared-ask': ['What’s free right now?', 'Washers free', 'Dryers free'],
    'drying-wait': ['Hang them, or wait for the dryer.', 'Wait for the dryer'],
    'drying-wait-smell': ['It sat wet a long time', 'Rack full · wait for the dryer.'],
    'drying-check-marks': ['Check in 12 min', 'Check now: Navy everyday tee'],
    'drying-take-out-early': ['Take out early', 'Take out now', 'Done, dryer keeps going'],
    'drying-check-missed': ['The early check was missed.'],
    'drying-home': ['dryer runs instead of 3', 'Hang the tees'],
    'laundry-completed-early': ['Tumbled 25 min in Dryer 3, then hung'],
    'household-laundry-day': ['Room to hang clothes', 'Loads a day when spread out'],
  }
  for (const [name, texts] of Object.entries(expected)) {
    const markup = screen(name)
    for (const text of texts) expect(markup, name).toContain(text)
  }
  // Only the smell sample sat wet long; the others came out of the washer minutes ago.
  expect(screen('drying-home')).not.toContain('It sat wet a long time')
})

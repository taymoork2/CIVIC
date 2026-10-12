import { readFileSync, realpathSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

export function applicationRoot(repo, configured = process.env.REHEARSAL_APP_ROOT) {
  if (!configured) {
    try {
      configured = JSON.parse(readFileSync(join(repo, '.review-data/application.json'), 'utf8')).root
      if (typeof configured !== 'string' || !configured.trim()) throw Error('Invalid Rehearsal application root')
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  const root = realpathSync(configured ? resolve(configured) : repo)
  for (const path of ['apps/web/src', 'apps/web/public', 'packages/planner/src', 'convex']) {
    if (!statSync(join(root, path)).isDirectory()) throw Error(`Invalid Laundry App checkout: ${root}`)
  }
  return root
}

// shortcut: Laundry's existing presenters need review hooks; replace this bounded
// in-memory overlay with an exported adapter contract when Laundry adopts one.
export function reviewOverlay(path, code) {
  const replace = (before, after) => {
    if (code.split(before).length !== 2) throw Error(`Rehearsal adapter drift in ${path}: ${before.slice(0, 80)}. Update the adapter; app files were not changed.`)
    code = code.replace(before, after)
  }
  if (path === 'apps/web/src/routes/index.tsx' && code.includes("import('@/home/home-page')") && !code.includes('export { HomeOverview }')) {
    code += "\nexport { HomeOverview } from '@/home/home-page'\n"
  }
  if (path === 'apps/web/src/dev/closet-preview.tsx' && !code.includes('as reviewTextiles')) {
    code += '\nexport { textiles as reviewTextiles, record as reviewGarmentRecord }\n'
  }
  if (path === 'apps/web/src/dev/household-preview.tsx' && !code.includes('as reviewMachines')) {
    code += '\nexport { machines as reviewMachines, supplies as reviewSupplies, wearers as reviewWearers, water as reviewWater }\n'
  }
  if (path === 'apps/web/src/dev/fixture-preview.tsx' && !code.includes("'click' in step")) {
    replace("| { readonly open: string }", "| { readonly click: string } | { readonly open: string }")
    replace("'open' in step ? step.open : step.type", "'click' in step ? step.click : 'open' in step ? step.open : step.type")
    replace("if ('tap' in step) target.click()", "if ('tap' in step || 'click' in step) target.click()")
  }
  if (path === 'apps/web/src/routes/design-preview.tsx' && !code.includes('export function DesignPreviewScreen')) {
    replace('  const navigate = useNavigate()\n', `  const navigate = useNavigate()
  return <DesignPreviewScreen screen={screen} state={state} onBack={() => void navigate({ to: '/design-preview', search: { screen: 'laundry-index', state: undefined, textScale } })} />
}
export function DesignPreviewScreen({ screen, state, onBack }: { screen: string; state?: 'invalid' | 'error' | 'busy'; onBack: () => void }) {
`)
    replace("onBack={() => void navigate({ to: '/design-preview', search: { screen: 'laundry-index', state: undefined, textScale } })} /></PreviewUnits>", 'onBack={onBack} /></PreviewUnits>')
  }
  if (path === 'apps/web/src/closet/add-clothes.tsx' && !code.includes('onReviewState')) {
    replace('import { useEffect,', 'import { useLayoutEffect, useEffect,')
    replace('type AddStep =', 'export type AddStep =')
    replace('export function AddClothesSheet({', `export type IntakeReviewState = { screen: string; draft: AddDraft; dirty: boolean; pending: boolean; error: string | null }
export type IntakePresentation = Record<string, { title?: string; action?: string; color?: string }>
export function AddClothesSheet({ initialCareStep, presentation, onReviewState, onReviewTransition,`)
    replace('  initialStep?: AddStep\n', `  initialStep?: AddStep
  initialCareStep?: CareQuestion
  presentation?: IntakePresentation
  onReviewState?: (state: IntakeReviewState) => void
  onReviewTransition?: (from: string, to: string) => void
`)
    replace('() => firstCareStep(start.tag)', '() => initialCareStep ?? firstCareStep(start.tag)')
    replace('  const go = (to: AddStep) => { setError(null); setStep(to) }', `  const screen = landed !== null ? 'saved' : step === 'care' ? \`care:\${careStep}\` : step
  useLayoutEffect(() => { onReviewState?.({ screen, draft, dirty, pending, error }) }, [screen, draft, dirty, pending, error, onReviewState])
  const go = (to: AddStep, question = careStep) => { onReviewTransition?.(screen, to === 'care' ? \`care:\${question}\` : to); setError(null); setStep(to) }`)
    replace('else setCareStep(next)', 'else { onReviewTransition?.(screen, `care:${next}`); setCareStep(next) }')
    replace('      setLanded(landedWords(draft, target))', "      onReviewTransition?.(screen, 'saved')\n      setLanded(landedWords(draft, target))")
    replace('if (care && previousCare !== undefined) { setError(null); setCareStep(previousCare) }', 'if (care && previousCare !== undefined) { onReviewTransition?.(screen, `care:${previousCare}`); setError(null); setCareStep(previousCare) }')
    replace('setCareStep(question); go(\'care\')', 'setCareStep(question); go(\'care\', question)')
    replace('  const title = care ?', '  const override = presentation?.[screen]\n  const title = override?.title ?? (care ?')
    replace('addGarmentText.steps[step].title\n', 'addGarmentText.steps[step].title)\n')
    replace("  const next = correctingReview ?", "  const primaryStyle = override?.color ? { backgroundColor: override.color, color: '#fff' } : undefined\n  const next = override?.action ?? (correctingReview ?")
    replace('addGarmentText.steps[followingStep].to\n', 'addGarmentText.steps[followingStep].to)\n')
    const submit = '<Button type="submit" form={id} size="lg"'
    if (code.split(submit).length !== 3) throw Error(`Rehearsal action adapter drift in ${path}`)
    code = code.replaceAll(submit, submit + ' style={primaryStyle}')
    replace('savingTarget === null ? addGarmentText.save', 'savingTarget === null ? override?.action ?? addGarmentText.save')
    replace('<Sheet title={firstSave ? addGarmentText.firstSavedTitle(saved.textileIds.length) : addGarmentText.savedTitle}', '<Sheet title={presentation?.saved?.title ?? (firstSave ? addGarmentText.firstSavedTitle(saved.textileIds.length) : addGarmentText.savedTitle)}')
    replace('<Button type="button" size="lg" onClick={finish}>{addGarmentText.done}</Button>', '<Button type="button" size="lg" onClick={finish} style={presentation?.saved?.color ? { backgroundColor: presentation.saved.color, color: \'#fff\' } : undefined}>{presentation?.saved?.action ?? addGarmentText.done}</Button>')
  }
  return code
}

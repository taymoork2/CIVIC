const textTypes = new Set(['text', 'number', 'search', 'email', 'tel', 'url', 'password'])

export function sheetInputs(root: HTMLElement): HTMLInputElement[] {
  return [...root.querySelectorAll<HTMLInputElement>('input')].filter((input) => textTypes.has(input.type) && !input.matches(':disabled') && !input.readOnly && input.getClientRects().length > 0)
}

export function inputKeyHint(input: HTMLInputElement, root: HTMLElement): 'next' | 'done' {
  const inputs = sheetInputs(root)
  return inputs.indexOf(input) < inputs.length - 1 ? 'next' : 'done'
}

/** Enter moves within visible inputs, then dismisses the keyboard. Saving remains explicit. */
export function nextSheetInput(input: HTMLInputElement, root: HTMLElement): void {
  const inputs = sheetInputs(root)
  const next = inputs[inputs.indexOf(input) + 1]
  if (next === undefined) input.blur()
  else { next.focus({ preventScroll: true }); next.scrollIntoView({ block: 'nearest' }) }
}

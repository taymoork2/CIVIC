/** Focus only within the active editor, including its labeled choice groups. */
export function focusLabeledControl(root: HTMLElement | null, label: string, occurrence = 0): void {
  if (root === null) return
  const field = [...root.querySelectorAll<HTMLLabelElement>('label[for]')].filter((node) => node.textContent?.trim() === label)[occurrence]
  const control = field === undefined
    ? [...root.querySelectorAll<HTMLElement>('[role="group"], [role="radiogroup"]')].filter((node) => (node.getAttribute('aria-label') ?? document.getElementById(node.getAttribute('aria-labelledby') ?? '')?.textContent)?.trim() === label)[occurrence]?.querySelector<HTMLElement>('button, input')
    : [...root.querySelectorAll<HTMLElement>('input, select, textarea, button')].find((node) => node.id === field.htmlFor)
  control?.focus({ preventScroll: true })
  control?.scrollIntoView({ block: 'center' })
}

export function revealNavigation(aside: HTMLElement | null) {
  const button = aside?.querySelector<HTMLElement>('[aria-current="page"], [aria-current="step"]') ?? aside?.querySelector<HTMLElement>('[aria-current]')
  if (!button || !aside) return
  for (const container of [button.closest('ol')!, aside]) {
    const target = button.getBoundingClientRect(), bounds = container.getBoundingClientRect()
    const left = target.left < bounds.left ? target.left - bounds.left : target.right > bounds.right ? target.right - bounds.right : 0
    const top = target.top < bounds.top ? target.top - bounds.top : target.bottom > bounds.bottom ? target.bottom - bounds.bottom : 0
    container.scrollBy({ left, top, behavior: 'instant' })
  }
}

import './screens.css'

// Product presenters know nothing about Rehearsal and can use the same actions in an app.
export function renderScreen(container, model, actions) {
  const heading = document.createElement('h1')
  heading.textContent = { 'demo.home': 'Notebook', 'demo.edit': 'Write a note', 'demo.review': 'Review your draft', 'demo.saved': 'Note saved' }[model.screen]
  const shell = document.createElement('section'); shell.className = 'notebook-screen'; shell.append(heading)
  const button = (label, fn) => { const element = document.createElement('button'); element.textContent = label; element.addEventListener('click', fn); shell.append(element) }
  if (model.screen === 'demo.home') button('New note', actions.begin)
  else if (model.screen === 'demo.edit') {
    const label = document.createElement('label'); label.textContent = 'Title'
    const input = document.createElement('input'); input.value = model.title; input.maxLength = 120; input.setAttribute('aria-label', 'Title')
    input.addEventListener('input', () => actions.change(input.value)); label.append(input); shell.append(label)
    button('Save', actions.save); button('Review first', actions.review); button('Cancel', actions.cancel)
  } else {
    const title = document.createElement('p'); title.textContent = model.title; shell.append(title)
    button(model.screen === 'demo.review' ? 'Back to draft' : 'Back home', model.screen === 'demo.review' ? actions.back : actions.cancel)
  }
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = model.error || ''; shell.append(status)
  container.replaceChildren(shell)
}

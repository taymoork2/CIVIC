import './app.css'

// The app itself: plain DOM over its own /api/tasks endpoints. It knows nothing about CIVIC.
export function startApp(container, { screen = 'tasks.list', navigated = () => {} } = {}) {
  const state = { screen, tasks: [], title: '', error: '', busy: false }
  const go = (next, action) => { const from = state.screen; state.screen = next; state.error = ''; render(); navigated(from, next, action) }
  const load = async () => {
    const response = await fetch('/api/tasks')
    const body = await response.json()
    if (response.ok) state.tasks = body; else state.error = body.error
    render()
  }
  const save = async () => {
    state.busy = true; render()
    const response = await fetch('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: state.title }) })
    const body = await response.json()
    state.busy = false
    if (!response.ok) { state.error = body.error; render(); return }
    state.tasks.push(body); state.title = ''
    go('tasks.list', 'Save')
  }
  const toggle = async (task, done) => {
    const response = await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ done }) })
    const body = await response.json()
    if (response.ok) Object.assign(task, body); else state.error = body.error
    render()
  }
  function render() {
    const shell = document.createElement('section'); shell.className = 'tasks-screen'
    const heading = document.createElement('h1'); heading.textContent = state.screen === 'tasks.add' ? 'New task' : 'Tasks'; shell.append(heading)
    const button = (label, fn) => { const element = document.createElement('button'); element.textContent = label; element.disabled = state.busy; element.addEventListener('click', fn); shell.append(element); return element }
    if (state.screen === 'tasks.list') {
      const list = document.createElement('ul')
      if (!state.tasks.length) { const empty = document.createElement('p'); empty.textContent = 'Nothing planned yet.'; shell.append(empty) }
      for (const task of state.tasks) {
        const item = document.createElement('li'), label = document.createElement('label'), box = document.createElement('input')
        box.type = 'checkbox'; box.checked = task.done; box.addEventListener('change', () => toggle(task, box.checked))
        label.append(box, ` ${task.title}`); item.append(label); list.append(item)
      }
      shell.append(list)
      button('Add task', () => go('tasks.add', 'Add task'))
    } else {
      const label = document.createElement('label'); label.textContent = 'Title'
      const input = document.createElement('input'); input.value = state.title; input.maxLength = 120; input.setAttribute('aria-label', 'Title')
      input.addEventListener('input', () => { state.title = input.value })
      label.append(input); shell.append(label)
      button('Save', save); button('Cancel', () => { state.title = ''; go('tasks.list', 'Cancel') })
    }
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = state.error; shell.append(status)
    container.replaceChildren(shell)
  }
  render()
  return { get screen() { return state.screen }, get dirty() { return state.screen === 'tasks.add' && Boolean(state.title) }, get pending() { return state.busy }, load, restart: async () => { Object.assign(state, { screen, tasks: [], title: '', error: '', busy: false }); render(); await load() } }
}

import './app.css'

// The app itself: plain DOM over its backend's named functions, through a client like a function backend's own
// (`client.query('items:list')`). It knows nothing about CIVIC.
export function startApp(container, client, { screen = 'pantry.shelf', navigated = () => {} } = {}) {
  const state = { screen, items: [], shopping: [], name: '', quantity: '1', error: '', busy: false }
  const go = async (next, action) => { const from = state.screen; state.screen = next; state.error = ''; render(); navigated(from, next, action); await load() }
  async function load() {
    try {
      if (state.screen === 'pantry.shelf') state.items = await client.query('items:list')
      if (state.screen === 'pantry.shopping') state.shopping = await client.query('items:shopping')
    } catch (error) { state.error = error.message }
    render()
  }
  const write = async (name, args, after) => {
    state.busy = true; state.error = ''; render()
    try { await client.mutation(name, args); state.busy = false; await after() }
    catch (error) { state.busy = false; state.error = error.message; render() }
  }
  function render() {
    const shell = document.createElement('section'); shell.className = 'pantry-screen'
    const heading = document.createElement('h1'); heading.textContent = { 'pantry.shelf': 'Pantry', 'pantry.add': 'Add an item', 'pantry.shopping': 'Shopping list' }[state.screen]; shell.append(heading)
    const button = (label, fn, parent = shell) => { const element = document.createElement('button'); element.textContent = label; element.disabled = state.busy; element.addEventListener('click', fn); parent.append(element); return element }
    const field = (text, key, type = 'text') => {
      const label = document.createElement('label'); label.textContent = text
      const input = document.createElement('input'); input.type = type; input.value = state[key]; input.setAttribute('aria-label', text)
      input.addEventListener('input', () => { state[key] = input.value })
      label.append(input); shell.append(label)
    }
    if (state.screen === 'pantry.shelf') {
      const list = document.createElement('ul')
      if (!state.items.length) { const empty = document.createElement('p'); empty.textContent = 'The shelf is empty.'; shell.append(empty) }
      for (const item of state.items) {
        const row = document.createElement('li'), name = document.createElement('span')
        name.textContent = `${item.name} × ${item.quantity}`; row.append(name)
        button(`Use ${item.name}`, () => write('items:use', { id: item.id }, load), row)
        list.append(row)
      }
      shell.append(list)
      button('Add item', () => go('pantry.add', 'Add item'))
      button('Shopping list', () => go('pantry.shopping', 'Shopping list'))
    } else if (state.screen === 'pantry.add') {
      field('Item', 'name'); field('Quantity', 'quantity', 'number')
      button('Save', () => write('items:add', { name: state.name, quantity: Number(state.quantity) }, () => { state.name = ''; state.quantity = '1'; return go('pantry.shelf', 'Save') }))
      button('Cancel', () => { state.name = ''; return go('pantry.shelf', 'Cancel') })
    } else {
      const list = document.createElement('ul')
      if (!state.shopping.length) { const empty = document.createElement('p'); empty.textContent = 'Nothing to buy.'; shell.append(empty) }
      for (const item of state.shopping) { const row = document.createElement('li'); row.textContent = item.name; list.append(row) }
      shell.append(list)
      button('Back to shelf', () => go('pantry.shelf', 'Back to shelf'))
    }
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = state.error; shell.append(status)
    container.replaceChildren(shell)
  }
  render()
  return {
    get screen() { return state.screen }, get dirty() { return state.screen === 'pantry.add' && Boolean(state.name) }, get pending() { return state.busy }, load,
    restart: async () => { Object.assign(state, { screen, items: [], shopping: [], name: '', quantity: '1', error: '', busy: false }); await load() },
  }
}

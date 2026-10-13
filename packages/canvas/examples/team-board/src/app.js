import './app.css'

// The app itself: plain DOM over its own /api/ endpoints, signed in with a session cookie. It knows nothing about CIVIC.
export function startApp(container, { screen = 'board.home', navigated = () => {} } = {}) {
  const initial = () => ({ screen, user: null, posts: [], email: '', password: '', message: '', error: '', busy: false })
  const state = initial()
  const go = (next, action) => { const from = state.screen; state.screen = next; state.error = ''; render(); navigated(from, next, action) }
  const read = async (path) => { const response = await fetch(path); return { ok: response.ok, body: await response.json() } }
  // Opening the app: whoever the session belongs to sees the board; anyone else lands on sign in.
  const load = async () => {
    if (!navigator.onLine) { state.error = 'You\'re offline.'; render(); return }
    const me = await read('/api/me')
    state.user = me.ok ? me.body : null
    if (state.user) state.posts = (await read('/api/posts')).body
    state.screen = state.user ? 'board.home' : 'board.sign-in'
    state.error = ''
    render()
  }
  const signIn = async () => {
    state.busy = true; render()
    const response = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: state.email, password: state.password }) })
    const body = await response.json()
    state.busy = false
    if (!response.ok) { state.error = body.error; render(); return }
    state.user = body; state.password = ''
    state.posts = (await read('/api/posts')).body
    go('board.home', 'Sign in')
  }
  const post = async () => {
    state.busy = true; render()
    let response
    try { response = await fetch('/api/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: state.message }) }) }
    catch { state.busy = false; state.error = 'You\'re offline. Your post wasn\'t sent; post it again when you\'re back online.'; render(); return }
    const body = await response.json()
    state.busy = false
    if (!response.ok) { state.error = body.error; render(); return }
    state.posts.push(body); state.message = ''; state.error = ''
    render()
  }
  const signOut = async () => {
    await fetch('/api/session', { method: 'DELETE' })
    Object.assign(state, { user: null, posts: [], email: '', password: '', message: '' })
    go('board.sign-in', 'Sign out')
  }
  function render() {
    const shell = document.createElement('section'); shell.className = 'board-screen'
    const heading = document.createElement('h1'); shell.append(heading)
    const button = (label, fn) => { const element = document.createElement('button'); element.textContent = label; element.disabled = state.busy; element.addEventListener('click', fn); shell.append(element); return element }
    const field = (text, key, attributes = {}) => {
      const label = document.createElement('label'); label.textContent = text
      const input = document.createElement('input'); input.value = state[key]; input.setAttribute('aria-label', text)
      for (const [name, value] of Object.entries(attributes)) input.setAttribute(name, value)
      input.addEventListener('input', () => { state[key] = input.value })
      label.append(input); shell.append(label)
    }
    if (state.screen === 'board.sign-in') {
      heading.textContent = 'Sign in'
      field('Email', 'email', { type: 'email', autocomplete: 'username' })
      field('Password', 'password', { type: 'password', autocomplete: 'current-password' })
      button('Sign in', signIn)
    } else {
      heading.textContent = 'Team board'
      const who = document.createElement('p'); who.className = 'board-who'; who.textContent = `Signed in as ${state.user?.name ?? 'nobody'}`; shell.append(who)
      const list = document.createElement('ul')
      if (!state.posts.length) { const empty = document.createElement('p'); empty.textContent = 'No posts yet.'; shell.append(empty) }
      for (const row of state.posts) { const item = document.createElement('li'); item.textContent = `${row.author}: ${row.text}`; list.append(item) }
      shell.append(list)
      field('Message', 'message', { maxlength: '280' })
      button('Post', post)
      button('Sign out', signOut)
    }
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = state.error; shell.append(status)
    container.replaceChildren(shell)
  }
  render()
  return {
    get screen() { return state.screen },
    get dirty() { return Boolean(state.message || state.email) },
    get pending() { return state.busy },
    load,
    restart: async () => { Object.assign(state, initial()); render(); await load() },
  }
}

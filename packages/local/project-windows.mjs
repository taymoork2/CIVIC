// A connection has one host, even when several windows view its evidence.
export function projectWindows({ current, origin, createHost, limit = 8 }) {
  const hosts = new Map([[current, Promise.resolve({ url: `${origin}/review` })]])
  const origins = new Set([origin])
  return {
    origins: () => [...origins],
    async open(project) {
      if (!hosts.has(project.key)) {
        if (hosts.size >= limit) throw Object.assign(Error('The local project window limit has been reached. Restart CIVIC to release unused hosts.'), { status: 409 })
        const pending = Promise.resolve().then(() => createHost(project)).then(host => { origins.add(new URL(host.url).origin); return host }).catch(error => { hosts.delete(project.key); throw error })
        hosts.set(project.key, pending)
      }
      return (await hosts.get(project.key)).url
    },
    async refresh(project) {
      const previous = await hosts.get(project.key)
      if (!previous?.close) throw Error('Only an owned project host can be refreshed')
      const pending = previous.close().then(() => createHost(project, Number(new URL(previous.url).port))).catch(error => { hosts.delete(project.key); throw error })
      hosts.set(project.key, pending)
      await pending
    },
    async close() {
      const running = await Promise.allSettled(hosts.values())
      await Promise.all(running.filter(result => result.status === 'fulfilled').map(result => result.value.close?.()))
      hosts.clear(); origins.clear()
    },
  }
}

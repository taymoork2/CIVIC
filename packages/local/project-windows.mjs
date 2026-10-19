// A connection has one host, even when several windows view its evidence.
export function projectWindows({ current, origin, createHost, limit = 8 }) {
  const hosts = new Map([[current, Promise.resolve({ url: `${origin}/review` })]])
  const origins = new Set([origin])
  const owners = new Map([[current, { pinned: true, leases: new Set() }]])
  return {
    origins: () => [...origins],
    async open(project, lease) {
      if (lease !== undefined && !/^[a-f0-9-]{36}$/.test(lease)) throw Error('Invalid project host lease')
      if (!hosts.has(project.key)) {
        if (hosts.size >= limit) throw Object.assign(Error('The local project window limit has been reached. Restart CIVIC to release unused hosts.'), { status: 409 })
        const pending = Promise.resolve().then(() => createHost(project)).then(host => { origins.add(new URL(host.url).origin); return host }).catch(error => { hosts.delete(project.key); throw error })
        hosts.set(project.key, pending)
      }
      const owner = owners.get(project.key) ?? { pinned: false, leases: new Set() }
      if (lease) owner.leases.add(lease)
      else owner.pinned = true
      owners.set(project.key, owner)
      const host = await hosts.get(project.key)
      return host.url
    },
    async release(key, lease) {
      const owner = owners.get(key), pending = hosts.get(key)
      if (!owner?.leases.delete(lease) || owner.pinned || owner.leases.size || !pending) return { closed: false }
      const host = await pending
      if (hosts.get(key) !== pending || owner.leases.size || owner.pinned || !host.close) return { closed: false }
      hosts.delete(key); owners.delete(key); origins.delete(new URL(host.url).origin)
      await host.close()
      return { closed: true, url: host.url }
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
      hosts.clear(); origins.clear(); owners.clear()
    },
  }
}

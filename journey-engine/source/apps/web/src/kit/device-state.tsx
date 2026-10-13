import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/kit/sheet'

/** Account and household together; synthetic previews do not write device state. */
export const DeviceScope = createContext<string | null>(null)
/** Durable copies and taps belong to their account, including after session renewal. */
export const PrivateAccount = createContext<string | null>(null)
export const usePrivateAccount = () => useContext(PrivateAccount)
const prefix = 'washcloset:private:convenience:'
const lifetime = 24 * 60 * 60 * 1000
const changed = 'washcloset:device-state'

export function readDeviceState<T>(scope: string, name: string, valid: (value: unknown) => value is T): T | null {
  const key = prefix + JSON.stringify([scope, name])
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return null
    const saved: unknown = JSON.parse(raw)
    if (raw.length <= 40_000 && typeof saved === 'object' && saved !== null && 'version' in saved && saved.version === 1 && 'at' in saved && typeof saved.at === 'number' && saved.at <= Date.now() && Date.now() - saved.at < lifetime && 'value' in saved && valid(saved.value)) return saved.value
    window.localStorage.removeItem(key)
  } catch { try { window.localStorage.removeItem(key) } catch { /* Storage may be unavailable. */ } }
  return null
}

export function writeDeviceState(scope: string, name: string, value: unknown, intake?: { key: string; attempted: boolean }): boolean {
  try {
    const key = prefix + JSON.stringify([scope, name])
    if (value === null) window.localStorage.removeItem(key)
    else {
      const raw = JSON.stringify({ version: 1, at: Date.now(), value, ...(intake === undefined ? {} : { intake }) })
      if (raw.length > 40_000) return false
      window.localStorage.setItem(key, raw)
    }
    window.dispatchEvent?.(new Event(changed))
    return true
  } catch { return false }
}

export function readIntakeIdentity(scope: string, name: string): { key: string; attempted: boolean } | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(prefix + JSON.stringify([scope, name])) ?? 'null')
    const intake = saved?.intake
    return typeof intake?.key === 'string' && /^[A-Za-z0-9_-]{12,64}$/.test(intake.key) && typeof intake.attempted === 'boolean' ? { key: intake.key, attempted: intake.attempted } : null
  } catch { return null }
}

function subscribe(listener: () => void) {
  window.addEventListener('storage', listener)
  window.addEventListener(changed, listener)
  return () => { window.removeEventListener('storage', listener); window.removeEventListener(changed, listener) }
}

/** A shortcut must not create a different record while there is unfinished intake. */
export function useIntakeDraft<T>(name: string, valid: (value: unknown) => value is T, previousNames: readonly string[] = []) {
  const scope = useContext(DeviceScope)
  return useSyncExternalStore(subscribe, () => scope !== null && [name, ...previousNames].some((entry) => readDeviceState(scope, entry, valid) !== null), () => false)
}

/** Private list context survives route departure, never enters a shared URL. */
export function useDeviceState<T>(name: string, initial: T, valid: (value: unknown) => value is T, resume = true): [T, Dispatch<SetStateAction<T>>] {
  const scope = useContext(DeviceScope)
  const [state, setState] = useState(initial)
  const [loaded, setLoaded] = useState<string | null>(null)
  const key = scope === null ? null : JSON.stringify([scope, name])
  useEffect(() => {
    setState(scope === null || !resume ? initial : readDeviceState(scope, name, valid) ?? initial)
    setLoaded(key)
    // The initial value and validator describe this mounted view, not changes to its draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, name, resume])
  useEffect(() => { if (scope !== null && loaded === key) writeDeviceState(scope, name, state) }, [scope, loaded, key, name, state])
  return [state, setState]
}

export function DraftRecovery({ title, photo = false, attempted = false, onContinue, onDiscard, onClose }: { title: string; photo?: boolean; attempted?: boolean; onContinue: () => void; onDiscard: () => void; onClose: () => void }) {
  const [forgetting, setForgetting] = useState(false)
  if (forgetting) return <ForgetIntake onKeep={() => setForgetting(false)} onForget={onDiscard} onClose={onClose} />
  return <Sheet title={`Continue ${title}?`} closeAtTop closeIconLabel="Close, keep draft for later" onClose={onClose} footer={<><Button type="button" variant="outline" onClick={() => attempted ? setForgetting(true) : onDiscard()}>Discard draft</Button><Button type="button" onClick={onContinue}>Continue</Button></>}>
    <p className="m-0 text-ink-2">{attempted ? 'Your last save may have finished. Continue and save the same answers again to recover the result without adding duplicates.' : 'Your unfinished answers are kept on this device for up to a day. Continuing won’t add anything until you save.'}</p>
    <p className="m-0 text-ink-2">{attempted ? photo ? 'Check your inventory before discarding this draft or changing its answers. Choose any label photo again.' : 'Check your inventory before discarding this draft or changing its answers.' : photo ? 'Review the answers before saving. Choose any label photo again.' : 'Review the answers before saving.'}</p>
  </Sheet>
}

export function ForgetIntake({ onKeep, onForget, onClose }: { onKeep: () => void; onForget: () => void; onClose: () => void }) {
  return <Sheet title="Forget this draft?" closeAtTop closeIconLabel="Close, keep draft for later" onClose={onClose} footer={<><Button type="button" onClick={onKeep}>Keep draft</Button><Button type="button" variant="outline" onClick={onForget}>Forget draft</Button></>}>
    <p className="m-0 text-ink-2">An item may already be in your inventory. Forgetting only removes this draft and its safe retry; it won’t undo a completed save. Check your inventory before adding again.</p>
  </Sheet>
}

export function DraftChanged({ removed, onClose }: { removed: boolean; onClose: () => void }) {
  return <Sheet title="Draft changed in another tab" onClose={onClose} closeAtTop footer={<Button type="button" onClick={onClose}>Close</Button>}>
    <p role="alert" className="m-0 text-ink-2">{removed ? 'This draft was saved or discarded in another tab. Close this form and check your inventory before adding again.' : 'Another tab has newer answers for this draft. Close this form and continue the latest draft.'}</p>
  </Sheet>
}

/** Only new intake is recovered. Existing record editors keep their current explicit Save guards. */
export function useIntakeRecovery<T>({ name, title, photo = false, previousNames = [], value, valid, active, dirty, restore, close }: {
  name: string; value: T; valid: (value: unknown) => value is T; active: boolean; dirty: boolean;
  title: string; photo?: boolean; previousNames?: readonly string[];
  restore: (value: T) => void; close: () => void;
}) {
  const scope = useContext(DeviceScope)
  const [saved, setSaved] = useState<T | null>(null)
  const [loaded, setLoaded] = useState<string | null>(null)
  const [decided, setDecided] = useState(false)
  const [stored, setStored] = useState<boolean | null>(null)
  const [conflict, setConflict] = useState<'changed' | 'removed' | null>(null)
  const [attempted, setAttempted] = useState(false)
  const identity = useRef<{ key: string; attempted: boolean } | null>(null)
  const written = useRef<string | null>(null)
  const persisted = useRef(false)
  const saving = useRef(false)
  const cleared = useRef<string | null>(null)
  const legacy = useRef<string | null>(null)
  const serialized = JSON.stringify(value)
  const key = scope === null ? null : JSON.stringify([scope, name])
  useEffect(() => {
    let previous = scope === null || !active ? null : readDeviceState(scope, name, valid)
    legacy.current = null
    if (scope !== null && active && previous === null) for (const oldName of previousNames) {
      previous = readDeviceState(scope, oldName, valid)
      if (previous !== null) { legacy.current = oldName; break }
    }
    setSaved(previous)
    identity.current = scope === null || previous === null ? null : readIntakeIdentity(scope, legacy.current ?? name)
    written.current = previous === null ? null : JSON.stringify(previous)
    persisted.current = previous !== null
    setAttempted(identity.current?.attempted ?? false)
    setConflict(null)
    setDecided(false)
    setLoaded(key)
    // Recovery is offered once on opening, before any answer can overwrite it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, name])
  const persist = (): 'stored' | 'unavailable' | 'conflict' => {
    if (!valid(value)) return 'unavailable'
    const current = scope === null ? null : readDeviceState(scope, name, valid)
    const currentIdentity = scope === null || current === null ? null : readIntakeIdentity(scope, name)
    if (current === null && persisted.current && !saving.current && legacy.current === null) { setConflict('removed'); return 'conflict' }
    if (current !== null && written.current === null) {
      identity.current = currentIdentity
      written.current = JSON.stringify(current)
      setSaved(current); setDecided(false); setAttempted(currentIdentity?.attempted ?? false)
      return 'conflict'
    }
    if (currentIdentity !== null && identity.current?.key !== currentIdentity.key || current !== null && written.current !== null && JSON.stringify(current) !== written.current) {
      setConflict('changed')
      return 'conflict'
    }
    identity.current ??= { key: crypto.randomUUID(), attempted: false }
    written.current = serialized
    const stored = scope !== null && writeDeviceState(scope, name, value, identity.current)
    if (stored) persisted.current = true
    return stored ? 'stored' : 'unavailable'
  }
  useEffect(() => subscribe(() => {
    if (scope === null || !active || cleared.current === serialized || saving.current) return
    const current = readDeviceState(scope, name, valid)
    if (current === null) {
      if (written.current !== null) setConflict('removed')
    } else if (written.current !== null && JSON.stringify(current) !== written.current || identity.current !== null && readIntakeIdentity(scope, name)?.key !== identity.current.key) setConflict('changed')
  }), [scope, name, active, serialized, valid])
  useEffect(() => {
    if (scope === null || loaded !== key || !active || saved !== null && !decided || cleared.current === serialized || conflict !== null) return
    // Clear a reverted draft too. A successful create stays cleared while a photo upload is pending.
    setStored(dirty ? persist() === 'stored' : null)
    if (!dirty && written.current !== null) clear()
    // The serialized value covers the draft; storage events do not change an answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, loaded, key, active, dirty, saved, decided, name, serialized, conflict])
  const clear = () => {
    cleared.current = serialized
    if (scope !== null) {
      const current = readDeviceState(scope, name, valid)
      if (written.current !== null && JSON.stringify(current) === written.current && (identity.current === null || readIntakeIdentity(scope, name)?.key === identity.current.key)) writeDeviceState(scope, name, null)
      if (legacy.current !== null) writeDeviceState(scope, legacy.current, null)
    }
    setSaved(null)
    setDecided(true)
    setStored(null)
    identity.current = null
    written.current = null
    persisted.current = false
    saving.current = false
    setAttempted(false)
  }
  const prompt = !active ? null : conflict !== null ? <DraftChanged removed={conflict === 'removed'} onClose={close} /> : saved === null || decided ? null : <DraftRecovery title={title} photo={photo} attempted={attempted} onClose={close} onDiscard={clear} onContinue={() => { restore(saved); setDecided(true) }} />
  const notice = !active || !dirty || stored === null ? null : <DraftNotice stored={stored} />
  const keep = () => {
    if (scope !== null && persist() === 'stored') { close(); return true }
    setStored(false)
    return false
  }
  const saveKey = (attempt = true): string | null => {
    if (conflict !== null || saved !== null && !decided || persist() === 'conflict' || identity.current === null) return null
    // Blocked storage still permits retries with this open form's in-memory identity.
    if (attempt) { identity.current.attempted = true; setAttempted(true); saving.current = true }
    if (scope !== null) writeDeviceState(scope, name, value, identity.current)
    return identity.current.key
  }
  return { prompt, notice, canKeep: stored === true && active && dirty, keep, clear, saveKey, attempted }
}

export function DraftNotice({ stored }: { stored: boolean }) {
  return <p role={stored ? 'status' : 'alert'} className="m-0 text-[length:var(--step--1)] text-ink-2">{stored ? 'Draft saved on this device.' : 'This device couldn’t keep your draft. Keep this form open until you save; reloading may lose your answers.'}</p>
}

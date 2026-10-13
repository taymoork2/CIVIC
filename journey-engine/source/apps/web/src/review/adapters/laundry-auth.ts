import { useSyncExternalStore } from 'react'
let subject = 'rehearsal-uninitialized'
const listeners = new Set<() => void>()
export function setRuntimeIdentity(value: string) { subject = value; for (const listener of listeners) listener() }
const unavailable = async () => ({ data: null, error: { message: 'Account and authentication changes are outside this isolated run.' } })
export const authClient = {
  useSession: () => { const id = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => subject); return { data: { session: { id }, user: { id, name: 'Synthetic reviewer', email: 'reviewer@example.invalid' } }, isPending: false, error: null } },
  signIn: { email: unavailable }, signUp: { email: unavailable }, signOut: unavailable, deleteUser: unavailable,
  changePassword: unavailable, changeEmail: unavailable, requestPasswordReset: unavailable, resetPassword: unavailable,
}

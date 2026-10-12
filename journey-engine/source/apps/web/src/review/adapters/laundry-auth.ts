let subject = 'rehearsal-uninitialized'
export function setRuntimeIdentity(value: string) { subject = value }
const unavailable = async () => ({ data: null, error: { message: 'Account and authentication changes are outside this isolated run.' } })
export const authClient = {
  useSession: () => ({ data: { session: { id: subject }, user: { id: subject, name: 'Synthetic reviewer', email: 'reviewer@example.invalid' } }, isPending: false, error: null }),
  signIn: { email: unavailable }, signUp: { email: unavailable }, signOut: unavailable, deleteUser: unavailable,
  changePassword: unavailable, changeEmail: unavailable, requestPasswordReset: unavailable, resetPassword: unavailable,
}

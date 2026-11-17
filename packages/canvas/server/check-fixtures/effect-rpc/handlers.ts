import { Accounts } from '@example/contracts'

export const live = Accounts.toLayer({
  'account.list': () => [],
  'account.save': () => null,
  'account.unknown': () => null,
  [computed]: () => null,
})
export const handlers = Accounts.toHandlers({ 'account.remove': () => null })

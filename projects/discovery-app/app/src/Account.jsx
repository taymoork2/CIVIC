import { createContext, useContext } from 'react'

const AccountContext = createContext(null)
export function Account() {
  const account = useContext(AccountContext)
  if (!account) throw Error('A synthetic account provider is required')
  return <h1>{account.name}</h1>
}

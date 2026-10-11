import { Store } from '../../src/store.ts'

const [dir, index] = process.argv.slice(2) as [string, string]
new Store(dir).transact((document) => {
  document.records.push({ id: `actor:person.p${index}`, kind: 'actor', title: `P${index}`, type: 'person', handle: `p${index}` })
})

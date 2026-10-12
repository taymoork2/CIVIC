import { useState } from 'react'

export default function Counter({ initial = 0 }) {
  const [count, setCount] = useState(initial)
  return <section><h1>Local counter</h1><button onClick={() => setCount(count + 1)}>Count {count}</button></section>
}

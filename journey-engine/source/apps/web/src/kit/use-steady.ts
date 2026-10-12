import { useRef } from 'react'

/** The last defined value, so a query that is re-asking keeps the screen steady. */
export function useSteady<Value>(value: Value | undefined): Value | undefined {
  const last = useRef(value)
  if (value !== undefined) last.current = value
  return value ?? last.current
}

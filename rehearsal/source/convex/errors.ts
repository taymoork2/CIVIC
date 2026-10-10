import { ConvexError } from 'convex/values'

/**
 * Errors a person should read. Production Convex redacts plain `Error` messages, so anything
 * shown in the app is thrown as a `ConvexError` whose data the web reads back.
 */
export type UserErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid'
  | 'conflict'
  | 'stale'
  | 'disabled'

export type UserErrorData = { readonly code: UserErrorCode; readonly message: string }

export function fail(code: UserErrorCode, message: string): never {
  throw new ConvexError<UserErrorData>({ code, message })
}

export function nonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) fail('invalid', `${field} must not be empty`)
}

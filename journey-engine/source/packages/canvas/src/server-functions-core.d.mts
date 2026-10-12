export function encode(value: unknown): unknown
export function decode(value: unknown): unknown
export function validate(validators: unknown[], input: unknown): Promise<unknown>
export function createMiddleware(options?: { type?: string }): unknown
export type ServerFunctionSend = (key: string, method: 'GET' | 'POST', data: unknown, context: Record<string, unknown>) => Promise<unknown>
export function createServerFunctions(file: string, send?: ServerFunctionSend): { createServerFn: unknown; createMiddleware: typeof createMiddleware; useServerFn: <T>(fn: T) => T }
export function executeServerFunction(kind: string, key: string, args: { data?: unknown; context?: unknown }, context?: Record<string, unknown>): Promise<{ value: unknown }>

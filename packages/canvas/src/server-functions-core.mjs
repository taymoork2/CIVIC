// TanStack Start's server function API as CIVIC runs it: `createServerFn`, `createMiddleware` and `useServerFn`.
// The preview gets stubs that send each call to the run; the run's worker gets the real handlers.
// Both sides evaluate the same transformed module, so a function's key (`file:name`) is the same on each.

const registry = globalThis[Symbol.for('civic.serverFunctions')] ??= new Map()
const RESULT = Symbol.for('civic.serverFunctionResult')

/** JSON with tags for the values TanStack Start's serializer keeps and JSON loses. */
export function encode(value) {
  if (value === undefined) return { $civic: 'undefined' }
  if (typeof value === 'bigint') return { $civic: 'bigint', v: String(value) }
  if (typeof value === 'number' && !Number.isFinite(value)) return { $civic: 'number', v: String(value) }
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return { $civic: 'date', v: Number.isNaN(value.getTime()) ? null : value.toISOString() }
  if (value instanceof Map) return { $civic: 'map', v: [...value].map(([key, item]) => [encode(key), encode(item)]) }
  if (value instanceof Set) return { $civic: 'set', v: [...value].map(encode) }
  if (Array.isArray(value)) return value.map(encode)
  if (typeof value.toJSON === 'function') return encode(value.toJSON())
  const entries = Object.entries(value).map(([key, item]) => [key, encode(item)])
  return '$civic' in value ? { $civic: 'object', v: entries } : Object.fromEntries(entries)
}

export function decode(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(decode)
  if (!('$civic' in value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]))
  switch (value.$civic) {
    case 'undefined': return undefined
    case 'bigint': return BigInt(value.v)
    case 'number': return Number(value.v)
    case 'date': return new Date(value.v ?? NaN)
    case 'map': return new Map(value.v.map(([key, item]) => [decode(key), decode(item)]))
    case 'set': return new Set(value.v.map(decode))
    case 'object': return Object.fromEntries(value.v.map(([key, item]) => [key, decode(item)]))
    default: throw Error(`Unknown encoded value ${value.$civic}`)
  }
}

/** Runs validators in order: functions, schemas with `parse` (Zod, Valibot's wrappers), or Standard Schema. */
export async function validate(validators, input) {
  let data = input
  for (const validator of validators) {
    if (typeof validator === 'function') data = await validator(data)
    else if (typeof validator?.parse === 'function') data = await validator.parse(data)
    else if (validator?.['~standard']) {
      const result = await validator['~standard'].validate(data)
      if (result.issues) throw Error(result.issues.map((issue) => issue.message).join('; '))
      data = result.value
    } else throw Error('A validator must be a function, a schema with parse(), or a Standard Schema.')
  }
  return data
}

/** Middleware and its own middleware, depth first, each once. */
function flatten(list, seen = new Set()) {
  return list.flatMap((item) => {
    if (seen.has(item)) return []
    if (item?.kind !== 'civic-middleware') throw Error('Server function middleware must come from createMiddleware().')
    seen.add(item)
    return [...flatten(item.options.middleware, seen), item]
  })
}

/** `createMiddleware({ type: 'function' })`: client and server steps, validators and nested middleware. */
export function createMiddleware(type = {}) {
  const build = (options) => ({
    kind: 'civic-middleware', options,
    middleware: (list) => build({ ...options, middleware: [...options.middleware, ...list] }),
    validator: (validator) => build({ ...options, validators: [...options.validators, validator] }),
    inputValidator: (validator) => build({ ...options, validators: [...options.validators, validator] }),
    client: (client) => build({ ...options, client }),
    server: (server) => build({ ...options, server }),
  })
  if (type.type && type.type !== 'function') throw Error('Only function middleware runs in CIVIC; request middleware belongs to the server entry.')
  return build({ middleware: [], validators: [], client: undefined, server: undefined })
}

/** Client middleware runs in the preview; `sendContext` travels with the call to the run. */
async function runClient(definition, input, send) {
  const chain = flatten(definition.middleware)
  const step = async (index, context, sendContext) => {
    if (index === chain.length) return { [RESULT]: await send(input.data, sendContext), context }
    const client = chain[index].options.client
    if (!client) return step(index + 1, context, sendContext)
    return client({ data: input.data, context, method: definition.method, next: (options = {}) => step(index + 1, { ...context, ...options.context }, { ...sendContext, ...options.sendContext }) })
  }
  return unwrap(await step(0, {}, {}))
}

/** Server middleware, then the handler, each validating its own input first. */
async function runServer(definition, input, initial) {
  const chain = flatten(definition.middleware)
  const step = async (index, data, context) => {
    if (index === chain.length) {
      const valid = await validate(definition.validators, data)
      return { [RESULT]: await definition.handler({ data: valid, context, method: definition.method }), context }
    }
    const { validators, server } = chain[index].options
    const valid = await validate(validators, data)
    if (!server) return step(index + 1, valid, context)
    return server({ data: valid, context, method: definition.method, next: (options = {}) => step(index + 1, valid, { ...context, ...options.context }) })
  }
  return unwrap(await step(0, input, initial))
}

function unwrap(outcome) {
  if (!outcome || !(RESULT in outcome)) throw Error('Middleware must return the result of next().')
  return outcome[RESULT]
}

/**
 * The `@tanstack/react-start` exports for one module. `send(key, method, data, context)` is given in the
 * preview, where calls go to the run; without it handlers run here and are registered for the run.
 */
export function createServerFunctions(file, send) {
  let index = 0
  const build = (name, options, state = { middleware: [], validators: [] }) => ({
    middleware: (list) => build(name, options, { ...state, middleware: [...state.middleware, ...list] }),
    validator: (validator) => build(name, options, { ...state, validators: [...state.validators, validator] }),
    inputValidator: (validator) => build(name, options, { ...state, validators: [...state.validators, validator] }),
    handler(handler) {
      const method = (options.method ?? 'GET').toUpperCase()
      if (!['GET', 'POST'].includes(method)) throw Error(`Server functions use GET or POST, not ${options.method}.`)
      const key = `${file}:${name}`
      const definition = { key, method, ...state, handler }
      const call = send
        ? (input = {}) => runClient(definition, input, (data, context) => send(key, method, data, context))
        : (input = {}) => runServer(definition, input.data, {})
      if (!send) {
        if (typeof handler !== 'function') throw Error(`Server function ${key} has no handler.`)
        registry.set(key, definition)
      }
      return Object.assign(call, { url: `/_serverFn/${encodeURIComponent(key)}`, method, civicKey: key })
    },
  })
  const createServerFn = (options = {}) => build(`~${index++}`, options)
  // The transform names each `const name = createServerFn(...)` after its variable, for readable recordings.
  createServerFn.as = (name, options = {}) => build(name, options)
  return { createServerFn, createMiddleware, useServerFn: (fn) => fn }
}

/** The run's side of a call: `serverFn:<key>`, GET as a query and POST as a mutation, with tagged JSON in and out. */
export async function executeServerFunction(kind, key, args, context = {}) {
  const definition = registry.get(key)
  if (!definition) throw Error(`Unknown server function ${key}.`)
  if ((kind === 'query') !== (definition.method === 'GET')) throw Error('GET server functions are queries and POST server functions are mutations.')
  try { return { value: encode(await runServer(definition, decode(args.data), { ...context, ...decode(args.context ?? {}) })) } }
  catch (error) {
    if (error instanceof Error) throw error
    // Values thrown on purpose (redirects, not-found markers) reach the caller as themselves.
    throw Object.assign(Error('The server function threw a value.'), { data: { thrown: encode(error) } })
  }
}

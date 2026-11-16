# Deterministic Effect lint rules

Source: https://github.com/k-mistele/anti-slop, MIT, commit
`b7c1619b4d51b4815e89ba3700a975a6ec54b8c3`.

Taken: `src/effect/index.ts`, its fourteen AST rules, and its two shared helpers.
Only dependency import paths were changed to resolve the engine workspace's
dev-only `@oxlint/plugins` 1.93.0 (matching oxlint). No upstream entrypoint,
Jev, diff rules, network clients, or model integrations are included.

Ultracite 8.2.1 already supplies the core anti-slop rules. Both versions support
`allowInTypeGuards`; Ultracite enables it. The pinned repository exposes
`no-conditional-spread` where Ultracite exposes `no-conditional-empty-object-spread`,
and additionally exposes `max-ternary-depth`, `no-disabled-type-assertion-rules`,
and `no-reprovide-ambient-service`. CIVIC keeps Ultracite's core set and
implementations; no core rules were copied or added.

Compatibility inspected against installed Effect 4.1.4 source:

| Rules | Effect 4 contract |
| --- | --- |
| no-manual-effect-error-tag, prefer-tagged-error-handling | catchTag/catchTags and catchReason/catchReasons exist |
| no-manual-tag-comparison, prefer-effect-match | Match.tag/tags and Predicate.isTagged exist |
| no-manual-tagged-construction, no-manual-tagged-type | Schema.TaggedError, TaggedClass, TaggedStruct and Data constructors exist; this installed version names the error class factory TaggedError, not TaggedErrorClass |
| no-ordie-in-service-construction | Context.Service make and Layer.effect construction retain typed errors |
| no-service-parameters, prefer-yield-service | Context.Service is yieldable; Context, ManagedRuntime and Layer remain dependency carriers |
| require-cause-when-narrowing | mapError/catch/catchCause handlers can preserve cause |
| require-operation-span | Effect.fn("name") and withSpan exist |
| require-service-make-layer | recognizes Context.Service, including tag-only host-provided services |
| no-service-constructor-imports | disabled: a makeX import is not proof of an Effect constructor |
| no-test-code-in-src | disabled: colocated unit tests are CIVIC's supported layout |

The last two remain vendored for provenance but are not enabled. No Effect 3
rewrite was required. These are syntax checks, not type-level proofs; service
ownership and tracing requirements are CIVIC conventions, not Effect API limits.

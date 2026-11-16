# Preparing CIVIC for more frameworks

Research date: 16 November 2026. Plan only; no framework was installed or run.

## Start small

Keep source discovery separate from proof that a replay reached a handler. Use
static detectors to find declarations and source locations. Where a framework
offers a route registration hook, use it in the synthetic runtime to resolve
prefixes and match requests. Do not build a general JavaScript interpreter.

Researched at `128a7b2de6f1638953983e3ba9d0cbda908bec3c`, before
[decision 0023](../decisions/0023-backend-coverage-boundary.md) was on that line.
Its native, contract and trace tiers are the ones meant below; its deployed-build
rule (opaque ids plus a private mapping file) matches "Deployed builds".

The existing boundaries remain:

- [Decision 0010](../decisions/0010-project-dependency-boundary.md): project
  adapters belong to the project; CIVIC must not depend on private applications.
- [S7 and S8](2026-11-15-effect-xstate-electron-rebuild.md): element/source
  lookup and deliberately unreached backend operations need synthetic proof.
- [Backend inventory](../../packages/canvas/server/backend-coverage.mjs) reads
  fingerprinted source roots and an optional validated inventory; duplicate ids
  fail. [The current detector](../../packages/canvas/server/server-functions.mjs)
  finds TanStack Start server functions. The detector-list refactor and Convex
  support described by the controller are parallel work, not present proof here.
- [Source tagging](../../packages/vite-connector/src/review-source-tags.mjs)
  parses JSX and tags lowercase host elements with `data-civic-source`.
  [Element capture](../../review/src/elements.ts) accepts relative file paths and
  positive line/column numbers. Other annotation formats need normalization.

## Recommended order

| Order | Work | Why |
|---|---|---|
| 1 | Finish the existing detector list; add Next route files, Next server actions (`'use server'`) and literal Express routes; share the JSX tagger through a webpack-compatible loader | High adoption and small, explainable static subsets. Next.js and Express account for 20.8% and 19.9% of respondents in the [2025 Stack Overflow web technology survey](https://survey.stackoverflow.co/2025/technology#1-web-frameworks-and-technologies). This is a dated adoption signal, not a 2026 ranking. The owner uses server actions with the App Router (16 Nov), so they ship with route files. |
| 2 | Hono, Fastify and Elysia; runtime registration evidence first for composed routes | Their route records/hooks make complete paths more practical than cross-file guessing. See Hono, Fastify and Elysia below; Elysia is treated like Hono and Fastify (owner, 16 Nov). Hono's placement is an engineering choice, not a measured popularity claim. |
| 3 | NestJS, tRPC and Angular component hints | NestJS has a larger survey share (6.7%) than Fastify (2.9%), but prefixes/decorators need more work. tRPC needs procedure identity rather than one HTTP endpoint. Angular is popular (owner, 16 Nov): start with component-level hints (`ng.getComponent`), then template-line tagging through the Angular compiler. |
| 4 | SvelteKit, React Router/Remix, Nuxt/Nitro and Astro | Add one route convention at a time, with config and export fixtures. Read existing Vue/Svelte/Solid annotations before adding transforms. |
| 5 | Koa router adapters | More adapter choice. Build only against an actual connected project's need. |

React Native element lookup is not on this list: it joins the native mobile app work (Appium crawl, D34), which needs a native capture and identity contract first.

Contract import should precede custom native support when a project already
supplies OpenAPI. A contract covers declared HTTP operations; it does not prove
execution, locate a handler, or describe unexported RPC/actions automatically.

## Backend: what one file can tell us

The tables describe proposed detector limits, inferred from the linked framework
APIs. `parseSync` supplies syntax and offsets, not import resolution, evaluation,
dependency injection or a running router. Recognize imported bindings and local
aliases; a random object's `.get()` is not sufficient framework evidence.

For an inline handler, report its function start. A same-file named handler can
be resolved locally. An imported handler needs a second source lookup; report
only the declaration site until that lookup succeeds. Keep declaration and
handler locations distinct. Derive line/column from original source offsets,
including a fixture with non-ASCII text before the handler.

| Framework checked | Declaration; reliable per-file subset | Where it stops |
|---|---|---|
| **Hono 4.13.19** | `app.get('/x', handler)`, other verbs, `.on(method, path, handlers)`; literal method/path arrays can be expanded. Inline handler location is available. [Source](https://github.com/honojs/hono/blob/v4.13.19/src/hono-base.ts). | `.route('/api', sub)`, `.basePath()`, `.mount()`, custom path extraction, imported apps and computed values need composition/runtime evidence. `.use()` is middleware, not automatically an operation. |
| **Express 5.3.0** | `app.get/post(...)`, `router.get(...)`, `app.route('/x').get(...)`; literal paths and local handler bindings. [Application source](https://github.com/expressjs/express/blob/v5.3.0/lib/application.js). | `app.use('/v1', router)`, router factories, arrays/regex paths and middleware ordering. The app delegates routing to a separate router package: do not assume Express 4's `_router.stack` layout. |
| **NestJS 12.5.1** | `@Controller('cats')` plus `@Get(':id')`, `@Post()` etc.; combine literal controller/method paths and locate the decorated method. [Controllers](https://docs.nestjs.com/controllers), [RouterExplorer source](https://github.com/nestjs/nest/blob/v12.5.1/packages/core/router/router-explorer.ts). | Module paths, global prefix, versioning, host constraints, inherited/custom decorators and dynamic modules. One controller file cannot establish its final URL. |
| **Fastify 5.12.8** | `.get('/x', opts?, handler)` and `.route({method, url, handler})` with literal properties. [Versioned docs](https://github.com/fastify/fastify/blob/v5.12.8/docs/Reference/Routes.md). | `.register(plugin, {prefix})`, encapsulation, asynchronous registration, constraints and generated routes. |
| **Koa 3.3.0; @koa/router 15.7.1** | Core Koa's `app.use(fn)` is middleware, not a route declaration. A separate `@koa/router` detector can recognize `.get('/x', handler)` and named-route overloads. [Koa](https://koajs.com/), [router README](https://github.com/koajs/router/blob/1ae7e0c5f2f70d48c1a864e26bb62f110cf72be1/README.md). | Router package choice, nested `.use`, prefixes and arbitrary middleware dispatch. Do not claim all Koa applications are covered by one router detector. |
| **tRPC 11.28.3** | `router({user: router({byId: procedure.input(...).query(fn)})})`, `.mutation(fn)`, `.subscription(fn)`; literal property keys and local object nesting identify procedure declarations. [Router docs](https://trpc.io/docs/server/routers). | Imported/merged routers, custom procedure builders and computed keys. Import provenance and final procedure nesting matter; handler function names are not RPC paths. |
| **Elysia 1.4.32** | `new Elysia().get('/x', handler)`, verbs and `.route(method,path,handler)`; literal local declarations. [Source](https://github.com/elysiajs/elysia/blob/1.4.32/src/index.ts). | `.group()`, constructor prefix, `.use()` plugins and async modules. Bun is relevant, but source defaults to Bun or WebStandard adapters depending on the environment; do not make Bun installation a CIVIC requirement. |
| **Next.js 16.4.6** | `app/**/route.ts` (also JS): exported HTTP verb functions, including local export aliases. File segments give a route template; `[id]`, `[...slug]`, `[[...slug]]` remain patterns. [Route convention](https://nextjs.org/docs/app/api-reference/file-conventions/route). | Route groups, configured base path, rewrites, custom extensions and generated/re-exported handlers need project config/export resolution. Do not turn a route group into a URL segment. |
| **Next actions 16.4.6** | File-level `'use server'` marks exported server functions; a function-body directive marks that function. Locate each declaration separately. [Directive](https://nextjs.org/docs/app/api-reference/directives/use-server). | Build-generated action references, closure captures, anonymous/inline actions and re-exports. A POST URL alone cannot identify an action. |
| **React Router 8.5.1 / Remix lineage** | Exported `loader` and `action` identify operations in a route module. Current framework routes explicitly connect paths to files in `routes.ts`. [Modules](https://reactrouter.com/start/framework/route-module), [routing](https://reactrouter.com/start/framework/routing). | A module alone lacks its final path; nested/layout/index routes and generated configs need the route manifest. `clientLoader`/`clientAction` are not server operations. Legacy Remix flat-file conventions need separate pinned fixtures; they were not independently verified here. |
| **SvelteKit 3.2.0** | `src/routes/**/+server.ts`: HTTP exports. `+page.server.ts`: `actions = {default: fn, login: fn}` gives form-action names. [Routing](https://svelte.dev/docs/kit/routing), [actions](https://svelte.dev/docs/kit/form-actions). | Configured route root/base, matchers, optional/rest/group segments and re-exports. Form action `?/login` is part of identity; POST plus pathname is insufficient. |
| **Nuxt 4.6.4 / Nitro 3 RC** | Nuxt `server/api/foo.get.ts` → GET `/api/foo`; `server/routes` has no automatic `/api` prefix; default `defineEventHandler` export gives the handler. [Nuxt docs](https://nuxt.com/docs/4.x/guide/directory-structure/server). | Layers, alternate server roots, programmatic handlers and methodless files. Standalone Nitro 3 uses configured `serverDir`/`scanDirs` and `defineHandler`; do not apply Nuxt defaults to it. [Nitro routing](https://nitro.build/guide/routing). |
| **Astro 7.4.12** | `src/pages/**` endpoint modules export `GET`, other methods or `ALL`; filename gives a route template. [Official endpoint guide source](https://github.com/withastro/docs/blob/main/src/content/docs/en/guides/endpoints.mdx). | Output mode, `prerender`, dynamic route generation and adapter behavior decide whether a module is a live endpoint or build-time output. Do not count a static endpoint as a callable staging backend. |

### Use runtime records where they are stronger

A runtime record proves registration, not that a journey executed it. An ordinary
JavaScript function object does not reveal its original source line. Join runtime
records to detector locations through explicit registration metadata; do not infer
source from `Function.name` or `toString()`.

| Framework | Runtime choice and replay identity | Contract route |
|---|---|---|
| Hono | Prefer `app.routes` after setup: records contain method, expanded path and handler. Use matched route pattern, not concrete URL; middleware records need filtering. Public [route helpers](https://hono.dev/docs/helpers/route) expose matched patterns. Multiple handlers may share method/path. | [`@hono/zod-openapi`](https://github.com/honojs/middleware/blob/main/packages/zod-openapi/README.md) registers schema-backed routes and can serve a document. Optional, not core automatic inference. |
| Express | Static first. A version-bound registration adapter beats reverse-engineering nested private stacks. `app.router` exists in the [5.3.0 source](https://github.com/expressjs/express/blob/v5.3.0/lib/application.js); a stable public flattened route-table API was not verified. Replay needs method + matched pattern + mount/registration identity where ambiguous. | No core publisher verified; accept a supplied OpenAPI document without prescribing middleware. |
| Nest | Prefer adapter registration evidence after app initialization, joined to controller/method metadata. `RouterExplorer` resolves paths and delegates to the HTTP adapter, but is internal, not a public inventory API. Host/version constraints must survive the join. [Source](https://github.com/nestjs/nest/blob/v12.5.1/packages/core/router/router-explorer.ts). | [`@nestjs/swagger`](https://docs.nestjs.com/openapi/introduction), `SwaggerModule.createDocument`. |
| Fastify | Prefer structured `onRoute` installed before registrations, then await readiness. It exposes method, URL, prefix and handler. `printRoutes` is diagnostic text, not an interchange format. Record request route identity and constraints; do not parse the printed tree. [Hooks](https://github.com/fastify/fastify/blob/v5.12.8/docs/Reference/Hooks.md), [server](https://github.com/fastify/fastify/blob/v5.12.8/docs/Reference/Server.md). | [`@fastify/swagger`](https://github.com/fastify/fastify-swagger/blob/main/README.md): dynamic generation from route schemas or an existing document. Register before routes. |
| Koa | No core route table: middleware composition is the core model. A pinned router-specific adapter may inspect its registrations; exact stack/matched-route fields remain to be verified before implementation. [Koa](https://koajs.com/). | No core publisher verified. Supplied contract only until a router integration is selected. |
| tRPC | Final procedure path + operation type, not HTTP method/path alone. Batches need one event per procedure. A runtime procedure-registration bridge is preferable to resolving imported router trees statically. Do not depend on `_def` without a pinned adapter. [Router docs](https://trpc.io/docs/server/routers). | Core OpenAPI publication not verified. Do not equate tRPC input schemas with an HTTP OpenAPI contract. |
| Elysia | `app.routes` returns registration history; prefer it after plugins settle. Preserve method/pattern and registration association. Lazy plugin completion and replay matched-route APIs still need execution proof. [Source](https://github.com/elysiajs/elysia/blob/1.4.32/src/index.ts). | Official [`@elysiajs/openapi`](https://github.com/elysiajs/documentation/blob/main/docs/plugins/openapi.md); optional plugin. |
| Next routes/actions | Route files: method + matched route template. Actions: logical file/export or lexical declaration identity, mapped from the current build's action reference. Do not persist framework-generated action ids across builds. No public complete runtime inventory API verified. | No built-in publisher verified. Supplied OpenAPI can cover HTTP routes, not automatically actions. |
| React Router/Remix | Route manifest id + `loader`/`action`; one navigation may invoke several loaders. Method/path cannot distinguish all operations. Use the synthetic runtime's per-handler events. A stable inventory API for external hosts was not verified. [Modules](https://reactrouter.com/start/framework/route-module). | No built-in publisher verified. |
| SvelteKit | Route id + HTTP export, or route id + action name. Prefer framework-resolved route identity over guessing matcher behavior. A complete public runtime table was not verified. [Routing](https://svelte.dev/docs/kit/routing), [actions](https://svelte.dev/docs/kit/form-actions). | No built-in publisher verified. |
| Nuxt/Nitro | Static file declarations first, with configuration supplied by the adapter. Generated route artifacts require a version-bound reader; no stable runtime enumeration API verified. Use method + matched pattern. | Nitro [experimental OpenAPI](https://nitro.build/guide/openapi): `experimental.openAPI`, route metadata and `/_openapi.json`; documented development endpoints do not imply a deployed document. |
| Astro | Static inventory plus output/prerender config first. Runtime adapter evidence for matched pattern; no universal public route table verified. [Endpoint guide](https://github.com/withastro/docs/blob/main/src/content/docs/en/guides/endpoints.mdx). | No built-in publisher verified. |

For every row, contract publication is opt-in and may omit routes. Importing an
existing document is reusable work; installing plugins or inventing missing
schemas is not free coverage. Contract `operationId` need not equal native id:
join on an explicitly normalized method/template with ambiguity reported.

### Detector shape

Preserve the controller's small interface; do not start another detector registry.

```ts
{ name: 'hono', detect(code, file) -> rows }
// Existing row fields stay: id, file, export, kind.
// Proposed additions only where needed: line, column, method, path.
// Runtime evidence joins an operation id to its registered/matched identity.
```

Use `route:<framework>:<file>:<export-or-local-key>` for declaration identity,
scoped by project/source fingerprint outside the row. Keep final route patterns
as match metadata: a handler mounted twice has two registrations. Function names
alone collide; line-based anonymous keys move on edits and must be source-bound.
Do not invent an export for anonymous handlers: define how a local key fits the
existing required `export` field before changing that contract.

`backendInventory`, shell coverage validation, replay event/tape writers, MCP
coverage output, adapter inventory validation and synthetic fixtures must agree
on any new fields/kinds. Existing inventory input accepts only `route`/`rpc`,
while the built-in detector emits `server-function`; settle that boundary with
the parallel change instead of silently widening validation.

## Frontend: keep the location transform, replace its host

The recommendation is one source-editing core with thin bundler adapters. Run
before JSX lowering, preserve input maps, and return an output map. The present
tagger returns only text; map preservation is preparation work, not something
already supplied by the current implementation.

| Host; version checked | Smallest hook and recommendation |
|---|---|
| **Next/Turbopack 16.4.6** | `turbopack.rules` supports webpack loaders, with only part of the loader API. A pure source-in/source-out JSX tagger is a good candidate. Restrict it to project source and dev configuration; cover both server and client compilation. It must run before JSX lowering. This is feasibility from the documented hook, not an executed compatibility claim. [Rules](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack). |
| **webpack 5.112.2** | A loader using `this.resourcePath`, returning code/map through `this.callback`; configure before Babel/SWC lowers JSX. Reuse the same loader for both build sides. [Loader API](https://webpack.js.org/api/loaders/). |
| **Rspack 2.3.2 / Rsbuild 2.3.2** | Reuse that loader. Rspack supports most webpack loaders. Rsbuild can add a rule with `modifyRspackConfig`, or use its transform API; do not create another parser. [Pinned Rspack guide](https://github.com/web-infra-dev/rspack/blob/v2.3.2/website/docs/en/guide/features/loader.mdx), [Rsbuild plugin types](https://unpkg.com/@rsbuild/core@2.3.2/dist/types/plugin.d.ts). |
| **esbuild 0.28.2** | Build plugin `onLoad({filter})` reads and tags a source module, returning `contents`, `loader: 'jsx'/'tsx'`, `resolveDir` and watch inputs. Coordinate with any existing loader; `onLoad` claims the load rather than acting as a universal transform chain. Plugins belong to the build API, not standalone `transform()`. [Plugin docs](https://esbuild.github.io/plugins/). |
| **Metro 0.88.0** | Use a Babel plugin in the existing transform pipeline, or compose the configured `babelTransformerPath`. React Native has native views, not host DOM elements: a data attribute cannot satisfy CIVIC's DOM capture contract. Defer native element lookup until a native capture/identity contract exists; React Native Web is a separate DOM case. [Metro config](https://metrobundler.dev/docs/configuration/). |
| **Parcel 2.16.4** | A `Transformer` before the JS transformer, reading/writing `MutableAsset` code and maps; preserve the rest of the `.parcelrc` pipeline. [Transformer API](https://parceljs.org/plugin-system/transformer/). |

### What Turbopack actually supports

“Turbopack has no plugins” is too broad. Next 16.4.6 documents no **webpack
plugin** support, but supports webpack **loaders**. Its rules docs list Babel
loader support and exclude loader `emitFile`, `loadModule`, `importModule` and
most filesystem operations. Options must be serializable.
[Current rules docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack).

Next 16 automatically detects Babel config under Turbopack; SWC still performs
Next's internal transforms. Do not copy the older Next 15 “Babel unsupported”
guidance. [Current feature table](https://nextjs.org/docs/app/api-reference/turbopack).

Next also exposes experimental WASM `experimental.swcPlugins`, distinct from
webpack plugins. It exists in [16.4.6 config source](https://github.com/vercel/next.js/blob/v16.4.6/packages/next/src/server/config-shared.ts)
and the [compiler docs](https://nextjs.org/docs/architecture/nextjs-compiler).
The [pinned Turbopack transform implementation](https://github.com/vercel/next.js/blob/v16.4.6/crates/next-core/src/next_shared/transforms/swc_ecma_transform_plugins.rs)
reads that configuration and creates a transform rule. It requires a native
Next binary to execute the WASM plugins; the WASM-hosted implementation emits an
unsupported-platform error. This verifies actual integration, not merely a
config key. Do not start with a new Rust/WASM tagger: the loader is smaller and
reusable. An actual plugin compatibility run remains necessary for shipping.

### Runtime-only React alternatives

| Candidate | Verdict |
|---|---|
| `captureOwnerStack` | Development diagnostic, not arbitrary selected-DOM-node lookup. It returns an owner stack only in React-controlled contexts and can return null; it takes no element argument. A component owner location also differs from a particular host JSX occurrence. [React reference](https://react.dev/reference/react/captureOwnerStack), checked with React 19.3.1 release/source. |
| Fiber/React DevTools | Useful optional component hints. Private Fiber fields and DevTools renderer integration are not a stable element/source contract. Do not ship an embedded DevTools backend solely for this lookup. |
| `_debugSource` | Present in [18.3.1 Fiber types](https://github.com/facebook/react/blob/v18.3.1/packages/react-reconciler/src/ReactInternalTypes.js); absent in [19.3.1 Fiber types](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactInternalTypes.js), which instead have stack/owner debug metadata. This verifies the field difference, not a migration guarantee for every React 19 patch. |
| Source maps | Can resolve a known generated code position or stack frame. They do not identify which code position created an arbitrary DOM node. Use for stack hints or composing transform locations, not as a substitute for element ids. [ECMA-426](https://tc39.es/ecma426/). |

### Existing non-React locations

| Framework/tool checked | Read first; fallback |
|---|---|
| Vue inspector 7.0.0 | Read `data-v-inspector` when already present. Its compiler and client use this attribute, including file/line/column. It belongs to an optional inspector plugin, not a guarantee from Vue core. Normalize within the selected project root. [Compiler](https://github.com/webfansplz/vite-plugin-vue-inspector/blob/v7.0.0/packages/core/src/compiler/template.ts), [reader](https://github.com/webfansplz/vite-plugin-vue-inspector/blob/v7.0.0/packages/core/src/client/record.ts). Otherwise add a Vue-template transform, not a JSX transform. |
| Svelte inspector 5.0.2 | Its runtime reads `element.__svelte_meta.loc` with `file`, `line`, `column`; this is JS metadata, not a `data-svelte-*` source attribute. Plugin applies to dev serving. Read it through a guarded adapter and test column normalization. [Published runtime](https://unpkg.com/@sveltejs/vite-plugin-svelte-inspector@5.0.2/src/runtime/Inspector.svelte), [plugin](https://unpkg.com/@sveltejs/vite-plugin-svelte-inspector@5.0.2/src/index.js). |
| Solid 1.9.19; devtools transform 0.10.4 / debugger 0.28.1 | Optional `locator.jsxLocation` inserts `data-source-loc`; it is not always enabled. Read existing attributes, otherwise reuse the host JSX tagger before Solid compilation. [Transform](https://unpkg.com/@solid-devtools/transform@0.10.4/dist/index.js), [locator types](https://unpkg.com/@solid-devtools/debugger@0.28.1/dist/locator/locator.d.ts). |
| Angular 22.2.6 | Public `ng.getComponent` provides component identity, not exact template occurrence coordinates. `ng-reflect-*` contains binding diagnostics rather than file/line. No general existing host-element source annotation was verified. Offer component-only hints until an Angular template compiler integration is justified. [getComponent](https://angular.dev/api/core/globals/ng/getComponent), [reflection API](https://angular.dev/api/core/provideNgReflectAttributes). |

```ts
tagHostElements(code, file, { root, mode }) -> { code, map, locations }
// mode: dev locations, or deployed opaque ids
readElementSource(element, build) -> { file, line, column } | undefined
// Prefer CIVIC data, then a verified framework reader; validate both alike.
```

Keep normalization and capture in shared review code. Nearest annotated ancestor
is a useful fallback only if reported as ancestor evidence, not exact selection.
SVG, fragments, portals, repeated JSX, third-party components, compiled templates
and server-rendered HTML need explicit fixtures. No DOM node means no DOM claim.

## Deployed builds

Use an explicit staging/preview build option. Put only a short opaque occurrence
id in host elements, for example `data-civic="a9L2xQ7m"`. Write a private sidecar
mapping that id to relative file, line and column. This is a proposal, not an
already supported mode.

Key the artifact by project, commit **and exact build identity**: source/content
fingerprint, tagger/schema version and relevant configuration. A commit alone
does not distinguish dirty content, target, environment-dependent output or two
builds with different flags. Record that build identity on the reviewed page and
capture. Refuse mismatches; never resolve an id using the newest available map.

Generate ids deterministically from the normalized source occurrence and build
inputs. Check collisions across the build; lengthen ids on collision. Random ids
would invalidate otherwise unchanged output. An id identifies a source
occurrence, not a unique runtime DOM instance: repeated list items share it.
Tag both SSR and client output identically to avoid hydration differences.

### Can the hook emit the sidecar?

| Bundler | Artifact mechanism; verified API versus proposed wiring |
|---|---|
| webpack 5.112.2 | Loader `this.emitFile` can emit files. Prefer per-module deterministic fragments plus a compilation asset step for the final map; a loader is not a reliable global accumulator across parallel/cached modules. [Loader API](https://webpack.js.org/api/loaders/). |
| Rspack/Rsbuild 2.3.2 | Loader API supports file emission; Rsbuild exposes it in transform context. Same fragment/aggregation design, using its Rspack configuration hook. [Rsbuild types](https://unpkg.com/@rsbuild/core@2.3.2/dist/types/plugin.d.ts). |
| Turbopack / Next 16.4.6 | **Not through loader `emitFile`**, explicitly unsupported. Use a separate bounded prebuild source pass that writes the map into CIVIC-owned build artifacts, with the loader independently deriving identical ids. A build finalizer validates transformed-module coverage before accepting the artifact. Cache hits must not depend on loader side effects. This workaround needs a spike; no generic webpack asset plugin can be assumed. [Rules limits](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack). |
| esbuild 0.28.2 | `onLoad` has no asset-emission return field. A build plugin can collect mappings and write a sidecar in `onEnd`, accounting for incremental caches and failed builds. Do not publish artifacts on build errors. [Plugin API](https://esbuild.github.io/plugins/). |
| Parcel 2.16.4 | Transformer may return additional assets, but these participate in Parcel's asset graph. For one complete private map, use its build/reporting stage or a separate deterministic pass; a per-asset transform alone does not establish whole-build finalization. [Transformer API](https://parceljs.org/plugin-system/transformer/). |
| Metro 0.88.0 | Babel transformer is per-module, not a whole-build asset emitter. External aggregation/serialization is needed, and native views still need a native identity/capture contract. Defer native deployment support. [Config](https://metrobundler.dev/docs/configuration/). |

For Vue/Svelte/Angular production templates, hook availability does not make JSX
tagging applicable. Use the relevant template compiler or a proven annotation
integration; dev inspector metadata disappearing in production is expected.
Solid can use the JSX path before its compiler lowers it. These are proposed
adapters, not executed production compatibility claims.

### Sentry is useful precedent

Verified published source: `@sentry/bundler-plugin-core` and
`@sentry/babel-plugin-component-annotate` **5.3.0**. The core option is
`reactComponentAnnotation: { enabled: true }`; its types explicitly say React
components only and no support in the esbuild bundler plugin.
[Option source](https://unpkg.com/@sentry/bundler-plugin-core@5.3.0/dist/types/types.d.ts).

The Babel plugin adds `data-sentry-component`, `data-sentry-element` and
`data-sentry-source-file`; the native mode uses camelCase equivalents. It
annotates selected JSX/component roots with component and element names and a
source filename, **not exact line/column or every DOM element**. Fragment and
ignored-component behavior are configurable. Its experimental HTML injection
mode has a different scope; do not treat it as universal coverage.
[5.3.0 implementation](https://unpkg.com/@sentry/babel-plugin-component-annotate@5.3.0/dist/esm/index.mjs).

These are compile-time annotations that survive in deployed output, not React
dev-only Fiber metadata. The standalone Babel plugin runs wherever configured.
In 5.3.0, the checked [Rollup wrapper used by Vite](https://unpkg.com/@sentry/rollup-plugin@5.3.0/dist/esm/index.mjs)
and [webpack wrapper](https://unpkg.com/@sentry/webpack-plugin@5.3.0/dist/esm/webpack4and5.mjs)
enable the annotation transform from the option, without a production-only mode
check; the shared [transform hook](https://unpkg.com/@sentry/bundler-plugin-core@5.3.0/dist/esm/index.mjs)
filters to JSX/TSX outside node_modules. Thus these wrappers can annotate both
development and production when enabled, unless the caller disables or omits
the plugin. This is source verification, not an executed build. The [official announcement](https://sentry.io/changelog/react-component-names-is-now-available/)
documents the option and React use case. Vue, Svelte and Angular are **not**
covered by this React option; this is not a claim that Sentry has no other
framework tooling.

Read existing Sentry names as component hints if useful. Do not depend on them
for precise CIVIC source locations, and do not add Sentry merely to get tags.

### Maps, cost and privacy

Source maps translate generated code coordinates into original source
coordinates; they can also embed source text. They do not contain a DOM-node
index. They add value when resolving stack frames or composing compiler maps,
not when an element id already resolves directly to original coordinates.
[ECMA-426 source-map format](https://tc39.es/ecma426/).

The proposed `data-civic` example adds roughly 22 uncompressed bytes per
rendered occurrence for an eight-character id, including attribute syntax.
Repeated nodes increase HTML and DOM costs even when the mapping has one row.
Also measure client bundle growth, compressed HTML, SSR time, cold/warm build
time, artifact size and capture lookup time; no performance result is claimed.

Keep the map out of public assets by default. Relative paths still expose
project structure; source maps with `sourcesContent` expose source text. Opaque
ids reduce accidental disclosure but are not access control or anonymization.
Authenticate artifact access, bound retention, validate paths/ids and never
include absolute workstation paths or credentials. No source text is needed
in the sidecar.

Cache mappings by exact build/content identity, retain them while their evidence
is retained, and fetch only the reviewed build's map. Parallel build workers
need isolated fragments and atomic finalization. Preserve map records on cache
hits; never depend on a transform rerunning. Deduplicate server/client locations
without confusing build targets. A failed or mismatched map yields “source
unavailable”, not a guessed file.

Hosted CIVIC would import operational evidence from tools such as Sentry or
Datadog. Designing real-user monitoring or capture is outside this plan.

## Risks and preparation checks

Before each adapter ships, add a small synthetic fixture proving declarations,
aliases, mounted prefixes, duplicate method/path, middleware exclusion, dynamic
unknowns and malformed syntax. A passing replay must reach the registered
operation; an unreached operation must remain visible. Contract-only evidence
must not become native execution evidence.

For taggers, prove exact original coordinates, source-map composition, hot
updates, SSR/hydration, narrow capture and production omission of dev paths.
For deployed ids, build twice, exercise cache hits, change one source file,
simulate missing/mismatched maps and verify no absolute paths reach HTML.
Run all future checks under CIVIC's existing temp-root wrapper. Do not boot
connected applications just to enumerate routes: registration may access secrets,
databases or networks. Runtime inspection belongs to explicitly supplied synthetic
entry points, with bounded initialization and cleanup.

No implementation acceptance is claimed here. In particular, runtime API
stability, configured loader order, action transport mapping, native capture and
template production transforms remain work to prove.

## Verified against

Official docs were fetched on 16 November 2026. Rolling docs are not frozen to a
patch release: versions below are the release/package metadata checked alongside
them, not claims that examples were executed against those versions. Source links
with tags or package versions are the stronger anchors. `main` source links are
explicitly rolling. No packages were installed.

| Area | Version evidence and sources |
|---|---|
| Hono | [4.13.19 release](https://github.com/honojs/hono/releases/tag/v4.13.19); pinned source and route helper linked above. |
| Express | [5.3.0 release](https://github.com/expressjs/express/releases/tag/v5.3.0); pinned application source. Express docs returned HTTP 403, so stack details are deliberately not asserted. |
| Nest | [12.5.1 release](https://github.com/nestjs/nest/releases/tag/v12.5.1); controllers/Swagger docs and pinned RouterExplorer source. |
| Fastify | [5.12.8 release](https://github.com/fastify/fastify/releases/tag/v5.12.8); versioned routes/hooks/server docs; Swagger README on `main`. |
| Koa/router | [3.3.0 release](https://github.com/koajs/koa/releases/tag/v3.3.0); [router 15.7.1 metadata](https://registry.npmjs.org/@koa%2frouter/15.7.1) and its gitHead README. |
| tRPC | [11.28.3 release](https://github.com/trpc/trpc/releases/tag/v11.28.3); current router docs. |
| Elysia | [1.4.32 release](https://github.com/elysiajs/elysia/releases/tag/1.4.32); pinned source and rolling official OpenAPI plugin guide. Website routing docs returned 403. |
| Next | [16.4.6 release](https://github.com/vercel/next.js/releases/tag/v16.4.6); current docs identify 16.4.6; route/directive/Turbopack/compiler links above. |
| React Router | [8.5.1 release](https://github.com/remix-run/react-router/releases/tag/react-router%408.5.1); framework module/routing docs. Legacy Remix version support unverified. |
| SvelteKit | [3.2.0 release](https://github.com/sveltejs/kit/releases/tag/%40sveltejs/kit%403.2.0); routing/form action docs. |
| Nuxt/Nitro | [Nuxt 4.6.4](https://github.com/nuxt/nuxt/releases/tag/v4.6.4), [Nitro 3.0.261103-rc](https://github.com/nitrojs/nitro/releases/tag/v3.0.261103-rc); docs above. RC findings are not a promise about Nuxt's resolved Nitro version. |
| Astro | [7.4.12 package metadata](https://registry.npmjs.org/astro/7.4.12); official endpoint guide source. GitHub's latest monorepo release was a Vue integration, so it was not used as Astro's version. |
| React | [19.3.1 release](https://github.com/facebook/react/releases/tag/v19.3.1); Fiber sources 18.3.1 and 19.3.1; captureOwnerStack reference. |
| webpack/Rspack/Rsbuild | [webpack 5.112.2](https://github.com/webpack/webpack/releases/tag/v5.112.2), [Rspack 2.3.2](https://github.com/web-infra-dev/rspack/releases/tag/v2.3.2), [Rsbuild 2.3.2](https://registry.npmjs.org/@rsbuild%2fcore/2.3.2); APIs/source above. Rspack/Rsbuild sites returned 403; source/package types supplied the evidence. |
| esbuild/Metro/Parcel | [esbuild 0.28.2](https://github.com/evanw/esbuild/releases/tag/v0.28.2), [Metro 0.88.0](https://github.com/react/metro/releases/tag/v0.88.0), [Parcel 2.16.4](https://github.com/parcel-bundler/parcel/releases/tag/v2.16.4); official API docs above. |
| Vue/Svelte inspectors | [Vue inspector 7.0.0](https://github.com/webfansplz/vite-plugin-vue-inspector/releases/tag/v7.0.0); [Svelte inspector 5.0.2 metadata](https://registry.npmjs.org/@sveltejs%2fvite-plugin-svelte-inspector/5.0.2); versioned source above. |
| Solid tools | [Solid 1.9.19 metadata](https://registry.npmjs.org/solid-js/1.9.19); transform 0.10.4 and debugger 0.28.1 published source above. |
| Angular | [22.2.6 metadata](https://registry.npmjs.org/@angular%2fcore/22.2.6); public debug API docs above. Exact template-location API not verified. |
| Sentry | [core 5.3.0 metadata](https://registry.npmjs.org/@sentry%2fbundler-plugin-core/5.3.0), [annotation plugin 5.3.0 metadata](https://registry.npmjs.org/@sentry%2fbabel-plugin-component-annotate/5.3.0); published types/implementation and official announcement above. Sentry's current component-names docs failed TLS retrieval; published source was used instead. |

OpenAPI helper package versions were not independently resolved in this pass;
their linked official documentation/source establishes the integration shape,
not a tested dependency compatibility matrix. Pin them before implementation.

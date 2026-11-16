# @civic/vite-connector

CIVIC's build connector for Vite apps. It is the dev-only Vite plugin that turns a review host into the journey canvas for one connected app, plus the modules it needs: the project manifest (`civic.json` at the app's root or `.civic/civic.json`; the older `civic.project.json` still loads, with a deprecation note) and its `init`/`check` CLI, the project picker, static discovery, the review index, per-screen fixture fingerprints and the coverage bridge.

An app connects read-only through its manifest. The connector indexes the screens the manifest's scenario registry names, fingerprints each one by its own import closure, serves the review entries and the app's sources to them, refreshes on change, and mounts the [`@civic/shell`](../shell) review server. Nothing is written into the app's checkout, and routine indexing, refresh and serving make no model calls.

## Connecting an app

A `module` app needs only its manifest and a preview entry that exports `mount(container, context)`. Start one with:

```sh
node packages/vite-connector/src/review-project.mjs init --root /path/to/app --id my-app --name "My app" --source src --preview src/preview.ts --write
node packages/vite-connector/src/review-project.mjs check --project /path/to/app/civic.json
```

Then open it with the standalone canvas (`node packages/canvas/bin/civic-canvas.mjs --project /path/to/app/civic.json`, see [`@civic/canvas`](../canvas)), select it in a host's project picker, or start a host with `CIVIC_PROJECT=/path/to/app/civic.json`. `--project` and `CIVIC_PROJECT` also take the app's folder.

## Hosting the canvas

```js
import { civicReview } from '@civic/vite-connector'

civicReview({
  host,                 // the Vite root
  canvas,               // folder with review.html, review-frame.html and their src/ (normally @civic/canvas); defaults to host
  repo,                 // workspace that owns the review store (.review-data)
  connectors: {},       // adapter kind -> app connector, for apps that aren't plain modules
  review: ({ project, repo, dataDir }) => ({ adapter, coverage, agents, shared, publicHost }),
  runtime,              // optional: (project, source) -> isolated backend for live runs
})
```

`review` returns the shell's options; `runtime` starts the isolated backend when the app declares one. An adapter kind other than `module` needs a connector. A connector without its own `inventory` is indexed from the scenario registry, like a module app. Example's (`apps/web/scripts/review-example-connector.mjs`) shows the whole interface: its own index and fixture fingerprint inputs, module substitutes for app boot, auth and server routes, a checked in-memory source overlay, the packages the app and review must share, the app's CSS for review frames, and a canvas extension (`canvasExtension`) with its flow layout and guided towel run. The connector itself names nothing from Example, and its checks enforce that it imports only Node, Vite and the shell. A module app can name its own canvas extension in its manifest (`adapter.extension`); a connector's `canvasExtension` takes its place.

## CIVIC's shared store

Reader tools (`coverage`, `backend_coverage`, and `changed_screens`) can load a custom
connector from `adapter.connector`, a module path relative to the project root.
The module must default-export the same connector object supplied to a custom
host's `civicReview({ connectors })`. The path must stay inside the project,
including symlinks. Loading it executes project code, so CIVIC loads it only when
its absolute path is listed in `CIVIC_TRUSTED_CONNECTORS` (separated like `PATH`),
which the owner sets outside the checkout; a branch can name a connector but not
trust one.
Without a host connector or this declaration, unknown adapter kinds are refused.

The development connector tags host JSX elements under the manifest's `sources`
with `data-civic-source="file:line:column"`. Locations are repository relative and
one-based. Component JSX and production builds are excluded. The canvas's frozen
element selection and the review overlay show the location under Details and
carry it into saved notes and work requests.

```js
import { civicShared } from '@civic/vite-connector/civic'

review: () => ({ adapter, shared: civicShared({ repo, product: 'example' }) })
```

`civicShared` runs CIVIC's `civic` CLI, so canvas notes become annotations in the reviewed repository's `.civic/` folder and can be handed to agents as work requests (decision 0007). It finds the CLI through `CIVIC_ROOT`, or else in the CIVIC checkout this package came from, and returns null when there is none. `product` is the app's product ID in CIVIC's graphs: a whole-screen note anchors to `target:<product>.<scenario>`, and the Contract panel reads that target with `civic screen`.

## Source tags outside Vite

The same JSX transform is exported as `@civic/vite-connector/source-tags-loader`
(an ESM webpack loader, supported by webpack's [loader runner](https://github.com/webpack/loader-runner/blob/main/lib/loadLoader.js)). It requires Node 22.20+ or 24+ for `path.matchesGlob`
and the package's Vite peer for parsing. Options are JSON-serializable: an absolute
`root` and `include` globs relative to that root, using `/` separators. Match only
the sources you would declare in the Vite manifest. Files outside root and
`node_modules` are excluded; only lowercase host JSX in `.jsx`/`.tsx` is tagged.
Locations refer to the original source; transformed output currently has no
source map. Unchanged inputs retain their incoming map.

For **Next.js 16 with Turbopack**, in `next.config.mjs`:

```js
export default {
  turbopack: {
    rules: process.env.NODE_ENV === 'development' ? {
      '*.{tsx,jsx}': { loaders: [{ loader: '@civic/vite-connector/source-tags-loader', options: {
        root: import.meta.dirname, include: ['app/**/*.tsx', 'app/**/*.jsx', 'src/**/*.tsx', 'src/**/*.jsx'],
      } }] },
    } : {},
  },
}
```

Run `next dev --turbopack`. These rules apply before JSX lowering to both server
and client components; do not restrict them to a browser-only condition. This
uses [Turbopack loaders](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack),
not webpack plugins, and only `resourcePath`, `getOptions()` and `callback`.

For **webpack**, append this rule to `module.rules` only in development:

```js
import { fileURLToPath } from 'node:url'

// In module.rules:
{ test: /\.[jt]sx$/, enforce: 'pre', use: [{
  loader: fileURLToPath(import.meta.resolve('@civic/vite-connector/source-tags-loader')),
  options: { root: import.meta.dirname, include: ['src/**/*.tsx', 'src/**/*.jsx'] },
}] }
```

In CommonJS config use `require.resolve(...)` and `__dirname` instead.
For **Rspack**, use the same development-only `module.rules` rule. `enforce: 'pre'`
runs the tagger before Babel/SWC lowers JSX. Apply it to both server and client
configs. Production configs must omit the rule: the loader deliberately uses no
bundler mode APIs. Relative source paths expose project structure.

## Not covered yet

- Live runs: `@civic/canvas` supplies the run service for HTTP APIs and function backends (see its README). TanStack Start server functions are not covered.
- esbuild, Bun, Metro and Vite+ are not verified. See `docs/design/review-product/platform-adapters.md`.

## Checks

```sh
pnpm --filter @civic/vite-connector test
```

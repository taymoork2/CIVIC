// Build tooling (vite.config.ts) reads the environment; the app itself does not depend on @types/node.
declare const process: { env: Record<string, string | undefined> }

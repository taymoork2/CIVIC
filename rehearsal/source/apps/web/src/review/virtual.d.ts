/// <reference path="../../../../packages/canvas/src/virtual.d.ts" />
declare module 'virtual:rehearsal-laundry-routes' {
  export const routeTree: typeof import('../routeTree.gen').routeTree
}
declare module 'virtual:rehearsal-backend' {
  export const modules: Record<string, () => Promise<unknown>>
}
declare module 'convex-test' {
  export const convexTest: typeof import('../../../../convex/node_modules/convex-test/dist/index').convexTest
}

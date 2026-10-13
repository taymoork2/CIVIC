/// <reference path="../../../../../../packages/canvas/src/virtual.d.ts" />
declare module 'virtual:rehearsal-laundry-routes' {
  export const routeTree: typeof import('../routeTree.gen').routeTree
}
declare module 'virtual:rehearsal-backend' {
  export const modules: Record<string, () => Promise<unknown>>
}
declare module 'virtual:rehearsal-private-scope' {
  export const supported: boolean
  export function clearPendingStep(subject: string, receiptId: string): void
  export const PrivateScope: import('react').ComponentType<{ subject: string; householdId: string; children: import('react').ReactNode }>
}
declare module 'convex-test' {
  export type TestConvex<T extends import('convex/server').SchemaDefinition<any, boolean>> = import('../../../../convex/node_modules/convex-test/dist/index').TestConvex<T>
  export const convexTest: typeof import('../../../../convex/node_modules/convex-test/dist/index').convexTest
}

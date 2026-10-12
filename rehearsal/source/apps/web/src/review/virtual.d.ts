declare module 'virtual:rehearsal-project' {
  const project: import('./adapter').ProjectProfile
  export default project
}
declare module 'virtual:rehearsal-preview' {
  export const mount: import('./adapter').MountAdapter
}
declare module 'virtual:rehearsal-shell-style' {}
declare module 'virtual:rehearsal-laundry-routes' {
  export const routeTree: typeof import('../routeTree.gen').routeTree
}
declare module 'virtual:rehearsal-backend' {
  export const modules: Record<string, () => Promise<unknown>>
}
declare module 'convex-test' {
  export const convexTest: typeof import('../../../../convex/node_modules/convex-test/dist/index').convexTest
}

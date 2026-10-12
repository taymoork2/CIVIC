declare module 'virtual:rehearsal-project' {
  const project: import('./adapter').ProjectProfile
  export default project
}
declare module 'virtual:rehearsal-preview' {
  export const mount: import('./adapter').MountAdapter
}
declare module 'virtual:rehearsal-shell-style' {}

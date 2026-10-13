declare module 'virtual:civic-project' {
  const project: import('./adapter').ProjectProfile
  export default project
}
declare module 'virtual:civic-preview' {
  export const mount: import('./adapter').MountAdapter
}
declare module 'virtual:civic-shell-style' {}
declare module 'virtual:civic-canvas-extension' {
  const extension: import('./extension').CanvasExtension
  export default extension
}

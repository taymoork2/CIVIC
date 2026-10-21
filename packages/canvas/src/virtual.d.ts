declare module 'virtual:civic-project' {
  const project: import('./adapter').ProjectProfile
  export default project
}
declare module 'virtual:civic-preview' {
  export const mount: import('./adapter').MountAdapter
  export const setAppearance: undefined | ((appearance: Pick<import('./viewport-presets').PreviewAppearance, 'theme' | 'appTheme'>) => void | Promise<void>)
}
declare module 'virtual:civic-shell-style' {}
declare module 'virtual:civic-canvas-extension' {
  const extension: import('./extension').CanvasExtension
  export default extension
}

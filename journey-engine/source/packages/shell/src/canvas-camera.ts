export type Camera = { x: number; y: number; zoom: number }
export const panCamera = (camera: Camera, dx: number, dy: number): Camera => ({ ...camera, x: camera.x + dx, y: camera.y + dy })
export function containCamera(camera: Camera, viewport: { width: number; height: number }, world: { width: number; height: number }): Camera {
  const clamp = (offset: number, view: number, extent: number) => Math.max(Math.min(-240, view - extent * camera.zoom - 240), Math.min(Math.max(240, view - extent * camera.zoom + 240), offset))
  return { ...camera, x: clamp(camera.x, viewport.width, world.width), y: clamp(camera.y, viewport.height, world.height) }
}
export function zoomCamera(camera: Camera, zoom: number, point: { x: number; y: number }): Camera {
  return { zoom, x: point.x - (point.x - camera.x) / camera.zoom * zoom, y: point.y - (point.y - camera.y) / camera.zoom * zoom }
}

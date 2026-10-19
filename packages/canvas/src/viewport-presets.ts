/**
 * A live preview's viewport: CSS pixels, appearance and text size. `preset` names the device it imitates. These are
 * browser viewports, never evidence of a physical device, its hinge, browser engine or hardware.
 */
export type PreviewViewport = { width: number; height: number; theme: 'light' | 'dark'; textScale: 1 | 2; preset?: string }
export type ViewportPreset = { id: string; group: 'phone' | 'tablet' | 'desktop'; name: string; width: number; height: number }
// Named dimensions are CSS viewports from Playwright's device catalog; the fold pair is one device folded and open.
export const viewportPresets: readonly ViewportPreset[] = [
  { id: 'small-phone', group: 'phone', name: 'Small phone', width: 320, height: 658 },
  { id: 'phone', group: 'phone', name: 'Phone', width: 393, height: 852 },
  { id: 'iphone-16', group: 'phone', name: 'iPhone 16', width: 393, height: 659 },
  { id: 'iphone-16-pro', group: 'phone', name: 'iPhone 16 Pro', width: 402, height: 681 },
  { id: 'pixel-7', group: 'phone', name: 'Pixel 7', width: 412, height: 839 },
  { id: 'galaxy-s24', group: 'phone', name: 'Galaxy S24', width: 360, height: 780 },
  { id: 'tablet', group: 'tablet', name: 'Tablet / iPad Mini', width: 768, height: 1024 },
  { id: 'ipad-pro-11', group: 'tablet', name: 'iPad Pro 11', width: 834, height: 1194 },
  { id: 'desktop', group: 'desktop', name: 'Desktop', width: 1024, height: 768 },
  { id: 'wide-desktop', group: 'desktop', name: 'Wide desktop', width: 1440, height: 900 },
  { id: 'folded', group: 'phone', name: 'Galaxy Z Fold 7 cover', width: 360, height: 764 },
  { id: 'unfolded', group: 'tablet', name: 'Galaxy Z Fold 7 open', width: 984, height: 1016 },
]
export const defaultViewportHeight = 852

/** Match exact dimensions first, then rotation; desktop and tablet have swapped dimensions. */
export function presetOf(viewport: { width: number; height: number }) {
  return viewportPresets.find((p) => p.width === viewport.width && p.height === viewport.height)
    ?? viewportPresets.find((p) => p.width === viewport.height && p.height === viewport.width)
}
export function validViewport(value: unknown): value is PreviewViewport {
  const v = value as PreviewViewport
  return !!v && typeof v === 'object' && Number.isInteger(v.width) && Number.isInteger(v.height) && v.width >= 200 && v.width <= 1920 && v.height >= 200 && v.height <= 1600 && ['light', 'dark'].includes(v.theme) && [1, 2].includes(v.textScale)
    && (v.preset === undefined || viewportPresets.some((p) => p.id === v.preset)) && Object.keys(v).every((key) => ['width', 'height', 'theme', 'textScale', 'preset'].includes(key))
}

// The Fluent React v9 Button's component harness (decision 0013, point 1): CIVIC's code
// stories mount the real Button through it, as the canvas mounts an app screen. A story's
// `context.component` names the props: the variant's expression is the Button's `appearance`
// (contract/mappings.json), the `disabled` state sets `disabled`, and a story imported from
// Storybook adds its literal props for the declared extension points (shape, size, disabledFocusable).
//
// A story renders inside a <civic-story> shadow root, but Griffel, Fluent's styling engine,
// always writes its rules into the document's <head>. So the harness mirrors those rules into
// the shadow root as an adopted stylesheet, and the Button looks as it does in an app.
import { Button, createDOMRenderer, FluentProvider, RendererProvider, webLightTheme } from '@fluentui/react-components'
import { createRoot } from 'react-dom/client'

type Appearance = 'primary' | 'outline' | 'secondary' | 'subtle' | 'transparent'
const APPEARANCES: readonly string[] = ['primary', 'outline', 'secondary', 'subtle', 'transparent']

interface StoryContext {
  component?: { id: string; variant: string; expression: string; state?: string; props?: Record<string, string | number | boolean> }
}

export function mount(container: HTMLElement, context: StoryContext): () => void {
  const component = context.component
  if (!component) throw new Error('This harness mounts a component story: its context needs a component.')
  if (!APPEARANCES.includes(component.expression)) throw new Error(`Fluent's Button has no appearance "${component.expression}".`)
  const extra = Object.fromEntries(Object.entries(component.props ?? {}).filter(([name]) => ['shape', 'size', 'disabledFocusable'].includes(name)))
  const root = container.getRootNode()
  const sheet = new CSSStyleSheet()
  const mirror = () => {
    const rules = [...document.head.querySelectorAll<HTMLStyleElement>('style[data-make-styles-bucket], style[id^="fui-"]')].flatMap((style) => {
      try {
        return [...(style.sheet?.cssRules ?? [])].map((rule) => rule.cssText)
      } catch {
        return []
      }
    })
    sheet.replaceSync(rules.join('\n'))
  }
  let queued = false
  const later = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      mirror()
    })
  }
  if (root instanceof ShadowRoot) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
  const renderer = createDOMRenderer(document)
  const insert = renderer.insertCSSRules.bind(renderer)
  renderer.insertCSSRules = (rules) => {
    insert(rules)
    later()
  }
  const watcher = new MutationObserver(later)
  watcher.observe(document.head, { childList: true })

  const react = createRoot(container)
  react.render(
    <RendererProvider renderer={renderer}>
      <FluentProvider theme={webLightTheme} style={{ padding: 16, background: 'transparent' }}>
        <Button appearance={component.expression as Appearance} disabled={component.state === 'disabled'} {...extra} data-civic-component={component.id} data-civic-variant={component.variant} {...(component.state ? { 'data-civic-state': component.state } : {})}>
          {component.variant}
        </Button>
      </FluentProvider>
    </RendererProvider>,
  )
  later()
  return () => {
    watcher.disconnect()
    react.unmount()
    if (root instanceof ShadowRoot) root.adoptedStyleSheets = root.adoptedStyleSheets.filter((item) => item !== sheet)
  }
}

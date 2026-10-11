// Renders one Fluent React v9 Button per semantic variant the web mapping declares, so the
// Playwright checks exercise exactly what contract/mappings.json claims. Each button carries
// its CIVIC IDs in data attributes: the stable IDs a team puts in code (D31).
import { Button, FluentProvider, webLightTheme } from '@fluentui/react-components'
import { createRoot } from 'react-dom/client'
import mappings from '../../contract/mappings.json'

type Appearance = 'primary' | 'outline' | 'secondary' | 'subtle' | 'transparent'

const web = mappings.platforms.find((platform) => platform.platform === 'web')!
const mapped = Object.entries(web.variants).flatMap(([variant, mapping]) =>
  'expression' in mapping && mapping.expression ? [{ variant, appearance: mapping.expression as Appearance }] : [],
)

function Harness() {
  return (
    <FluentProvider theme={webLightTheme}>
      <main style={{ display: 'flex', gap: 12, padding: 24, flexWrap: 'wrap' }}>
        {mapped.map(({ variant, appearance }) => (
          <Button key={variant} appearance={appearance} data-civic-component={web.id} data-civic-variant={variant}>
            {variant}
          </Button>
        ))}
        <Button data-civic-state="default-appearance">No appearance</Button>
        <Button disabled data-civic-state="disabled">Disabled</Button>
        <Button disabledFocusable data-civic-state="disabled-focusable">Disabled focusable</Button>
      </main>
    </FluentProvider>
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)

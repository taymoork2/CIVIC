// Storybook for the Fluent Button demo. It builds Fluent's own Button stories, vendored from
// the React v9 repository at the same release as the vendored types (../../sources/sources.json),
// so the web evidence comes from the stories Fluent publishes, not from a CIVIC harness.
import type { StorybookConfig } from '@storybook/react-vite'
import { readFileSync } from 'node:fs'

const config: StorybookConfig = {
  stories: ['../../sources/react-button-stories/index.stories.tsx'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
  typescript: { reactDocgen: false },
  viteFinal: (vite) => ({
    ...vite,
    // Fluent's stories import their Markdown descriptions as strings, as its webpack build does.
    plugins: [...(vite.plugins ?? []), { name: 'civic-markdown-as-string', load: (id: string) => (id.endsWith('.md') ? `export default ${JSON.stringify(readFileSync(id, 'utf8'))}` : undefined) }],
    // The vendored stories sit outside this package, so resolve their imports from here.
    resolve: { ...vite.resolve, dedupe: ['react', 'react-dom', '@fluentui/react-components', '@fluentui/react-icons', '@fluentui/react-utilities'] },
  }),
}
export default config

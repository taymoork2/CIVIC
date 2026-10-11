// Fluent's own Storybook wraps every story in a FluentProvider with the web light theme, which
// defines the token CSS variables; this does the same so the stories render as Fluent publishes them.
import { FluentProvider, webLightTheme } from '@fluentui/react-components'
import type { Preview } from '@storybook/react'
import * as React from 'react'

const preview: Preview = {
  decorators: [(Story) => <FluentProvider theme={webLightTheme}><Story /></FluentProvider>],
}
export default preview

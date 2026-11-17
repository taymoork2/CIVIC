import { route, index, layout, prefix } from '@react-router/dev/routes'

export default [layout('shell.tsx', [route('api', 'api.tsx', [route('items/:id', 'item.tsx'), index('home.tsx')])]), ...prefix('v1', [route('health', 'health.tsx')])]

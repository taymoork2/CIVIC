import { route, layout, prefix } from '@react-router/dev/routes'

export default [
  layout('shell.tsx', [
    ...prefix('api', [
      route('items/:id', 'routes/api.items.$id.ts'),
    ]),
  ]),
]

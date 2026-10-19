import type { ReactNode } from 'react'
import { Toast } from '@base-ui/react/toast'
import { X } from '../icons'
import { Button } from './button'

export const notifications = Toast.createToastManager()

function Messages() {
  const { toasts } = Toast.useToastManager()
  return <Toast.Portal><Toast.Viewport className="civic-toasts" data-civic-ui="" aria-label="Notifications">{toasts.map(toast => <Toast.Root key={toast.id} toast={toast} className="civic-toast">
    <Toast.Content className="civic-toast-content"><Toast.Title className="civic-toast-title" /><Toast.Description className="civic-toast-description" /></Toast.Content>
    <Toast.Close render={<Button variant="ghost" size="icon" aria-label="Dismiss notification" />}><X aria-hidden="true" /></Toast.Close>
  </Toast.Root>)}</Toast.Viewport></Toast.Portal>
}

export function Notifications({ children }: { children: ReactNode }) {
  return <Toast.Provider toastManager={notifications} limit={1}>{children}<Messages /></Toast.Provider>
}

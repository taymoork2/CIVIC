import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

import { Button } from "@civic/shell/ui/button"
import { XIcon } from "lucide-react"

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      data-civic-ui=""
      className={cn(
        "cv:fixed cv:inset-0 cv:z-50 cv:bg-black/10 cv:transition-opacity cv:duration-150 cv:data-ending-style:opacity-0 cv:data-starting-style:opacity-0 cv:supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  portalProps,
  overlayProps,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  portalProps?: SheetPrimitive.Portal.Props
  overlayProps?: SheetPrimitive.Backdrop.Props
}) {
  return (
    <SheetPortal {...portalProps}>
      <SheetOverlay {...overlayProps} />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-civic-ui=""
        data-side={side}
        className={cn(
          "cv:fixed cv:z-50 cv:flex cv:flex-col cv:gap-4 cv:bg-popover cv:bg-clip-padding cv:text-sm cv:text-popover-foreground cv:shadow-lg cv:transition cv:duration-200 cv:ease-in-out cv:data-ending-style:opacity-0 cv:data-starting-style:opacity-0 cv:data-[side=bottom]:inset-x-0 cv:data-[side=bottom]:bottom-0 cv:data-[side=bottom]:h-auto cv:data-[side=bottom]:border-t cv:data-[side=bottom]:data-ending-style:translate-y-[2.5rem] cv:data-[side=bottom]:data-starting-style:translate-y-[2.5rem] cv:data-[side=left]:inset-y-0 cv:data-[side=left]:left-0 cv:data-[side=left]:h-full cv:data-[side=left]:w-3/4 cv:data-[side=left]:border-r cv:data-[side=left]:data-ending-style:translate-x-[-2.5rem] cv:data-[side=left]:data-starting-style:translate-x-[-2.5rem] cv:data-[side=right]:inset-y-0 cv:data-[side=right]:right-0 cv:data-[side=right]:h-full cv:data-[side=right]:w-3/4 cv:data-[side=right]:border-l cv:data-[side=right]:data-ending-style:translate-x-[2.5rem] cv:data-[side=right]:data-starting-style:translate-x-[2.5rem] cv:data-[side=top]:inset-x-0 cv:data-[side=top]:top-0 cv:data-[side=top]:h-auto cv:data-[side=top]:border-b cv:data-[side=top]:data-ending-style:translate-y-[-2.5rem] cv:data-[side=top]:data-starting-style:translate-y-[-2.5rem] cv:data-[side=left]:sm:max-w-sm cv:data-[side=right]:sm:max-w-sm",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="cv:absolute cv:top-3 cv:right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="cv:sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("cv:flex cv:flex-col cv:gap-0.5 cv:p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("cv:mt-auto cv:flex cv:flex-col cv:gap-2 cv:p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "cv:text-base cv:font-medium cv:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("cv:text-sm cv:text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}

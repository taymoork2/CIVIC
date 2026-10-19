"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

import { Button } from "@civic/shell/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
          data-civic-ui=""
      className={cn(
        "cv:fixed cv:inset-0 cv:isolate cv:z-50 cv:bg-black/10 cv:duration-100 cv:supports-backdrop-filter:backdrop-blur-xs cv:data-open:animate-in cv:data-open:fade-in-0 cv:data-closed:animate-out cv:data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
          data-civic-ui=""
        className={cn(
          "cv:fixed cv:top-1/2 cv:left-1/2 cv:z-50 cv:grid cv:w-full cv:max-w-[calc(100%-2rem)] cv:-translate-x-1/2 cv:-translate-y-1/2 cv:gap-4 cv:rounded-xl cv:bg-popover cv:p-4 cv:text-sm cv:text-popover-foreground cv:ring-1 cv:ring-foreground/10 cv:duration-100 cv:outline-none cv:sm:max-w-sm cv:data-open:animate-in cv:data-open:fade-in-0 cv:data-open:zoom-in-95 cv:data-closed:animate-out cv:data-closed:fade-out-0 cv:data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="cv:absolute cv:top-2 cv:right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="cv:sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("cv:flex cv:flex-col cv:gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "cv:-mx-4 cv:-mb-4 cv:flex cv:flex-col-reverse cv:gap-2 cv:rounded-b-xl cv:border-t cv:bg-muted/50 cv:p-4 cv:sm:flex-row cv:sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "cv:text-base cv:leading-none cv:font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "cv:text-sm cv:text-muted-foreground cv:*:[a]:underline cv:*:[a]:underline-offset-3 cv:*:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

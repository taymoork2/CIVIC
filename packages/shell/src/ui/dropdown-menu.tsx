import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { cn } from "cn"
import { ChevronRightIcon, CheckIcon } from "lucide-react"

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="cv:isolate cv:z-50 cv:outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          data-civic-ui=""
          className={cn("cv:z-50 cv:max-h-(--available-height) cv:w-(--anchor-width) cv:min-w-32 cv:origin-(--transform-origin) cv:overflow-x-hidden cv:overflow-y-auto cv:rounded-lg cv:bg-popover cv:p-1 cv:text-popover-foreground cv:shadow-md cv:ring-1 cv:ring-foreground/10 cv:duration-100 cv:outline-none cv:data-[side=bottom]:slide-in-from-top-2 cv:data-[side=inline-end]:slide-in-from-left-2 cv:data-[side=inline-start]:slide-in-from-right-2 cv:data-[side=left]:slide-in-from-right-2 cv:data-[side=right]:slide-in-from-left-2 cv:data-[side=top]:slide-in-from-bottom-2 cv:data-open:animate-in cv:data-open:fade-in-0 cv:data-open:zoom-in-95 cv:data-closed:animate-out cv:data-closed:overflow-hidden cv:data-closed:fade-out-0 cv:data-closed:zoom-out-95", className )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "cv:px-1.5 cv:py-1 cv:text-xs cv:font-medium cv:text-muted-foreground cv:data-inset:pl-7",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "cv:group/dropdown-menu-item cv:relative cv:flex cv:cursor-default cv:items-center cv:gap-1.5 cv:rounded-md cv:px-1.5 cv:py-1 cv:text-sm cv:outline-hidden cv:select-none cv:focus:bg-accent cv:focus:text-accent-foreground cv:not-data-[variant=destructive]:focus:**:text-accent-foreground cv:data-inset:pl-7 cv:data-[variant=destructive]:text-destructive cv:data-[variant=destructive]:focus:bg-destructive/10 cv:data-[variant=destructive]:focus:text-destructive cv:dark:data-[variant=destructive]:focus:bg-destructive/20 cv:data-disabled:pointer-events-none cv:data-disabled:opacity-50 cv:[&_svg]:pointer-events-none cv:[&_svg]:shrink-0 cv:[&_svg:not([class*=size-])]:size-4 cv:data-[variant=destructive]:*:[svg]:text-destructive",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "cv:flex cv:cursor-default cv:items-center cv:gap-1.5 cv:rounded-md cv:px-1.5 cv:py-1 cv:text-sm cv:outline-hidden cv:select-none cv:focus:bg-accent cv:focus:text-accent-foreground cv:not-data-[variant=destructive]:focus:**:text-accent-foreground cv:data-inset:pl-7 cv:data-popup-open:bg-accent cv:data-popup-open:text-accent-foreground cv:data-open:bg-accent cv:data-open:text-accent-foreground cv:[&_svg]:pointer-events-none cv:[&_svg]:shrink-0 cv:[&_svg:not([class*=size-])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="cv:ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      className={cn("cv:w-auto cv:min-w-[96px] cv:rounded-lg cv:bg-popover cv:p-1 cv:text-popover-foreground cv:shadow-lg cv:ring-1 cv:ring-foreground/10 cv:duration-100 cv:data-[side=bottom]:slide-in-from-top-2 cv:data-[side=left]:slide-in-from-right-2 cv:data-[side=right]:slide-in-from-left-2 cv:data-[side=top]:slide-in-from-bottom-2 cv:data-open:animate-in cv:data-open:fade-in-0 cv:data-open:zoom-in-95 cv:data-closed:animate-out cv:data-closed:fade-out-0 cv:data-closed:zoom-out-95", className )}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "cv:relative cv:flex cv:cursor-default cv:items-center cv:gap-1.5 cv:rounded-md cv:py-1 cv:pr-8 cv:pl-1.5 cv:text-sm cv:outline-hidden cv:select-none cv:focus:bg-accent cv:focus:text-accent-foreground cv:focus:**:text-accent-foreground cv:data-inset:pl-7 cv:data-disabled:pointer-events-none cv:data-disabled:opacity-50 cv:[&_svg]:pointer-events-none cv:[&_svg]:shrink-0 cv:[&_svg:not([class*=size-])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span
        className="cv:pointer-events-none cv:absolute cv:right-2 cv:flex cv:items-center cv:justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon
          />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "cv:relative cv:flex cv:cursor-default cv:items-center cv:gap-1.5 cv:rounded-md cv:py-1 cv:pr-8 cv:pl-1.5 cv:text-sm cv:outline-hidden cv:select-none cv:focus:bg-accent cv:focus:text-accent-foreground cv:focus:**:text-accent-foreground cv:data-inset:pl-7 cv:data-disabled:pointer-events-none cv:data-disabled:opacity-50 cv:[&_svg]:pointer-events-none cv:[&_svg]:shrink-0 cv:[&_svg:not([class*=size-])]:size-4",
        className
      )}
      {...props}
    >
      <span
        className="cv:pointer-events-none cv:absolute cv:right-2 cv:flex cv:items-center cv:justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon
          />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("cv:-mx-1 cv:my-1 cv:h-px cv:bg-border", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "cv:ml-auto cv:text-xs cv:tracking-widest cv:text-muted-foreground cv:group-focus/dropdown-menu-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}

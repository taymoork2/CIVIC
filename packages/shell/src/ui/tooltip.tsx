import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { cn } from "cn"

function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  )
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="cv:isolate cv:z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          data-civic-ui=""
          className={cn(
            "cv:z-50 cv:inline-flex cv:w-fit cv:max-w-xs cv:origin-(--transform-origin) cv:items-center cv:gap-1.5 cv:rounded-md cv:bg-foreground cv:px-3 cv:py-1.5 cv:text-xs cv:text-background cv:has-data-[slot=kbd]:pr-1.5 cv:data-[side=bottom]:slide-in-from-top-2 cv:data-[side=inline-end]:slide-in-from-left-2 cv:data-[side=inline-start]:slide-in-from-right-2 cv:data-[side=left]:slide-in-from-right-2 cv:data-[side=right]:slide-in-from-left-2 cv:data-[side=top]:slide-in-from-bottom-2 cv:**:data-[slot=kbd]:relative cv:**:data-[slot=kbd]:isolate cv:**:data-[slot=kbd]:z-50 cv:**:data-[slot=kbd]:rounded-sm cv:data-[state=delayed-open]:animate-in cv:data-[state=delayed-open]:fade-in-0 cv:data-[state=delayed-open]:zoom-in-95 cv:data-open:animate-in cv:data-open:fade-in-0 cv:data-open:zoom-in-95 cv:data-closed:animate-out cv:data-closed:fade-out-0 cv:data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="cv:z-50 cv:size-2.5 cv:translate-y-[calc(-50%-2px)] cv:rotate-45 cv:rounded-[2px] cv:bg-foreground cv:fill-foreground cv:data-[side=bottom]:top-1 cv:data-[side=inline-end]:top-1/2! cv:data-[side=inline-end]:-left-1 cv:data-[side=inline-end]:-translate-y-1/2 cv:data-[side=inline-start]:top-1/2! cv:data-[side=inline-start]:-right-1 cv:data-[side=inline-start]:-translate-y-1/2 cv:data-[side=left]:top-1/2! cv:data-[side=left]:-right-1 cv:data-[side=left]:-translate-y-1/2 cv:data-[side=right]:top-1/2! cv:data-[side=right]:-left-1 cv:data-[side=right]:-translate-y-1/2 cv:data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }

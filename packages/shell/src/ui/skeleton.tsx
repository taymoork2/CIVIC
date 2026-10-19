import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("cv:animate-pulse cv:rounded-md cv:bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }

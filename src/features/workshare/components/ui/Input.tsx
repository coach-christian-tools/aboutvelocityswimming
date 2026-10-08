import { forwardRef } from "react"
import type { InputHTMLAttributes } from "react"
import { cn } from "../../lib/utils"

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-[#13415D] placeholder:text-slate-400 focus-visible:outline-none focus-visible:border-[#0A856C] focus-visible:ring-2 focus-visible:ring-[#0A856C]/20 transition-all disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60",
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

